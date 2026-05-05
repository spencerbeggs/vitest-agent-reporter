import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-sdk";
import { CoercedNumber } from "../coerce-schema.js";
import { idempotentProcedure } from "../middleware/idempotency.js";

export const tddSessionEnd = idempotentProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				tddSessionId: CoercedNumber,
				outcome: Schema.Literal("succeeded", "blocked", "abandoned"),
				summaryNoteId: Schema.optional(CoercedNumber),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const store = yield* DataStore;
				yield* store.endTddSession({
					id: input.tddSessionId,
					outcome: input.outcome,
					endedAt: new Date().toISOString(),
					...(input.summaryNoteId !== undefined && { summaryNoteId: input.summaryNoteId }),
				});
				return { id: input.tddSessionId, outcome: input.outcome };
			}),
		);
	});
