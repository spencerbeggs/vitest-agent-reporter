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
 * Data structures are defined as Zod schemas with inferred TypeScript types.
 * Codecs provide JSON string encode/decode for report and manifest files.
 *
 * @remarks
 * Requires Vitest \>= 3.2.0 for the Reporter v2 API. The plugin convenience
 * layer uses the `configureVitest` hook from Vitest 3.1+.
 *
 * @see {@link https://vitest.dev/api/advanced/reporters.html | Vitest Reporter API}
 * @see {@link https://vitest.dev/api/advanced/plugin.html | Vitest Plugin API}
 *
 * @packageDocumentation
 */

// --- Reporter and Plugin ---

export { AgentPlugin } from "./plugin.js";
export { AgentReporter } from "./reporter.js";

// --- Zod schemas and codecs ---

export {
	AgentPluginOptionsSchema,
	AgentReportCodec,
	AgentReportSchema,
	AgentReporterOptionsSchema,
	CacheManifestCodec,
	CacheManifestEntrySchema,
	CacheManifestSchema,
	CoverageReportSchema,
	CoverageTotalsSchema,
	FileCoverageReportSchema,
	ModuleReportSchema,
	ReportErrorSchema,
	ReportSummarySchema,
	TestClassificationSchema,
	TestReportSchema,
} from "./schemas.js";

// --- Inferred types ---

export type {
	AgentPluginOptions,
	AgentReport,
	AgentReporterOptions,
	CacheManifest,
	CacheManifestEntry,
	CoverageReport,
	CoverageTotals,
	FileCoverageReport,
	ModuleReport,
	ReportError,
	ReportSummary,
	TestClassification,
	TestReport,
} from "./types.js";
