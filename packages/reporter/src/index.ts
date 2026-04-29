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
	CoverageBaselines,
	MetricThresholds,
	ModuleReport as ModuleReportType,
	ReportError as ReportErrorType,
	ResolvedThresholds,
	TestReport as TestReportType,
	TrendEntry,
	TrendRecord,
} from "vitest-agent-reporter-shared";
export {
	AgentPluginOptions,
	AgentReport,
	AgentReporterOptions,
	CacheManifest,
	CacheManifestEntry,
	ConsoleOutputMode,
	ConsoleStrategy,
	CoverageBaselines as CoverageBaselinesSchema,
	CoverageReport,
	CoverageTotals,
	DetailLevel,
	Environment,
	Executor,
	FileCoverageReport,
	HistoryRecord,
	MetricThresholds as MetricThresholdsSchema,
	ModuleReport,
	OutputFormat,
	PackageManager,
	PluginMode,
	ReportError,
	ReportSummary,
	ResolvedThresholds as ResolvedThresholdsSchema,
	TestClassification,
	TestHistory,
	TestReport,
	TestRun,
	TestRunReason,
	TestState,
	TrendEntry as TrendEntrySchema,
	TrendRecord as TrendRecordSchema,
} from "vitest-agent-reporter-shared";

// --- Services (for programmatic access) ---

export type { Formatter, FormatterContext, RenderedOutput, TestOutcome } from "vitest-agent-reporter-shared";
export {
	DataReader,
	DataReaderLive,
	DataStore,
	DataStoreLive,
	DetailResolver,
	EnvironmentDetector,
	ExecutorResolver,
	FormatSelector,
	HistoryTracker,
	HistoryTrackerLive,
	OutputPipelineLive,
	OutputRenderer,
} from "vitest-agent-reporter-shared";

// --- Errors ---

export { DataStoreError } from "vitest-agent-reporter-shared";
