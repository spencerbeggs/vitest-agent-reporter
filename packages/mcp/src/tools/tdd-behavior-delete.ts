import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-sdk";
import { publicProcedure } from "../context.js";
import { catchTddErrorsAsEnvelope } from "./_tdd-error-envelope.js";

export const tddBehaviorDelete = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				id: Schema.Number,
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			catchTddErrorsAsEnvelope(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.deleteBehavior(input.id);
					return { ok: true as const, id: input.id };
				}),
			),
		);
	});
