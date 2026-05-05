import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-sdk";
import { idempotentProcedure } from "../middleware/idempotency.js";
import { catchTddErrorsAsEnvelope } from "./_tdd-error-envelope.js";

export const tddGoalCreate = idempotentProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				sessionId: Schema.Number,
				goal: Schema.String,
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			catchTddErrorsAsEnvelope(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const goal = yield* store.createGoal({ sessionId: input.sessionId, goal: input.goal });
					return { ok: true as const, goal };
				}),
			),
		);
	});
