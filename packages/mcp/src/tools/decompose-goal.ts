import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-reporter-shared";
import { idempotentProcedure } from "../middleware/idempotency.js";

/**
 * Decompose a goal into a backlog of single-behavior goals.
 *
 * Per spec W2: "Map a fuzzy `/tdd <goal>` into an ordered backlog of
 * single-behavior goals stored in `tdd_session_behaviors`; iterate the
 * cycle once per behavior. Required for non-toy goals."
 *
 * The decomposition heuristic here is intentionally simple — splits
 * by " and " / "; " in the goal text, dropping empties, and coining
 * suggested test names by prefixing each chunk with "should ". Plain
 * commas are NOT a separator: embedded clarifying clauses like
 * "Add foo, distinct from bar, to the union" should stay as one
 * behavior. Agents that want finer decomposition can re-call with a
 * pre-split goal as separate atoms; the idempotency key on
 * (tddSessionId, goal) means re-running with the same input is a
 * no-op replay.
 */
function splitGoal(goal: string): ReadonlyArray<string> {
	const trimmed = goal.trim();
	if (trimmed.length === 0) return [];
	const parts = trimmed
		.split(/\s+and\s+|;\s+/i)
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
	return parts.length > 0 ? parts : [trimmed];
}

function suggestTestName(behavior: string): string {
	const lower = behavior.toLowerCase();
	if (lower.startsWith("should ")) return behavior;
	return `should ${lower.replace(/^(handle|implement|add|support)\s+/, "")}`;
}

export const decomposeGoal = idempotentProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				tddSessionId: Schema.Number,
				goal: Schema.String,
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const store = yield* DataStore;
				const atoms = splitGoal(input.goal);
				if (atoms.length === 0) {
					return yield* Effect.fail(new Error("decompose_goal_into_behaviors: goal is empty"));
				}
				const behaviorRows = yield* store.writeTddSessionBehaviors({
					parentTddSessionId: input.tddSessionId,
					behaviors: atoms.map((behavior) => ({
						behavior,
						suggestedTestName: suggestTestName(behavior),
					})),
				});
				return {
					parent_tdd_session_id: input.tddSessionId,
					behaviors: behaviorRows.map((b) => ({
						id: b.id,
						ordinal: b.ordinal,
						behavior: b.behavior,
						suggested_test_name: b.suggestedTestName,
						depends_on_behavior_ids: [] as ReadonlyArray<number>,
						rationale: `Atomic behavior derived from goal "${input.goal}"`,
					})),
				};
			}),
		);
	});
