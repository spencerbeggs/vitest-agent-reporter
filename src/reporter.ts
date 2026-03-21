/**
 * vitest-agent-reporter
 *
 * {@link AgentReporter} class implementing the Vitest Reporter interface.
 * Produces structured markdown to console, persistent JSON to disk,
 * and optional GFM output for GitHub Actions check runs.
 *
 * @packageDocumentation
 */

import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import { ReporterLive } from "./layers/ReporterLive.js";
import type { AgentReport } from "./schemas/AgentReport.js";
import type { CacheManifestEntry } from "./schemas/CacheManifest.js";
import type { AgentReporterOptions } from "./schemas/Options.js";
import { CacheWriter } from "./services/CacheWriter.js";
import { CoverageAnalyzer } from "./services/CoverageAnalyzer.js";
import type { TestOutcome } from "./services/HistoryTracker.js";
import { HistoryTracker } from "./services/HistoryTracker.js";
import type { VitestTestModule } from "./utils/build-report.js";
import { buildAgentReport } from "./utils/build-report.js";
import { formatConsoleMarkdown, relativePath } from "./utils/format-console.js";
import { formatGfm } from "./utils/format-gfm.js";
import { safeFilename } from "./utils/safe-filename.js";

/**
 * Check if running in GitHub Actions.
 */
function isGitHubActions(): boolean {
	return process.env.GITHUB_ACTIONS === "true" || process.env.GITHUB_ACTIONS === "1";
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
	coverageThreshold: number;
	coverageConsoleLimit: number;
	includeBareZero: boolean;
	githubActions: boolean | undefined;
	githubSummaryFile: string | undefined;
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
 *   modules by project, builds reports, writes JSON cache files,
 *   updates the manifest, and emits console/GFM output
 *
 * The reporter handles both single-package repos and monorepos by grouping
 * results via Vitest's native `TestProject` API. In single-project mode,
 * results are written to `reports/default.json`.
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
 *         coverageThreshold: 80,
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

	constructor(options: AgentReporterOptions = {}) {
		this.options = {
			cacheDir: options.cacheDir ?? ".vitest-agent-reporter",
			consoleOutput: options.consoleOutput ?? "failures",
			omitPassingTests: options.omitPassingTests ?? true,
			coverageThreshold: options.coverageThreshold ?? 0,
			coverageConsoleLimit: options.coverageConsoleLimit ?? 10,
			includeBareZero: options.includeBareZero ?? false,
			githubActions: options.githubActions,
			githubSummaryFile: options.githubSummaryFile,
		};
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
	 * 1. Ensure cache directory structure exists
	 * 2. Group test modules by `testModule.project.name`
	 * 3. Process stashed coverage data (if available)
	 * 4. Build per-project {@link AgentReport} objects
	 * 5. Classify tests via HistoryTracker and attach classifications
	 * 6. Write per-project JSON files to `reports/` subdirectory
	 * 7. Write per-project history files to `history/` subdirectory
	 * 8. Write/update `manifest.json` at cache root
	 * 9. Emit console markdown (unless `"silent"`)
	 * 10. Write GFM summary to `GITHUB_STEP_SUMMARY` (if GitHub Actions)
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
		const errors = unhandledErrors as ReadonlyArray<{ message: string; stacks?: string[] }>;

		// Capture options for use inside Effect.gen
		const opts = this.options;
		const stashedCoverage = this.coverage;

		const program = Effect.gen(function* () {
			const writer = yield* CacheWriter;
			const analyzer = yield* CoverageAnalyzer;
			const tracker = yield* HistoryTracker;

			// Ensure cache directory structure
			yield* writer.ensureDir(`${opts.cacheDir}/reports`);
			yield* writer.ensureDir(`${opts.cacheDir}/history`);

			// Group modules by project name
			const projectGroups = new Map<string, VitestTestModule[]>();
			for (const mod of modules) {
				const name = mod.project.name;
				const key = name || "default";
				const existing = projectGroups.get(key);
				if (existing) {
					existing.push(mod);
				} else {
					projectGroups.set(key, [mod]);
				}
			}

			// Process coverage via service
			const coverageResult = stashedCoverage
				? yield* analyzer.process(stashedCoverage, {
						threshold: opts.coverageThreshold,
						includeBareZero: opts.includeBareZero,
					})
				: Option.none();
			const coverageReport = Option.getOrUndefined(coverageResult);

			// Build per-project reports
			// BUG FIX: Pass unhandledErrors to ALL projects, not just "default"
			const reports: AgentReport[] = [];
			const manifestEntries: CacheManifestEntry[] = [];
			const isMultiProject = projectGroups.size > 1;

			for (const [projectName, projectModules] of projectGroups) {
				const baseReport = buildAgentReport(
					projectModules,
					errors,
					reason,
					{ omitPassingTests: opts.omitPassingTests },
					isMultiProject ? projectName : undefined,
				);

				// Extract test outcomes for history classification (separate generator iteration)
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
				const { history, classifications } = yield* tracker.classify(
					opts.cacheDir,
					projectName,
					testOutcomes,
					baseReport.timestamp,
				);

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

				// Write report via service
				yield* writer.writeReport(opts.cacheDir, projectName, report);

				// Write history via service
				yield* writer.writeHistory(opts.cacheDir, projectName, history);

				const filename = `${safeFilename(projectName)}.json`;
				manifestEntries.push({
					project: projectName,
					reportFile: `reports/${filename}`,
					historyFile: `history/${safeFilename(projectName)}.history.json`,
					lastRun: report.timestamp,
					lastResult: report.reason,
				});
			}

			// Write manifest via service
			const manifest = {
				updatedAt: new Date().toISOString(),
				cacheDir: opts.cacheDir,
				projects: manifestEntries,
			};
			yield* writer.writeManifest(opts.cacheDir, manifest);

			// Console output (direct, not via service -- pure function)
			if (opts.consoleOutput !== "silent") {
				const noColor = !!process.env.NO_COLOR;
				for (const [i, report] of reports.entries()) {
					const entry = manifestEntries[i];
					const formatOptions: Parameters<typeof formatConsoleMarkdown>[1] = {
						consoleOutput: opts.consoleOutput,
						coverageConsoleLimit: opts.coverageConsoleLimit,
						noColor,
					};
					if (entry) {
						formatOptions.cacheFile = relativePath(`${opts.cacheDir}/${entry.reportFile}`);
					}
					const md = formatConsoleMarkdown(report, formatOptions);
					if (md) process.stdout.write(`${md}\n`);
				}
			}

			// GFM output via FileSystem service
			const useGfm = opts.githubActions ?? isGitHubActions();
			if (useGfm) {
				const summaryFile = opts.githubSummaryFile ?? process.env.GITHUB_STEP_SUMMARY;
				if (summaryFile) {
					const fs = yield* FileSystem.FileSystem;
					const gfm = formatGfm(reports);
					yield* fs.writeFileString(summaryFile, gfm, { flag: "a" }).pipe(Effect.catchAll(() => Effect.void));
				}
			}
		});

		await Effect.runPromise(program.pipe(Effect.provide(ReporterLive))).catch((err) => {
			process.stderr.write(`vitest-agent-reporter: ${err}\n`);
		});
	}
}
