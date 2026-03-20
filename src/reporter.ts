/**
 * vitest-agent-reporter
 *
 * {@link AgentReporter} class implementing the Vitest Reporter interface.
 * Produces structured markdown to console, persistent JSON to disk,
 * and optional GFM output for GitHub Actions check runs.
 *
 * @packageDocumentation
 */

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { processCoverage } from "./coverage.js";
import { formatConsoleMarkdown, relativePath } from "./formatters/console.js";
import { formatGfm } from "./formatters/gfm.js";
import type { VitestTestModule } from "./formatters/json.js";
import { buildAgentReport } from "./formatters/json.js";
import { AgentReportCodec, CacheManifestCodec } from "./schemas.js";
import type { AgentReport, AgentReporterOptions, CacheManifest, CacheManifestEntry, CoverageReport } from "./types.js";
import { isGitHubActions, safeFilename } from "./utils.js";

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
	 * 5. Write per-project JSON files to `reports/` subdirectory
	 * 6. Write/update `manifest.json` at cache root
	 * 7. Emit console markdown (unless `"silent"`)
	 * 8. Write GFM summary to `GITHUB_STEP_SUMMARY` (if GitHub Actions)
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

		// Ensure cache directory structure
		const reportsDir = join(this.options.cacheDir, "reports");
		await mkdir(reportsDir, { recursive: true });

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

		// Process coverage if stashed
		let coverageReport: CoverageReport | undefined;
		if (this.coverage) {
			coverageReport = processCoverage(this.coverage, {
				threshold: this.options.coverageThreshold,
				includeBareZero: this.options.includeBareZero,
			});
		}

		// Build per-project reports
		const reports: AgentReport[] = [];
		const manifestEntries: CacheManifestEntry[] = [];
		const isMultiProject = projectGroups.size > 1;

		for (const [projectName, modules] of projectGroups) {
			const report = buildAgentReport(
				modules,
				projectName === "default" ? errors : [],
				reason,
				{ omitPassingTests: this.options.omitPassingTests },
				isMultiProject ? projectName : undefined,
			);

			// NOTE: Coverage is global, not per-project. In monorepos, each project
			// report receives the same coverage data. Per-project filtering would
			// require path-based heuristics. See architecture doc "Trade-off:
			// Coverage Not Per-Project".
			if (coverageReport) {
				report.coverage = coverageReport;
			}

			reports.push(report);

			const filename = `${safeFilename(projectName)}.json`;
			const reportPath = join(reportsDir, filename);
			try {
				await writeFile(reportPath, AgentReportCodec.encode(report));
			} catch (err) {
				console.error(`[vitest-agent-reporter] Failed to write ${reportPath}:`, err);
			}

			manifestEntries.push({
				project: projectName,
				reportFile: `reports/${filename}`,
				lastRun: report.timestamp,
				lastResult: report.reason,
			});
		}

		// Write manifest
		const manifest: CacheManifest = {
			updatedAt: new Date().toISOString(),
			cacheDir: this.options.cacheDir,
			projects: manifestEntries,
		};
		try {
			await writeFile(join(this.options.cacheDir, "manifest.json"), CacheManifestCodec.encode(manifest));
		} catch (err) {
			console.error("[vitest-agent-reporter] Failed to write manifest:", err);
		}

		// Console output
		if (this.options.consoleOutput !== "silent") {
			const noColor = !!process.env.NO_COLOR;
			for (const [i, report] of reports.entries()) {
				const entry = manifestEntries[i];
				const formatOptions: Parameters<typeof formatConsoleMarkdown>[1] = {
					consoleOutput: this.options.consoleOutput,
					coverageConsoleLimit: this.options.coverageConsoleLimit,
					noColor,
				};
				if (entry) {
					formatOptions.cacheFile = relativePath(`${this.options.cacheDir}/${entry.reportFile}`);
				}
				const md = formatConsoleMarkdown(report, formatOptions);
				if (md) process.stdout.write(`${md}\n`);
			}
		}

		// GFM output for GitHub Actions
		const useGfm = this.options.githubActions ?? isGitHubActions();
		if (useGfm) {
			const summaryFile = this.options.githubSummaryFile ?? process.env.GITHUB_STEP_SUMMARY;
			if (summaryFile) {
				const gfm = formatGfm(reports);
				try {
					await appendFile(summaryFile, gfm);
				} catch (err) {
					console.error("[vitest-agent-reporter] Failed to write GITHUB_STEP_SUMMARY:", err);
				}
			}
		}
	}
}
