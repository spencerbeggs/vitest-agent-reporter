import { Effect, Schema } from "effect";
import { DataReader, DataStore } from "vitest-agent-sdk";
import { publicProcedure } from "../context.js";
import { catchTddErrorsAsEnvelope } from "./_tdd-error-envelope.js";

export const tddGoalList = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				sessionId: Schema.Number,
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			catchTddErrorsAsEnvelope(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const reader = yield* DataReader;
					yield* store.listGoalsBySession(input.sessionId);
					const goals = yield* reader.getGoalsBySession(input.sessionId);
					return { ok: true as const, sessionId: input.sessionId, goals };
				}),
			),
		);
	});
