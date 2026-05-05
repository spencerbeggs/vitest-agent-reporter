import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-sdk";
import { CoercedNumber } from "../coerce-schema.js";
import { publicProcedure } from "../context.js";
import { catchTddErrorsAsEnvelope } from "./_tdd-error-envelope.js";

export const tddGoalDelete = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				id: CoercedNumber,
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			catchTddErrorsAsEnvelope(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.deleteGoal(input.id);
					return { ok: true as const, id: input.id };
				}),
			),
		);
	});
