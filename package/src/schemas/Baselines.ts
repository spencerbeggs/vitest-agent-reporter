/**
 * Schema for coverage baselines stored in the cache.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";
import { MetricThresholds, PatternThresholds } from "./Thresholds.js";

/**
 * Coverage baselines -- the auto-ratcheting high-water mark.
 */
export const CoverageBaselines = Schema.Struct({
	updatedAt: Schema.String,
	global: MetricThresholds,
	patterns: Schema.optionalWith(Schema.Array(PatternThresholds), {
		default: () => [],
	}),
}).annotations({ identifier: "CoverageBaselines" });
export type CoverageBaselines = typeof CoverageBaselines.Type;
