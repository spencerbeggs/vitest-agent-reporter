import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-sdk";
import { publicProcedure } from "../context.js";
import { catchTddErrorsAsEnvelope } from "./_tdd-error-envelope.js";

const GoalStatus = Schema.Literal("pending", "in_progress", "done", "abandoned");

export const tddGoalUpdate = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				id: Schema.Number,
				goal: Schema.optional(Schema.String),
				status: Schema.optional(GoalStatus),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			catchTddErrorsAsEnvelope(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const goal = yield* store.updateGoal({
						id: input.id,
						...(input.goal !== undefined && { goal: input.goal }),
						...(input.status !== undefined && { status: input.status }),
					});
					return { ok: true as const, goal };
				}),
			),
		);
	});
