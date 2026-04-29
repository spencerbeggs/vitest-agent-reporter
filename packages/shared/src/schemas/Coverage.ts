/**
 * Coverage-related schemas.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";
import { MetricThresholds, PatternThresholds } from "./Thresholds.js";

/**
 * Aggregate coverage percentages across four istanbul metrics.
 */
export const CoverageTotals = Schema.Struct({
	statements: Schema.Number,
	branches: Schema.Number,
	functions: Schema.Number,
	lines: Schema.Number,
}).annotations({ identifier: "CoverageTotals" });
export type CoverageTotals = typeof CoverageTotals.Type;

/**
 * Per-file coverage data including uncovered line ranges.
 */
export const FileCoverageReport = Schema.Struct({
	file: Schema.String,
	summary: CoverageTotals,
	uncoveredLines: Schema.String,
}).annotations({ identifier: "FileCoverageReport" });
export type FileCoverageReport = typeof FileCoverageReport.Type;

/**
 * Complete coverage report attached to an AgentReport.
 */
export const CoverageReport = Schema.Struct({
	totals: CoverageTotals,
	thresholds: Schema.Struct({
		global: MetricThresholds,
		patterns: Schema.optionalWith(Schema.Array(PatternThresholds), {
			default: () => [],
		}),
	}),
	targets: Schema.optional(
		Schema.Struct({
			global: MetricThresholds,
			patterns: Schema.optionalWith(Schema.Array(PatternThresholds), {
				default: () => [],
			}),
		}),
	),
	baselines: Schema.optional(
		Schema.Struct({
			global: MetricThresholds,
			patterns: Schema.optionalWith(Schema.Array(PatternThresholds), {
				default: () => [],
			}),
		}),
	),
	scoped: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	scopedFiles: Schema.optional(Schema.Array(Schema.String)),
	lowCoverage: Schema.Array(FileCoverageReport),
	lowCoverageFiles: Schema.Array(Schema.String),
	belowTarget: Schema.optional(Schema.Array(FileCoverageReport)),
	belowTargetFiles: Schema.optional(Schema.Array(Schema.String)),
}).annotations({ identifier: "CoverageReport" });
export type CoverageReport = typeof CoverageReport.Type;
