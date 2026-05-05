import { Effect, Schema } from "effect";
import { DataReader, DataStore } from "vitest-agent-sdk";
import { CoercedNumber } from "../coerce-schema.js";
import { publicProcedure } from "../context.js";
import { catchTddErrorsAsEnvelope } from "./_tdd-error-envelope.js";

const ListByGoal = Schema.Struct({
	scope: Schema.Literal("goal"),
	goalId: CoercedNumber,
});
const ListBySession = Schema.Struct({
	scope: Schema.Literal("session"),
	sessionId: CoercedNumber,
});

export const tddBehaviorList = publicProcedure
	.input(Schema.standardSchemaV1(Schema.Union(ListByGoal, ListBySession)))
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			catchTddErrorsAsEnvelope(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const reader = yield* DataReader;
					if (input.scope === "goal") {
						yield* store.listBehaviorsByGoal(input.goalId);
						const behaviors = yield* reader.getBehaviorsByGoal(input.goalId);
						return { ok: true as const, scope: "goal" as const, goalId: input.goalId, behaviors };
					}
					yield* store.listBehaviorsBySession(input.sessionId);
					const behaviors = yield* reader.getBehaviorsBySession(input.sessionId);
					return { ok: true as const, scope: "session" as const, sessionId: input.sessionId, behaviors };
				}),
			),
		);
	});
