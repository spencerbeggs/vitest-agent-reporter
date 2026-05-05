import { Effect, Option, Schema } from "effect";
import { DataReader, DataStore } from "vitest-agent-sdk";
import { CoercedNumber } from "../coerce-schema.js";
import { idempotentProcedure } from "../middleware/idempotency.js";

export const tddSessionStart = idempotentProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				goal: Schema.String,
				sessionId: Schema.optional(CoercedNumber),
				ccSessionId: Schema.optional(Schema.String),
				parentTddSessionId: Schema.optional(CoercedNumber),
				startedAt: Schema.optional(Schema.String),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const store = yield* DataStore;

				let sessionId: number;
				if (input.sessionId !== undefined) {
					sessionId = input.sessionId;
				} else if (input.ccSessionId !== undefined) {
					const opt = yield* reader.getSessionByCcId(input.ccSessionId);
					if (Option.isNone(opt)) {
						return yield* Effect.fail(
							new Error(`Unknown cc_session_id: ${input.ccSessionId}. Run record session-start first.`),
						);
					}
					sessionId = opt.value.id;
				} else {
					return yield* Effect.fail(new Error("tdd_session_start: provide sessionId or ccSessionId"));
				}

				const id = yield* store.writeTddSession({
					sessionId,
					goal: input.goal,
					startedAt: input.startedAt ?? new Date().toISOString(),
					...(input.parentTddSessionId !== undefined && { parentTddSessionId: input.parentTddSessionId }),
				});

				return { id, sessionId, goal: input.goal };
			}),
		);
	});
