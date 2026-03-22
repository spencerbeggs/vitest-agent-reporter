/**
 * vitest-agent-reporter
 *
 * A Vitest reporter and plugin for LLM coding agents. Produces structured
 * markdown to console, persistent JSON to disk, and optional GFM output
 * for GitHub Actions check runs.
 *
 * Two primary entry points:
 *
 * - {@link AgentReporter} -- Vitest Reporter (direct configuration)
 * - {@link AgentPlugin} -- Vitest plugin that auto-injects the reporter
 *
 * @remarks
 * Requires Vitest \>= 4.1.0 for the Reporter v2 API. The plugin convenience
 * layer uses the `configureVitest` hook from Vitest 3.1+.
 *
 * @packageDocumentation
 */

// --- Reporter and Plugin ---

export { AgentPlugin } from "./plugin.js";
export { AgentReporter } from "./reporter.js";

// --- Schemas ---

export type {
	AgentReport as AgentReportType,
	ModuleReport as ModuleReportType,
	TestReport as TestReportType,
} from "./schemas/AgentReport.js";
export { AgentReport, ModuleReport, ReportSummary, TestReport } from "./schemas/AgentReport.js";
export type { CoverageBaselines } from "./schemas/Baselines.js";
export { CoverageBaselines as CoverageBaselinesSchema } from "./schemas/Baselines.js";
export { CacheManifest, CacheManifestEntry } from "./schemas/CacheManifest.js";
export type { ReportError as ReportErrorType } from "./schemas/Common.js";
export {
	ConsoleOutputMode,
	ConsoleStrategy,
	PackageManager,
	PluginMode,
	ReportError,
	TestClassification,
	TestRunReason,
	TestState,
} from "./schemas/Common.js";
export { CoverageReport, CoverageTotals, FileCoverageReport } from "./schemas/Coverage.js";
export { HistoryRecord, TestHistory, TestRun } from "./schemas/History.js";
export { AgentPluginOptions, AgentReporterOptions } from "./schemas/Options.js";
export type { MetricThresholds, ResolvedThresholds } from "./schemas/Thresholds.js";
export {
	MetricThresholds as MetricThresholdsSchema,
	ResolvedThresholds as ResolvedThresholdsSchema,
} from "./schemas/Thresholds.js";
export type { TrendEntry, TrendRecord } from "./schemas/Trends.js";
export { TrendEntry as TrendEntrySchema, TrendRecord as TrendRecordSchema } from "./schemas/Trends.js";

// --- Services (for programmatic access) ---

export { CacheReaderLive } from "./layers/CacheReaderLive.js";
export { HistoryTrackerLive } from "./layers/HistoryTrackerLive.js";
export { AgentDetection } from "./services/AgentDetection.js";
export { CacheReader } from "./services/CacheReader.js";
export type { TestOutcome } from "./services/HistoryTracker.js";
export { HistoryTracker } from "./services/HistoryTracker.js";

// --- Errors ---

export { CacheError } from "./errors/CacheError.js";
