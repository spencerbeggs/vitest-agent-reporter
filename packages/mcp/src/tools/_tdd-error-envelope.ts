/**
 * Shared error-to-success-shape envelope conversion for goal / behavior CRUD
 * tools. Maps each tagged TDD error to an ok:false response matching the
 * tdd_phase_transition_request accept/deny envelope shape, so the agent
 * sees a normal tool response instead of a transport error.
 *
 * `Effect.catchTags` returns `Effect.succeed(envelope)` so the success
 * channel carries the union `Success | ErrorEnvelope`.
 */

import { Effect } from "effect";
import {
	BehaviorNotFoundError,
	GoalNotFoundError,
	IllegalStatusTransitionError,
	TddSessionAlreadyEndedError,
	TddSessionNotFoundError,
} from "vitest-agent-sdk";

export interface Remediation {
	readonly suggestedTool: string;
	readonly suggestedArgs: Record<string, unknown>;
	readonly humanHint: string;
}

export interface TddErrorEnvelope {
	readonly ok: false;
	readonly error: {
		readonly _tag: string;
		readonly remediation: Remediation;
		readonly [key: string]: unknown;
	};
}

const goalNotFound = (e: GoalNotFoundError): TddErrorEnvelope => ({
	ok: false,
	error: {
		_tag: e._tag,
		id: e.id,
		reason: e.reason,
		remediation: {
			suggestedTool: "tdd_goal_list",
			suggestedArgs: {},
			humanHint: `No tdd_session_goals row with id=${e.id}. Call tdd_goal_list({ sessionId }) to find the correct goal id.`,
		},
	},
});

const behaviorNotFound = (e: BehaviorNotFoundError): TddErrorEnvelope => ({
	ok: false,
	error: {
		_tag: e._tag,
		id: e.id,
		reason: e.reason,
		remediation: {
			suggestedTool: "tdd_behavior_list",
			suggestedArgs: {},
			humanHint: `No tdd_session_behaviors row with id=${e.id}. Call tdd_behavior_list({ scope: 'goal', goalId }) or tdd_behavior_list({ scope: 'session', sessionId }) to find the correct behavior id.`,
		},
	},
});

const tddSessionNotFound = (e: TddSessionNotFoundError): TddErrorEnvelope => ({
	ok: false,
	error: {
		_tag: e._tag,
		id: e.id,
		reason: e.reason,
		remediation: {
			suggestedTool: "tdd_session_start",
			suggestedArgs: {},
			humanHint: `No tdd_sessions row with id=${e.id}. Call tdd_session_start to open a TDD session before creating goals or behaviors.`,
		},
	},
});

const tddSessionAlreadyEnded = (e: TddSessionAlreadyEndedError): TddErrorEnvelope => ({
	ok: false,
	error: {
		_tag: e._tag,
		id: e.id,
		endedAt: e.endedAt,
		outcome: e.outcome,
		remediation: {
			suggestedTool: "tdd_session_start",
			suggestedArgs: {},
			humanHint: `tdd_sessions row id=${e.id} is already ended (outcome=${e.outcome}). Open a new TDD session if you need to add more goals or behaviors.`,
		},
	},
});

const illegalStatusTransition = (e: IllegalStatusTransitionError): TddErrorEnvelope => ({
	ok: false,
	error: {
		_tag: e._tag,
		entity: e.entity,
		id: e.id,
		from: e.from,
		to: e.to,
		reason: e.reason,
		remediation: {
			suggestedTool: e.entity === "goal" ? "tdd_goal_update" : "tdd_behavior_update",
			suggestedArgs: { id: e.id, status: "abandoned" },
			humanHint: `Cannot transition ${e.entity} id=${e.id} from ${e.from} to ${e.to}. Use status:'abandoned' to drop work; do not delete unless the entity was created by mistake.`,
		},
	},
});

type KnownTddError =
	| GoalNotFoundError
	| BehaviorNotFoundError
	| TddSessionNotFoundError
	| TddSessionAlreadyEndedError
	| IllegalStatusTransitionError;

const isKnownTddError = (e: unknown): e is KnownTddError =>
	e instanceof GoalNotFoundError ||
	e instanceof BehaviorNotFoundError ||
	e instanceof TddSessionNotFoundError ||
	e instanceof TddSessionAlreadyEndedError ||
	e instanceof IllegalStatusTransitionError;

const tddErrorToEnvelope = (e: KnownTddError): TddErrorEnvelope => {
	if (e instanceof GoalNotFoundError) return goalNotFound(e);
	if (e instanceof BehaviorNotFoundError) return behaviorNotFound(e);
	if (e instanceof TddSessionNotFoundError) return tddSessionNotFound(e);
	if (e instanceof TddSessionAlreadyEndedError) return tddSessionAlreadyEnded(e);
	return illegalStatusTransition(e);
};

export const catchTddErrorsAsEnvelope = <A, E, R>(
	effect: Effect.Effect<A, E, R>,
): Effect.Effect<A | TddErrorEnvelope, Exclude<E, KnownTddError>, R> =>
	effect.pipe(
		Effect.catchAll((e: E) =>
			isKnownTddError(e) ? Effect.succeed(tddErrorToEnvelope(e)) : Effect.fail(e as Exclude<E, KnownTddError>),
		),
	);
