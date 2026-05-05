import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-sdk";
import { publicProcedure } from "../context.js";
import { catchTddErrorsAsEnvelope } from "./_tdd-error-envelope.js";

const BehaviorStatus = Schema.Literal("pending", "in_progress", "done", "abandoned");

export const tddBehaviorUpdate = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				id: Schema.Number,
				behavior: Schema.optional(Schema.String),
				suggestedTestName: Schema.optional(Schema.NullOr(Schema.String)),
				status: Schema.optional(BehaviorStatus),
				dependsOnBehaviorIds: Schema.optional(Schema.Array(Schema.Number)),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			catchTddErrorsAsEnvelope(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const behavior = yield* store.updateBehavior({
						id: input.id,
						...(input.behavior !== undefined && { behavior: input.behavior }),
						...(input.suggestedTestName !== undefined && { suggestedTestName: input.suggestedTestName }),
						...(input.status !== undefined && { status: input.status }),
						...(input.dependsOnBehaviorIds !== undefined && {
							dependsOnBehaviorIds: input.dependsOnBehaviorIds,
						}),
					});
					return { ok: true as const, behavior };
				}),
			),
		);
	});
