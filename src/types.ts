/**
 * vitest-agent-reporter
 *
 * Type definitions inferred from Zod schemas.
 * All types are derived from schemas in `./schemas.ts` via `z.infer<>`.
 * Istanbul duck-type interfaces are re-exported directly.
 *
 * @packageDocumentation
 */

import type { z } from "zod/v4";
import type {
	AgentPluginOptionsSchema,
	AgentReportSchema,
	AgentReporterOptionsSchema,
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

// --- Reporter Options ---

/**
 * Configuration options for {@link AgentReporter}.
 *
 * @see {@link AgentReporterOptionsSchema} for the Zod schema and field defaults.
 * @public
 */
export type AgentReporterOptions = z.infer<typeof AgentReporterOptionsSchema>;

/**
 * Configuration options for {@link AgentPlugin}.
 *
 * @see {@link AgentPluginOptionsSchema} for the Zod schema.
 * @public
 */
export type AgentPluginOptions = z.infer<typeof AgentPluginOptionsSchema>;

// --- Report Data Structures ---

/**
 * Complete per-project test report written to disk as JSON.
 *
 * @see {@link AgentReportSchema} for the Zod schema.
 * @public
 */
export type AgentReport = z.infer<typeof AgentReportSchema>;

/**
 * Aggregate test run statistics (total, passed, failed, skipped, duration).
 *
 * @see {@link ReportSummarySchema} for the Zod schema.
 * @public
 */
export type ReportSummary = z.infer<typeof ReportSummarySchema>;

/**
 * A test module (file) and its contained test results.
 *
 * @see {@link ModuleReportSchema} for the Zod schema.
 * @public
 */
export type ModuleReport = z.infer<typeof ModuleReportSchema>;

/**
 * An individual test case result within a module.
 *
 * @see {@link TestReportSchema} for the Zod schema.
 * @public
 */
export type TestReport = z.infer<typeof TestReportSchema>;

/**
 * Failure classification for a test across multiple runs (Phase 3).
 *
 * @see {@link TestClassificationSchema} for the Zod schema.
 * @public
 */
export type TestClassification = z.infer<typeof TestClassificationSchema>;

/**
 * A single error with message, optional stack trace, and optional diff.
 *
 * @see {@link ReportErrorSchema} for the Zod schema.
 * @public
 */
export type ReportError = z.infer<typeof ReportErrorSchema>;

// --- Coverage ---

/**
 * Complete coverage report with totals, threshold, and low-coverage files.
 *
 * @see {@link CoverageReportSchema} for the Zod schema.
 * @public
 */
export type CoverageReport = z.infer<typeof CoverageReportSchema>;

/**
 * Aggregate coverage percentages across four istanbul metrics.
 *
 * @see {@link CoverageTotalsSchema} for the Zod schema.
 * @public
 */
export type CoverageTotals = z.infer<typeof CoverageTotalsSchema>;

/**
 * Per-file coverage data including uncovered line ranges.
 *
 * @see {@link FileCoverageReportSchema} for the Zod schema.
 * @public
 */
export type FileCoverageReport = z.infer<typeof FileCoverageReportSchema>;

// --- Cache Manifest ---

/**
 * Root manifest file indexing all project reports in the cache directory.
 *
 * @see {@link CacheManifestSchema} for the Zod schema.
 * @public
 */
export type CacheManifest = z.infer<typeof CacheManifestSchema>;

/**
 * A single project entry within the cache manifest.
 *
 * @see {@link CacheManifestEntrySchema} for the Zod schema.
 * @public
 */
export type CacheManifestEntry = z.infer<typeof CacheManifestEntrySchema>;

// --- Istanbul Duck Types ---

export type { IstanbulCoverageMap, IstanbulFileCoverage, IstanbulSummary } from "./schemas.js";

// --- Package Manager Detection ---

/**
 * Supported package manager identifiers.
 *
 * @see {@link PackageManagerSchema} for the Zod schema.
 * @public
 */
export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";
