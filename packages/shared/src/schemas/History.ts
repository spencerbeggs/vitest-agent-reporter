/**
 * History schemas for per-test failure tracking.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

/**
 * A single test run outcome (pass or fail only).
 */
export const TestRun = Schema.Struct({
	timestamp: Schema.String,
	state: Schema.Literal("passed", "failed"),
}).annotations({ identifier: "TestRun" });
export type TestRun = typeof TestRun.Type;

/**
 * History for a single test across multiple runs.
 */
export const TestHistory = Schema.Struct({
	fullName: Schema.String,
	runs: Schema.Array(TestRun),
}).annotations({ identifier: "TestHistory" });
export type TestHistory = typeof TestHistory.Type;

/**
 * Per-project history record containing all tracked tests.
 */
export const HistoryRecord = Schema.Struct({
	project: Schema.String,
	updatedAt: Schema.String,
	tests: Schema.Array(TestHistory),
}).annotations({ identifier: "HistoryRecord" });
export type HistoryRecord = typeof HistoryRecord.Type;
