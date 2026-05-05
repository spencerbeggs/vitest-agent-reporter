import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-sdk";
import { idempotentProcedure } from "../middleware/idempotency.js";
import { catchTddErrorsAsEnvelope } from "./_tdd-error-envelope.js";

export const tddBehaviorCreate = idempotentProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				goalId: Schema.Number,
				behavior: Schema.String,
				suggestedTestName: Schema.optional(Schema.String),
				dependsOnBehaviorIds: Schema.optional(Schema.Array(Schema.Number)),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			catchTddErrorsAsEnvelope(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const behavior = yield* store.createBehavior({
						goalId: input.goalId,
						behavior: input.behavior,
						...(input.suggestedTestName !== undefined && { suggestedTestName: input.suggestedTestName }),
						...(input.dependsOnBehaviorIds !== undefined && {
							dependsOnBehaviorIds: input.dependsOnBehaviorIds,
						}),
					});
					return { ok: true as const, behavior };
				}),
			),
		);
	});
