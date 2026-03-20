/**
 * vitest-agent-reporter
 *
 * Zod schemas and codecs for all data structures.
 * Types are inferred from schemas via `z.infer<>` in `./types.ts`.
 *
 * @see types.ts for the inferred TypeScript types.
 *
 * @packageDocumentation
 */

import { z } from "zod/v4";

// --- Shared Enums ---

/**
 * Possible states for an individual test case.
 *
 * @public
 */
export const TestStateSchema = z.enum(["passed", "failed", "skipped", "pending"]);

/**
 * Overall outcome of a test run.
 *
 * @public
 */
export const TestRunReasonSchema = z.enum(["passed", "failed", "interrupted"]);

/**
 * Classification of a test's failure history across runs (Phase 3).
 *
 * - `stable` -- consistently passing
 * - `new-failure` -- first failure in recent history
 * - `persistent` -- failing across multiple runs
 * - `flaky` -- intermittent pass/fail pattern
 * - `recovered` -- was failing, now passing
 *
 * @public
 */
export const TestClassificationSchema = z.enum(["stable", "new-failure", "persistent", "flaky", "recovered"]);

/**
 * Console output verbosity mode for {@link AgentReporter}.
 *
 * - `failures` -- only failed modules and coverage summary
 * - `full` -- all modules including passing tests
 * - `silent` -- no console output (JSON only)
 *
 * @public
 */
export const ConsoleOutputModeSchema = z.enum(["failures", "full", "silent"]);

/**
 * Mode for the {@link AgentPlugin} environment detection.
 *
 * - `auto` -- detect environment from env vars (agent, CI, or human)
 * - `agent` -- force agent mode (suppress built-in reporters, show markdown)
 * - `silent` -- force silent mode (cache/JSON only)
 *
 * @public
 */
export const PluginModeSchema = z.enum(["auto", "agent", "silent"]);

/**
 * Supported package managers for run command generation.
 *
 * @see detectPackageManager in detect-pm.ts
 * @public
 */
export const PackageManagerSchema = z.enum(["pnpm", "npm", "yarn", "bun"]);

// --- Report Error ---

/**
 * Schema for a single test or module error with optional stack trace and diff.
 *
 * @remarks
 * The `diff` field contains expected/received comparison output from Vitest's
 * assertion library, useful for LLM agents diagnosing test failures.
 *
 * @public
 */
export const ReportErrorSchema = z.object({
	message: z.string(),
	stack: z.string().optional(),
	diff: z.string().optional(),
});

// --- Test Report ---

/**
 * Schema for an individual test case result.
 *
 * @remarks
 * The `flaky` and `slow` flags come from Vitest's `TestCase.diagnostic()` method.
 * A test is marked flaky if it passed after one or more retries. The `slow` flag
 * is set when the test exceeds Vitest's `slowTestThreshold`.
 *
 * @public
 */
export const TestReportSchema = z.object({
	name: z.string(),
	fullName: z.string(),
	state: TestStateSchema,
	duration: z.number().optional(),
	flaky: z.boolean().optional(),
	slow: z.boolean().optional(),
	errors: z.array(ReportErrorSchema).optional(),
	/** Phase 3: failure classification. */
	classification: TestClassificationSchema.optional(),
});

// --- Module Report ---

/**
 * Schema for a test module (file) and its contained test cases.
 *
 * @remarks
 * The `file` field is a project-relative path (e.g., `src/utils.test.ts`).
 * Module-level errors are separate from per-test errors and represent
 * issues like syntax errors or top-level exceptions.
 *
 * @public
 */
export const ModuleReportSchema = z.object({
	file: z.string(),
	state: TestStateSchema,
	duration: z.number().optional(),
	errors: z.array(ReportErrorSchema).optional(),
	tests: z.array(TestReportSchema),
});

// --- Coverage ---

/**
 * Schema for aggregate coverage percentages across four istanbul metrics.
 *
 * @public
 */
export const CoverageTotalsSchema = z.object({
	statements: z.number(),
	branches: z.number(),
	functions: z.number(),
	lines: z.number(),
});

/**
 * Schema for per-file coverage data including uncovered line ranges.
 *
 * @remarks
 * The `uncoveredLines` field uses compressed range notation (e.g., `"1-3,5,10-12"`)
 * produced by {@link ../utils.ts#compressLines | compressLines}.
 *
 * @public
 */
export const FileCoverageReportSchema = z.object({
	file: z.string(),
	summary: CoverageTotalsSchema,
	uncoveredLines: z.string(),
});

/**
 * Schema for the complete coverage report attached to an {@link AgentReportSchema}.
 *
 * @remarks
 * Only files below the configured `threshold` appear in `lowCoverage`.
 * Files are sorted worst-first by line coverage percentage.
 *
 * @public
 */
export const CoverageReportSchema = z.object({
	totals: CoverageTotalsSchema,
	threshold: z.number(),
	lowCoverage: z.array(FileCoverageReportSchema),
	lowCoverageFiles: z.array(z.string()),
});

// --- Report Summary ---

/**
 * Schema for aggregate test run statistics.
 *
 * @remarks
 * The `duration` field is wall-clock milliseconds for the entire run,
 * summed from individual module durations.
 *
 * @public
 */
export const ReportSummarySchema = z.object({
	total: z.number(),
	passed: z.number(),
	failed: z.number(),
	skipped: z.number(),
	duration: z.number(),
});

// --- Agent Report ---

/**
 * Schema for the complete per-project test report written to disk as JSON.
 *
 * @remarks
 * The `project` field is only present in monorepo configurations where
 * multiple Vitest projects are defined. The `failed` array contains only
 * modules that have at least one failing test, keeping reports compact.
 *
 * @see {@link AgentReportCodec} for JSON string encode/decode.
 * @public
 */
export const AgentReportSchema = z.object({
	timestamp: z.string(),
	project: z.string().optional(),
	reason: TestRunReasonSchema,
	summary: ReportSummarySchema,
	failed: z.array(ModuleReportSchema),
	unhandledErrors: z.array(ReportErrorSchema),
	failedFiles: z.array(z.string()),
	coverage: CoverageReportSchema.optional(),
});

// --- Agent Report Codec (JSON string <-> AgentReport) ---

/**
 * Codec for encoding/decoding {@link AgentReportSchema | AgentReport} to/from JSON strings.
 *
 * @remarks
 * Uses Zod v4's `z.codec()` to provide bidirectional transformation between
 * JSON strings on disk and validated `AgentReport` objects.
 *
 * @example
 * ```typescript
 * import { AgentReportCodec } from "vitest-agent-reporter";
 * import type { AgentReport } from "vitest-agent-reporter";
 *
 * // Encode a report to a JSON string
 * const report: AgentReport = {
 *   timestamp: new Date().toISOString(),
 *   reason: "passed",
 *   summary: { total: 5, passed: 5, failed: 0, skipped: 0, duration: 120 },
 *   failed: [],
 *   unhandledErrors: [],
 *   failedFiles: [],
 * };
 * const jsonString: string = AgentReportCodec.encode(report);
 *
 * // Decode a JSON string to a validated AgentReport
 * const decoded: AgentReport = AgentReportCodec.decode(jsonString);
 * ```
 *
 * @public
 */
export const AgentReportCodec = z.codec(z.string(), AgentReportSchema, {
	decode: (jsonString, ctx) => {
		try {
			return JSON.parse(jsonString) as z.infer<typeof AgentReportSchema>;
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Invalid JSON";
			ctx.issues.push({
				code: "custom",
				input: jsonString,
				message,
				path: [],
			});
			return z.NEVER;
		}
	},
	encode: (report) => JSON.stringify(report, null, 2),
});

// --- Cache Manifest ---

/**
 * Schema for a single project entry in the cache manifest.
 *
 * @remarks
 * The `reportFile` path is relative to the cache directory root
 * (e.g., `"reports/core.json"`). The `lastRun` and `lastResult` fields
 * are null before the project's first test run.
 *
 * @internal
 */
export const CacheManifestEntrySchema = z.object({
	project: z.string(),
	reportFile: z.string(),
	historyFile: z.string().optional(),
	lastRun: z.string().nullable(),
	lastResult: TestRunReasonSchema.nullable(),
});

/**
 * Schema for the root manifest file that indexes all project reports.
 *
 * @remarks
 * Agents read the manifest once to discover which projects have failing
 * tests, then selectively read only those report files. This avoids
 * scanning the cache directory.
 *
 * @see {@link CacheManifestCodec} for JSON string encode/decode.
 * @public
 */
export const CacheManifestSchema = z.object({
	updatedAt: z.string(),
	cacheDir: z.string(),
	projects: z.array(CacheManifestEntrySchema),
});

// --- Cache Manifest Codec (JSON string <-> CacheManifest) ---

/**
 * Codec for encoding/decoding {@link CacheManifestSchema | CacheManifest} to/from JSON strings.
 *
 * @remarks
 * Used internally by {@link AgentReporter} to read and write `manifest.json`.
 *
 * @example
 * ```typescript
 * import { CacheManifestCodec } from "vitest-agent-reporter";
 * import type { CacheManifest } from "vitest-agent-reporter";
 *
 * const manifest: CacheManifest = {
 *   updatedAt: new Date().toISOString(),
 *   cacheDir: ".vitest-agent-reporter",
 *   projects: [
 *     {
 *       project: "default",
 *       reportFile: "reports/default.json",
 *       lastRun: new Date().toISOString(),
 *       lastResult: "passed",
 *     },
 *   ],
 * };
 * const jsonString: string = CacheManifestCodec.encode(manifest);
 * ```
 *
 * @public
 */
export const CacheManifestCodec = z.codec(z.string(), CacheManifestSchema, {
	decode: (jsonString, ctx) => {
		try {
			return JSON.parse(jsonString) as z.infer<typeof CacheManifestSchema>;
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Invalid JSON";
			ctx.issues.push({
				code: "custom",
				input: jsonString,
				message,
				path: [],
			});
			return z.NEVER;
		}
	},
	encode: (manifest) => JSON.stringify(manifest, null, 2),
});

// --- Reporter Options ---

/**
 * Schema for {@link AgentReporter} configuration options.
 *
 * @remarks
 * All fields are optional with sensible defaults:
 * - `cacheDir` -- derived from Vite's cacheDir when using the plugin, or `".vitest-agent-reporter"` standalone
 * - `consoleOutput` -- `"failures"` (show only failed tests)
 * - `omitPassingTests` -- `true` (exclude passing tests from JSON reports)
 * - `coverageThreshold` -- `0` (no threshold; flag no files)
 * - `coverageConsoleLimit` -- `10` (max low-coverage files shown in console)
 * - `includeBareZero` -- `false` (skip files with all metrics at 0%)
 * - `githubActions` -- auto-detected from `process.env.GITHUB_ACTIONS`
 * - `githubSummaryFile` -- defaults to `process.env.GITHUB_STEP_SUMMARY`
 *
 * @public
 */
export const AgentReporterOptionsSchema = z.object({
	/** Default: derived from Vite's cacheDir when using agentPlugin, ".vitest-agent-reporter" when standalone */
	cacheDir: z.string().optional(),
	consoleOutput: ConsoleOutputModeSchema.optional(),
	omitPassingTests: z.boolean().optional(),
	coverageThreshold: z.number().optional(),
	coverageConsoleLimit: z.number().optional(),
	includeBareZero: z.boolean().optional(),
	githubActions: z.boolean().optional(),
	githubSummaryFile: z.string().optional(),
});

/**
 * Schema for {@link AgentPlugin} configuration options.
 *
 * @remarks
 * The plugin manages `consoleOutput` and `githubActions` automatically based
 * on environment detection, so those fields are omitted from the reporter
 * options passed through the plugin.
 *
 * @public
 */
export const AgentPluginOptionsSchema = z.object({
	mode: PluginModeSchema.optional(),
	reporter: AgentReporterOptionsSchema.omit({ consoleOutput: true, githubActions: true }).optional(),
});

// --- Istanbul Duck Types (kept as interfaces, not Zod schemas) ---

/**
 * Duck-typed istanbul coverage summary.
 *
 * @privateRemarks
 * These interfaces are intentionally not Zod schemas. They describe the
 * external istanbul CoverageMap API that both `\@vitest/coverage-v8` and
 * `\@vitest/coverage-istanbul` normalize to. We duck-type at runtime via
 * {@link ../coverage.ts#isIstanbulCoverageMap | isIstanbulCoverageMap} to
 * avoid forcing a specific coverage provider as a peer dependency.
 *
 * @see {@link https://github.com/istanbuljs/istanbuljs/blob/master/packages/istanbul-lib-coverage/lib/coverage-summary.js | istanbul CoverageSummary}
 * @internal
 */
export interface IstanbulSummary {
	statements: { pct: number };
	branches: { pct: number };
	functions: { pct: number };
	lines: { pct: number };
}

/**
 * Duck-typed istanbul file coverage entry.
 *
 * @privateRemarks
 * See {@link IstanbulSummary} for rationale on duck-typing.
 *
 * @see {@link https://github.com/istanbuljs/istanbuljs/blob/master/packages/istanbul-lib-coverage/lib/file-coverage.js | istanbul FileCoverage}
 * @internal
 */
export interface IstanbulFileCoverage {
	toSummary(): IstanbulSummary;
	getUncoveredLines(): number[];
}

/**
 * Duck-typed istanbul CoverageMap -- the object received by `onCoverage`.
 *
 * @privateRemarks
 * See {@link IstanbulSummary} for rationale on duck-typing.
 *
 * @see {@link https://github.com/istanbuljs/istanbuljs/blob/master/packages/istanbul-lib-coverage/lib/coverage-map.js | istanbul CoverageMap}
 * @internal
 */
export interface IstanbulCoverageMap {
	getCoverageSummary(): IstanbulSummary;
	files(): string[];
	fileCoverageFor(path: string): IstanbulFileCoverage;
}
