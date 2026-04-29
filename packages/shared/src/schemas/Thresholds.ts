/**
 * Resolved coverage threshold schemas.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

/**
 * Per-metric threshold values. All optional -- only set metrics are enforced.
 */
export const MetricThresholds = Schema.Struct({
	lines: Schema.optional(Schema.Number),
	functions: Schema.optional(Schema.Number),
	branches: Schema.optional(Schema.Number),
	statements: Schema.optional(Schema.Number),
}).annotations({ identifier: "MetricThresholds" });
export type MetricThresholds = typeof MetricThresholds.Type;

/**
 * A glob pattern paired with its metric thresholds.
 */
export const PatternThresholds = Schema.Tuple(Schema.String, MetricThresholds).annotations({
	identifier: "PatternThresholds",
});
export type PatternThresholds = typeof PatternThresholds.Type;

/**
 * Fully resolved thresholds ready for evaluation.
 */
export const ResolvedThresholds = Schema.Struct({
	global: MetricThresholds,
	perFile: Schema.optionalWith(Schema.Boolean, { default: () => false }),
	patterns: Schema.optionalWith(Schema.Array(PatternThresholds), {
		default: () => [],
	}),
}).annotations({ identifier: "ResolvedThresholds" });
export type ResolvedThresholds = typeof ResolvedThresholds.Type;
