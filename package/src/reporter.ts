/**
 * vitest-agent-reporter
 *
 * {@link AgentReporter} class implementing the Vitest Reporter interface.
 * Produces structured markdown to console, persistent data to SQLite,
 * and optional GFM output for GitHub Actions check runs.
 *
 * @packageDocumentation
 */

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { FileSystem } from "@effect/platform";
import type { LogLevel } from "effect";
import { Effect, Option } from "effect";
import { resolveLogFile, resolveLogLevel } from "./layers/LoggerLive.js";
import { ReporterLive } from "./layers/ReporterLive.js";
import type { AgentReport } from "./schemas/AgentReport.js";
import type { CoverageBaselines } from "./schemas/Baselines.js";
import type { AgentReporterOptions } from "./schemas/Options.js";
import type { ResolvedThresholds } from "./schemas/Thresholds.js";
import { CoverageAnalyzer } from "./services/CoverageAnalyzer.js";
import { DataReader } from "./services/DataReader.js";
import { DataStore } from "./services/DataStore.js";
import { DetailResolver } from "./services/DetailResolver.js";
import { EnvironmentDetector } from "./services/EnvironmentDetector.js";
import { ExecutorResolver } from "./services/ExecutorResolver.js";
import { FormatSelector } from "./services/FormatSelector.js";
import type { TestOutcome } from "./services/HistoryTracker.js";
import { HistoryTracker } from "./services/HistoryTracker.js";
import { OutputRenderer } from "./services/OutputRenderer.js";
import type { VitestTestModule } from "./utils/build-report.js";
import { buildAgentReport } from "./utils/build-report.js";
import { captureEnvVars } from "./utils/capture-env.js";
import { captureSettings, hashSettings } from "./utils/capture-settings.js";
import { computeTrend } from "./utils/compute-trend.js";
import { formatGfm } from "./utils/format-gfm.js";
import { resolveThresholds } from "./utils/resolve-thresholds.js";
import { splitProject } from "./utils/split-project.js";

/**
 * Compute updated baselines using ratchet logic: take the max of actual vs previous,
 * capped by targets if set.
 *
 * @internal
 */
function computeUpdatedBaselines(
	existing: CoverageBaselines | undefined,
	actual: { statements: number; branches: number; functions: number; lines: number },
	targets: ResolvedThresholds | undefined,
): CoverageBaselines {
	const prev = existing?.global ?? {};
	const cap = targets?.global ?? {};

	const ratchet = (metric: "statements" | "branches" | "functions" | "lines"): number => {
		const actualVal = actual[metric];
		const prevVal = prev[metric] ?? 0;
		const targetVal = cap[metric];

		const newVal = Math.max(actualVal, prevVal);
		if (targetVal !== undefined && newVal > targetVal) {
			return targetVal;
		}
		return newVal;
	};

	return {
		updatedAt: new Date().toISOString(),
		global: {
			lines: ratchet("lines"),
			functions: ratchet("functions"),
			branches: ratchet("branches"),
			statements: ratchet("statements"),
		},
		patterns: existing?.patterns ?? [],
	};
}

/**
 * Fully resolved reporter options with all defaults applied.
 *
 * @internal
 */
interface ResolvedOptions {
	cacheDir: string;
	consoleOutput: "failures" | "full" | "silent";
	omitPassingTests: boolean;
	coverageThresholds: ResolvedThresholds;
	coverageTargets?: ResolvedThresholds;
	autoUpdate: boolean;
	coverageConsoleLimit: number;
	includeBareZero: boolean;
	githubActions: boolean | undefined;
	githubSummaryFile: string | undefined;
	format?: "markdown" | "json" | "vitest-bypass" | "silent";
	detail?: "minimal" | "neutral" | "standard" | "verbose";
	mode?: "auto" | "agent" | "silent";
	logLevel?: LogLevel.LogLevel;
	logFile?: string;
	mcp?: boolean;
	projectFilter?: string;
}

/**
 * Vitest Reporter that produces structured output for LLM coding agents.
 *
 * @remarks
 * `AgentReporter` implements three Vitest Reporter lifecycle hooks:
 *
 * - {@link AgentReporter.onInit | onInit} -- stores the Vitest instance
 *   for project enumeration (used in Phase 2 overview generation)
 * - {@link AgentReporter.onCoverage | onCoverage} -- stashes the istanbul
 *   CoverageMap for merging into reports
 * - {@link AgentReporter.onTestRunEnd | onTestRunEnd} -- groups test
 *   modules by project, builds reports, writes data to SQLite,
 *   updates the manifest, and emits console/GFM output
 *
 * The reporter handles both single-package repos and monorepos by grouping
 * results via Vitest's native `TestProject` API. In single-project mode,
 * results are written with project name "default".
 *
 * @privateRemarks
 * The `onCoverage` hook fires **before** `onTestRunEnd` in Vitest's lifecycle.
 * Coverage data must be stashed as instance state and merged during
 * `onTestRunEnd`. This ordering is a Vitest design constraint, not a bug.
 *
 * @example
 * ```typescript
 * import { AgentReporter } from "vitest-agent-reporter";
 * import { defineConfig } from "vitest/config";
 *
 * export default defineConfig({
 *   test: {
 *     reporters: [
 *       new AgentReporter({
 *         cacheDir: ".vitest-agent-reporter",
 *         consoleOutput: "failures",
 *         coverageThresholds: { global: { lines: 80 } },
 *       }),
 *     ],
 *   },
 * });
 * ```
 *
 * @see {@link AgentPlugin} for the convenience plugin wrapper
 * @see {@link AgentReporterOptions} for all configuration options
 * @see {@link https://vitest.dev/api/advanced/reporters.html | Vitest Reporter API}
 * @public
 */

export class AgentReporter {
	private options: ResolvedOptions;
	private dbPath: string;

	/**
	 * Stored Vitest instance from {@link AgentReporter.onInit | onInit}.
	 *
	 * @remarks
	 * Available for Phase 2 overview generation. Exposed as a public
	 * property (prefixed with `_`) for testing and extension purposes.
	 *
	 * @internal
	 */
	_vitest: unknown = null;
	private coverage: unknown = null;
	private logLevel: LogLevel.LogLevel | undefined;
	private logFile: string | undefined;

	constructor(options: AgentReporterOptions = {}) {
		this.logLevel = resolveLogLevel(options.logLevel);
		this.logFile = resolveLogFile(options.logFile);

		// coverageThresholds may be a raw Vitest format (Record<string, unknown>)
		// when AgentReporter is used directly without AgentPlugin. Resolve it.
		const rawThresholds = options.coverageThresholds as Record<string, unknown> | ResolvedThresholds | undefined;
		const resolvedThresholds: ResolvedThresholds =
			rawThresholds && "global" in rawThresholds
				? (rawThresholds as ResolvedThresholds)
				: resolveThresholds(rawThresholds);

		const rawTargets = options.coverageTargets as Record<string, unknown> | ResolvedThresholds | undefined;
		const resolvedTargets: ResolvedThresholds | undefined = rawTargets
			? "global" in rawTargets
				? (rawTargets as ResolvedThresholds)
				: resolveThresholds(rawTargets)
			: undefined;

		const cacheDir = options.cacheDir ?? ".vitest-agent-reporter";
		this.dbPath = `${cacheDir}/data.db`;

		const resolvedFormat = options.format ?? (options.consoleOutput === "silent" ? "silent" : undefined);
		const base: ResolvedOptions = {
			cacheDir,
			consoleOutput: options.consoleOutput ?? "failures",
			omitPassingTests: options.omitPassingTests ?? true,
			coverageThresholds: resolvedThresholds,
			autoUpdate: options.autoUpdate ?? true,
			coverageConsoleLimit: options.coverageConsoleLimit ?? 10,
			includeBareZero: options.includeBareZero ?? false,
			githubActions: options.githubActions,
			githubSummaryFile: options.githubSummaryFile,
			...(resolvedFormat !== undefined ? { format: resolvedFormat } : {}),
			...(options.detail !== undefined ? { detail: options.detail } : {}),
			...(options.mode !== undefined ? { mode: options.mode } : {}),
			...(options.mcp !== undefined ? { mcp: options.mcp } : {}),
			...(options.projectFilter !== undefined ? { projectFilter: options.projectFilter } : {}),
		};
		this.options = resolvedTargets ? { ...base, coverageTargets: resolvedTargets } : base;
	}

	/**
	 * Store the Vitest instance for project enumeration.
	 *
	 * @remarks
	 * Called once at the start of the test run. The instance is stored
	 * for Phase 2 overview generation via `vitest.projects`.
	 *
	 * @param vitest - The Vitest instance
	 */
	onInit(vitest: unknown): void {
		this._vitest = vitest;
	}

	/**
	 * Stash coverage data for merging into reports.
	 *
	 * @privateRemarks
	 * This hook fires **before** `onTestRunEnd` in Vitest's lifecycle.
	 * The coverage value is an istanbul CoverageMap that will be duck-typed
	 * and processed during `onTestRunEnd`.
	 *
	 * @param coverage - Istanbul CoverageMap (duck-typed at processing time)
	 *
	 * @see {@link processCoverage} for the duck-typing logic
	 */
	onCoverage(coverage: unknown): void {
		this.coverage = coverage;
	}

	/**
	 * Process test results, write reports, and emit formatted output.
	 *
	 * @remarks
	 * This is the main lifecycle hook where all output is generated.
	 * Processing steps:
	 *
	 * 1. Group test modules by `testModule.project.name`
	 * 2. Process stashed coverage data (if available)
	 * 3. Build per-project {@link AgentReport} objects
	 * 4. Classify tests via HistoryTracker and attach classifications
	 * 5. Write settings, run, modules, test cases, and errors to SQLite
	 * 6. Write per-test history entries
	 * 7. Write baselines and trends
	 * 8. Emit console markdown (unless `"silent"`)
	 * 9. Write GFM summary to `GITHUB_STEP_SUMMARY` (if GitHub Actions)
	 *
	 * File write failures are logged to stderr but do not crash the test run.
	 *
	 * @param testModules - All test modules from the completed run
	 * @param unhandledErrors - Any unhandled errors during the run
	 * @param reason - Overall outcome: `"passed"`, `"failed"`, or `"interrupted"`
	 */
	async onTestRunEnd(
		testModules: ReadonlyArray<unknown>,
		unhandledErrors: ReadonlyArray<unknown>,
		reason: "passed" | "failed" | "interrupted",
	): Promise<void> {
		const modules = testModules as ReadonlyArray<VitestTestModule>;
		const errors = unhandledErrors as ReadonlyArray<{ message: string; stack?: string }>;

		// Capture options for use inside Effect.gen
		const opts = this.options;
		const stashedCoverage = this.coverage;
		const stashedVitest = this._vitest;
		const dbPath = this.dbPath;
		const logLevel = this.logLevel;
		const logFile = this.logFile;

		// Filter modules to this reporter's project if projectFilter is set
		// (multi-project mode: each reporter instance handles its own project)
		const filteredModules = opts.projectFilter
			? modules.filter((m) => (m.project.name || "default") === opts.projectFilter)
			: modules;

		if (filteredModules.length === 0 && opts.projectFilter) {
			return;
		}

		// Ensure the parent directory for the SQLite DB exists
		mkdirSync(dirname(dbPath), { recursive: true });

		const program = Effect.gen(function* () {
			const store = yield* DataStore;
			const reader = yield* DataReader;
			const analyzer = yield* CoverageAnalyzer;
			const tracker = yield* HistoryTracker;

			// Generate invocation ID
			const invocationId = randomUUID();

			// Capture settings from the Vitest instance stored in onInit
			const vitest = stashedVitest as { config?: Record<string, unknown>; version?: string } | null;
			const vitestConfig = (vitest?.config ?? {}) as Record<string, unknown>;
			const vitestVersion = (vitest?.version as string) ?? "unknown";
			const settings = captureSettings(vitestConfig, vitestVersion);
			const settingsHash = hashSettings(settings as unknown as Record<string, unknown>);
			const envVars = captureEnvVars(process.env as Record<string, string | undefined>);

			// Write settings (idempotent -- INSERT OR IGNORE)
			yield* store.writeSettings(settingsHash, settings, envVars);

			// Group modules by project name
			const projectGroups = new Map<string, VitestTestModule[]>();
			for (const mod of filteredModules) {
				const name = mod.project.name;
				const key = name || "default";
				const existing = projectGroups.get(key);
				if (existing) {
					existing.push(mod);
				} else {
					projectGroups.set(key, [mod]);
				}
			}

			// Read existing baselines from DB
			const baselinesOpt = yield* reader
				.getBaselines("__global__", null)
				.pipe(Effect.catchAll(() => Effect.succeed(Option.none<CoverageBaselines>())));
			const baselines = Option.getOrUndefined(baselinesOpt);

			// Process coverage via service
			// In multi-project mode (projectFilter set), only the reporter with the
			// most test modules processes coverage to avoid duplicate output.
			// Coverage is global -- it doesn't belong to any single project.
			const projectModuleCounts = new Map<string, number>();
			for (const m of modules) {
				const key = m.project.name || "default";
				projectModuleCounts.set(key, (projectModuleCounts.get(key) ?? 0) + 1);
			}
			const primaryProject = Array.from(projectModuleCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
			const isFirstProject = !opts.projectFilter || opts.projectFilter === primaryProject;
			const coverageOpts = {
				thresholds: opts.coverageThresholds,
				includeBareZero: opts.includeBareZero,
				...(opts.coverageTargets ? { targets: opts.coverageTargets } : {}),
				...(baselines ? { baselines } : {}),
			} as const;
			const coverageResult =
				stashedCoverage && isFirstProject ? yield* analyzer.process(stashedCoverage, coverageOpts) : Option.none();
			const coverageReport = Option.getOrUndefined(coverageResult);

			// Build per-project reports
			// BUG FIX: Pass unhandledErrors to ALL projects, not just "default"
			const reports: AgentReport[] = [];
			// In multi-project mode (projectFilter set), always include project name
			const isMultiProject = projectGroups.size > 1 || !!opts.projectFilter;

			for (const [projectName, projectModules] of projectGroups) {
				const { project, subProject } = splitProject(projectName === "default" ? undefined : projectName);

				const baseReport = buildAgentReport(
					projectModules,
					errors,
					reason,
					{ omitPassingTests: opts.omitPassingTests },
					isMultiProject ? projectName : undefined,
				);

				// Compute total duration for the run
				let totalDuration = 0;
				for (const mod of projectModules) {
					totalDuration += mod.diagnostic().duration;
				}

				// Write test run to DB
				const runId = yield* store.writeRun({
					invocationId,
					project,
					subProject,
					settingsHash,
					timestamp: baseReport.timestamp,
					commitSha: process.env.GITHUB_SHA ?? null,
					branch: process.env.GITHUB_REF_NAME ?? null,
					reason,
					duration: totalDuration,
					total: baseReport.summary.total,
					passed: baseReport.summary.passed,
					failed: baseReport.summary.failed,
					skipped: baseReport.summary.skipped,
					scoped: false,
				});

				// Write modules and test cases to DB
				for (const mod of projectModules) {
					const fileId = yield* store.ensureFile(mod.relativeModuleId);

					const moduleIds = yield* store.writeModules(runId, [
						{
							fileId,
							relativeModuleId: mod.relativeModuleId,
							state: mod.state(),
							duration: mod.diagnostic().duration,
						},
					]);
					const moduleId = moduleIds[0];

					// Collect test cases for this module
					const testCases: Array<{
						name: string;
						fullName: string;
						state: string;
						duration?: number;
						flaky?: boolean;
						slow?: boolean;
					}> = [];
					for (const testCase of mod.children.allTests()) {
						const result = testCase.result();
						const diag = testCase.diagnostic();
						testCases.push({
							name: testCase.name,
							fullName: testCase.fullName,
							state: result.state,
							duration: diag.duration,
							flaky: diag.flaky,
							slow: diag.slow,
						});
					}

					const testCaseIds = yield* store.writeTestCases(
						moduleId,
						testCases.map((tc) => ({
							name: tc.name,
							fullName: tc.fullName,
							state: tc.state,
							...(tc.duration !== undefined && { duration: tc.duration }),
							...(tc.flaky !== undefined && { flaky: tc.flaky }),
							...(tc.slow !== undefined && { slow: tc.slow }),
						})),
					);

					// Write test errors for this module's test cases
					// Re-iterate tests to get errors (we need the IDs from writeTestCases)
					let testIdx = 0;
					for (const testCase of mod.children.allTests()) {
						const result = testCase.result();
						if (result.errors && result.errors.length > 0) {
							const testCaseId = testCaseIds[testIdx];
							yield* store.writeErrors(
								runId,
								result.errors.map((err, ordinal) => {
									const e = err as { message: string; diff?: string; stack?: string };
									return {
										testCaseId,
										scope: "test" as const,
										message: e.message,
										...(e.diff !== undefined && { diff: e.diff }),
										...(e.stack !== undefined && { stack: e.stack }),
										ordinal,
									};
								}),
							);
						}
						testIdx++;
					}

					// Write module-level errors
					const modErrors = mod.errors();
					if (modErrors.length > 0) {
						yield* store.writeErrors(
							runId,
							modErrors.map((err, ordinal) => {
								const e = err as { message: string; stack?: string };
								return {
									moduleId,
									scope: "module" as const,
									message: e.message,
									...(e.stack !== undefined && { stack: e.stack }),
									ordinal,
								};
							}),
						);
					}
				}

				// Write unhandled errors
				if (errors.length > 0) {
					yield* store.writeErrors(
						runId,
						errors.map((err, ordinal) => ({
							scope: "unhandled" as const,
							message: err.message,
							...(err.stack !== undefined && { stack: err.stack }),
							ordinal,
						})),
					);
				}

				// Extract test outcomes for history classification
				const testOutcomes: TestOutcome[] = [];
				for (const mod of projectModules) {
					for (const testCase of mod.children.allTests()) {
						const state = testCase.result().state;
						if (state === "passed" || state === "failed") {
							testOutcomes.push({ fullName: testCase.fullName, state });
						}
					}
				}

				// Classify tests via history and attach classifications to failed test reports
				const { classifications } = yield* tracker.classify(project, subProject, testOutcomes, baseReport.timestamp);

				// Build lookup maps for diagnostics and errors (avoids O(N²) nested loops)
				const diagMap = new Map<string, { duration?: number; flaky?: boolean }>();
				const errorMap = new Map<string, string | null>();
				for (const mod of projectModules) {
					for (const tc of mod.children.allTests()) {
						diagMap.set(tc.fullName, tc.diagnostic());
						if (tc.result().state === "failed") {
							const errors = tc.result().errors;
							errorMap.set(tc.fullName, errors?.[0]?.message ?? null);
						}
					}
				}

				// Write individual history entries to DB
				for (const outcome of testOutcomes) {
					const diag = diagMap.get(outcome.fullName);
					const errorMessage = outcome.state === "failed" ? (errorMap.get(outcome.fullName) ?? null) : null;

					yield* store.writeHistory(
						project,
						subProject,
						outcome.fullName,
						runId,
						baseReport.timestamp,
						outcome.state,
						diag?.duration ?? null,
						diag?.flaky ?? false,
						0,
						errorMessage,
					);
				}

				// Schema types are readonly -- rebuild failed array with classifications applied
				const failedWithClassifications = baseReport.failed.map((mod) => ({
					...mod,
					tests: mod.tests.map((test) => {
						const cls = classifications.get(test.fullName);
						return cls ? { ...test, classification: cls } : test;
					}),
				}));
				const classifiedReport: AgentReport = { ...baseReport, failed: failedWithClassifications };

				// NOTE: Coverage is global, not per-project. In monorepos, each project
				// report receives the same coverage data. Per-project filtering would
				// require path-based heuristics. See architecture doc "Trade-off:
				// Coverage Not Per-Project".
				const report: AgentReport = coverageReport
					? { ...classifiedReport, coverage: coverageReport }
					: classifiedReport;

				reports.push(report);

				// Write coverage data to DB if available
				if (coverageReport && coverageReport.lowCoverage.length > 0) {
					const coverageInputs = [];
					for (const fc of coverageReport.lowCoverage) {
						const fileId = yield* store.ensureFile(fc.file);
						coverageInputs.push({
							fileId,
							statements: fc.summary.statements,
							branches: fc.summary.branches,
							functions: fc.summary.functions,
							lines: fc.summary.lines,
							uncoveredLines: fc.uncoveredLines,
						});
					}
					yield* store.writeCoverage(runId, coverageInputs);
				}

				// Record coverage trend (full runs only)
				if (coverageReport && !coverageReport.scoped) {
					const existingTrends = yield* reader.getTrends(project, subProject).pipe(
						Effect.map((opt) => Option.getOrUndefined(opt)),
						Effect.catchAll(() => Effect.succeed(undefined)),
					);
					const updatedTrends = computeTrend(coverageReport.totals, existingTrends, opts.coverageTargets);
					// Write the latest trend entry
					const latestEntry = updatedTrends.entries[updatedTrends.entries.length - 1];
					if (latestEntry) {
						yield* store.writeTrends(project, subProject, runId, latestEntry);
					}
				}
			}

			// Write updated baselines if autoUpdate is enabled and coverage was processed
			if (opts.autoUpdate && coverageReport) {
				const newBaselines = computeUpdatedBaselines(baselines, coverageReport.totals, opts.coverageTargets);
				yield* store.writeBaselines(newBaselines);
			}

			// Build trend summary for output context (read back after writing)
			let trendSummary:
				| {
						direction: "improving" | "regressing" | "stable";
						runCount: number;
						firstMetric?: { name: string; from: number; to: number; target?: number };
				  }
				| undefined;
			if (coverageReport && !coverageReport.scoped) {
				const firstProjectKey = Array.from(projectGroups.keys())[0];
				if (firstProjectKey) {
					const { project: tp, subProject: tsp } = splitProject(
						firstProjectKey === "default" ? undefined : firstProjectKey,
					);
					const trendsOpt = yield* reader.getTrends(tp, tsp).pipe(Effect.catchAll(() => Effect.succeed(Option.none())));
					if (Option.isSome(trendsOpt)) {
						const entries = trendsOpt.value.entries;
						if (entries.length >= 2) {
							const latest = entries[entries.length - 1];
							const prev = entries[entries.length - 2];
							const direction = latest.direction as "improving" | "regressing" | "stable";
							const metrics = ["lines", "functions", "branches", "statements"] as const;
							let firstMetric: { name: string; from: number; to: number; target?: number } | undefined;
							for (const m of metrics) {
								const from = prev.coverage[m];
								const to = latest.coverage[m];
								if (from !== to) {
									const target = opts.coverageTargets?.global?.[m];
									firstMetric = { name: m, from, to, ...(target !== undefined ? { target } : {}) };
									break;
								}
							}
							trendSummary = { direction, runCount: entries.length, ...(firstMetric ? { firstMetric } : {}) };
						}
					}
				}
			}

			yield* Effect.logInfo("reports built").pipe(
				Effect.annotateLogs({ count: reports.length, projects: Array.from(projectGroups.keys()).join(", ") }),
			);

			// Output via pipeline services
			const detector = yield* EnvironmentDetector;
			const executorResolver = yield* ExecutorResolver;
			const formatSelector = yield* FormatSelector;
			const detailResolver = yield* DetailResolver;
			const renderer = yield* OutputRenderer;

			const env = yield* detector.detect();
			const executor = yield* executorResolver.resolve(env, opts.mode ?? "auto");
			const format = yield* formatSelector.select(executor, opts.format);
			const health = {
				hasFailures: reports.some((r) => r.summary.failed > 0 || r.unhandledErrors.length > 0),
				belowTargets: reports.some((r) => {
					const cov = r.coverage as { belowTarget?: unknown[] } | undefined;
					return (cov?.belowTarget?.length ?? 0) > 0;
				}),
				hasTargets: !!opts.coverageTargets,
			};
			const detail = yield* detailResolver.resolve(executor, health, opts.detail);

			// Build formatter context
			const githubSummaryFile = opts.githubSummaryFile ?? process.env.GITHUB_STEP_SUMMARY;
			const context: import("./formatters/types.js").FormatterContext = {
				detail,
				noColor: !!process.env.NO_COLOR,
				coverageConsoleLimit: opts.coverageConsoleLimit,
				...(githubSummaryFile !== undefined ? { githubSummaryFile } : {}),
				...(opts.mcp !== undefined ? { mcp: opts.mcp } : {}),
				...(trendSummary !== undefined ? { trendSummary } : {}),
			};

			yield* Effect.logDebug("pipeline resolved").pipe(Effect.annotateLogs({ env, executor, format, detail }));

			// Render primary format to stdout
			const pipelineOutputs = yield* renderer.render(reports, format, context);
			yield* Effect.logDebug("pipeline rendered").pipe(Effect.annotateLogs({ outputs: pipelineOutputs.length }));
			for (const output of pipelineOutputs) {
				if (output.target === "stdout") {
					process.stdout.write(`${output.content}\n`);
				} else if (output.target === "github-summary") {
					const summaryFile = opts.githubSummaryFile ?? process.env.GITHUB_STEP_SUMMARY;
					if (summaryFile) {
						const fs = yield* FileSystem.FileSystem;
						yield* fs
							.writeFileString(summaryFile, output.content, { flag: "a" })
							.pipe(Effect.catchAll(() => Effect.void));
					}
				}
			}

			// Write GFM to GITHUB_STEP_SUMMARY when in ci-github environment
			// (unless format is vitest-bypass/silent, meaning Vitest handles GFM)
			const shouldWriteGfm =
				opts.githubActions === true ||
				(opts.githubActions !== false && env === "ci-github" && format !== "silent" && format !== "vitest-bypass");
			if (shouldWriteGfm) {
				const summaryFile = opts.githubSummaryFile ?? process.env.GITHUB_STEP_SUMMARY;
				if (summaryFile) {
					const fs = yield* FileSystem.FileSystem;
					const gfm = formatGfm(reports);
					yield* fs.writeFileString(summaryFile, gfm, { flag: "a" }).pipe(Effect.catchAll(() => Effect.void));
				}
			}
		});

		await Effect.runPromise(
			program.pipe(Effect.annotateLogs("service", "reporter"), Effect.provide(ReporterLive(dbPath, logLevel, logFile))),
		).catch((err) => {
			// Extract meaningful error details from Effect FiberFailure
			const fiberFailureCauseKey = Symbol.for("effect/Runtime/FiberFailure/Cause");
			const cause = (err as Record<symbol, unknown>)[fiberFailureCauseKey];
			let detail = String(err);
			if (cause && typeof cause === "object") {
				const failure = cause as {
					_tag?: string;
					error?: { _tag?: string; operation?: string; table?: string; reason?: string };
				};
				if (failure.error) {
					const e = failure.error;
					detail = `${e._tag ?? "Error"}: ${e.operation ?? "?"} on ${e.table ?? "?"} -- ${e.reason ?? "unknown"}`;
				} else {
					// Try to stringify the full cause for other error types
					try {
						detail = JSON.stringify(cause, null, 2);
					} catch {
						// keep default String(err)
					}
				}
			}
			process.stderr.write(`vitest-agent-reporter: ${detail}\n`);
		});
	}
}
