/**
 * Channel event schemas for the orchestrator → main-agent progress push.
 *
 * All payloads share a `type` discriminator and pass through
 * `tdd_progress_push`. Behavior-level events declare goalId/sessionId
 * fields, but the MCP server resolves those server-side from
 * behaviorId via `DataReader.resolveGoalIdForBehavior` before emitting
 * the notification — caller-supplied values for goalId/sessionId on
 * behavior events are advisory and may be overwritten.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";

export const SessionOutcome = Schema.Literal("succeeded", "blocked", "abandoned");
export type SessionOutcome = typeof SessionOutcome.Type;

const PhaseLiteral = Schema.Literal(
	"spike",
	"red",
	"red.triangulate",
	"green",
	"green.fake-it",
	"refactor",
	"extended-red",
	"green-without-red",
);

const GoalSummary = Schema.Struct({
	id: Schema.Number,
	ordinal: Schema.Number,
	goal: Schema.String,
});

const BehaviorSummary = Schema.Struct({
	id: Schema.Number,
	ordinal: Schema.Number,
	behavior: Schema.String,
});

export const GoalsReadyEvent = Schema.Struct({
	type: Schema.Literal("goals_ready"),
	sessionId: Schema.Number,
	goals: Schema.Array(GoalSummary),
});
export type GoalsReadyEvent = typeof GoalsReadyEvent.Type;

export const GoalAddedEvent = Schema.Struct({
	type: Schema.Literal("goal_added"),
	sessionId: Schema.Number,
	goal: GoalSummary,
});
export type GoalAddedEvent = typeof GoalAddedEvent.Type;

export const GoalStartedEvent = Schema.Struct({
	type: Schema.Literal("goal_started"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
});
export type GoalStartedEvent = typeof GoalStartedEvent.Type;

export const GoalCompletedEvent = Schema.Struct({
	type: Schema.Literal("goal_completed"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
	behaviorIds: Schema.Array(Schema.Number),
});
export type GoalCompletedEvent = typeof GoalCompletedEvent.Type;

export const GoalAbandonedEvent = Schema.Struct({
	type: Schema.Literal("goal_abandoned"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
	reason: Schema.String,
});
export type GoalAbandonedEvent = typeof GoalAbandonedEvent.Type;

export const BehaviorsReadyEvent = Schema.Struct({
	type: Schema.Literal("behaviors_ready"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
	behaviors: Schema.Array(BehaviorSummary),
});
export type BehaviorsReadyEvent = typeof BehaviorsReadyEvent.Type;

export const BehaviorAddedEvent = Schema.Struct({
	type: Schema.Literal("behavior_added"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
	behavior: BehaviorSummary,
});
export type BehaviorAddedEvent = typeof BehaviorAddedEvent.Type;

export const BehaviorStartedEvent = Schema.Struct({
	type: Schema.Literal("behavior_started"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
	behaviorId: Schema.Number,
});
export type BehaviorStartedEvent = typeof BehaviorStartedEvent.Type;

export const PhaseTransitionEvent = Schema.Struct({
	type: Schema.Literal("phase_transition"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
	behaviorId: Schema.Number,
	from: PhaseLiteral,
	to: PhaseLiteral,
});
export type PhaseTransitionEvent = typeof PhaseTransitionEvent.Type;

export const BehaviorCompletedEvent = Schema.Struct({
	type: Schema.Literal("behavior_completed"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
	behaviorId: Schema.Number,
});
export type BehaviorCompletedEvent = typeof BehaviorCompletedEvent.Type;

export const BehaviorAbandonedEvent = Schema.Struct({
	type: Schema.Literal("behavior_abandoned"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
	behaviorId: Schema.Number,
	reason: Schema.String,
});
export type BehaviorAbandonedEvent = typeof BehaviorAbandonedEvent.Type;

export const BlockedEvent = Schema.Struct({
	type: Schema.Literal("blocked"),
	sessionId: Schema.Number,
	goalId: Schema.Number,
	behaviorId: Schema.Number,
	reason: Schema.String,
	failureSignatureHash: Schema.optional(Schema.String),
});
export type BlockedEvent = typeof BlockedEvent.Type;

export const SessionCompleteEvent = Schema.Struct({
	type: Schema.Literal("session_complete"),
	sessionId: Schema.Number,
	goalIds: Schema.Array(Schema.Number),
	outcome: SessionOutcome,
});
export type SessionCompleteEvent = typeof SessionCompleteEvent.Type;

export const ChannelEvent = Schema.Union(
	GoalsReadyEvent,
	GoalAddedEvent,
	GoalStartedEvent,
	GoalCompletedEvent,
	GoalAbandonedEvent,
	BehaviorsReadyEvent,
	BehaviorAddedEvent,
	BehaviorStartedEvent,
	PhaseTransitionEvent,
	BehaviorCompletedEvent,
	BehaviorAbandonedEvent,
	BlockedEvent,
	SessionCompleteEvent,
);
export type ChannelEvent = typeof ChannelEvent.Type;

/**
 * Event types whose `goalId` and `sessionId` should be resolved
 * server-side from `behaviorId` (per spec: "not trusting the
 * orchestrator's request"). Listed explicitly so the resolver knows
 * which subset to enrich vs pass through.
 */
export const BehaviorScopedEventTypes = [
	"behavior_started",
	"phase_transition",
	"behavior_completed",
	"behavior_abandoned",
	"blocked",
] as const;
export type BehaviorScopedEventType = (typeof BehaviorScopedEventTypes)[number];
