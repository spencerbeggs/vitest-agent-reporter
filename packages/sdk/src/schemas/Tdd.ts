/**
 * TDD goal and behavior schemas.
 *
 * Application-level shapes (camelCase) for the three-tier hierarchy
 * Objective → Goal → Behavior. SQL row shapes live in `sql/rows.ts`.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

export const GoalStatus = Schema.Literal("pending", "in_progress", "done", "abandoned").annotations({
	identifier: "GoalStatus",
});
export type GoalStatus = typeof GoalStatus.Type;

export const BehaviorStatus = Schema.Literal("pending", "in_progress", "done", "abandoned").annotations({
	identifier: "BehaviorStatus",
});
export type BehaviorStatus = typeof BehaviorStatus.Type;

export const GoalRow = Schema.Struct({
	id: Schema.Number,
	sessionId: Schema.Number,
	ordinal: Schema.Number,
	goal: Schema.String,
	status: GoalStatus,
	createdAt: Schema.String,
}).annotations({ identifier: "GoalRow" });
export type GoalRow = typeof GoalRow.Type;

export const BehaviorRow = Schema.Struct({
	id: Schema.Number,
	goalId: Schema.Number,
	ordinal: Schema.Number,
	behavior: Schema.String,
	suggestedTestName: Schema.NullOr(Schema.String),
	status: BehaviorStatus,
	createdAt: Schema.String,
}).annotations({ identifier: "BehaviorRow" });
export type BehaviorRow = typeof BehaviorRow.Type;

export const GoalDetail = Schema.Struct({
	...GoalRow.fields,
	behaviors: Schema.Array(BehaviorRow),
}).annotations({ identifier: "GoalDetail" });
export type GoalDetail = typeof GoalDetail.Type;

export const BehaviorDetail = Schema.Struct({
	...BehaviorRow.fields,
	parentGoal: Schema.Struct({
		id: Schema.Number,
		goal: Schema.String,
		status: GoalStatus,
	}),
	dependencies: Schema.Array(BehaviorRow),
}).annotations({ identifier: "BehaviorDetail" });
export type BehaviorDetail = typeof BehaviorDetail.Type;
