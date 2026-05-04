import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-sdk";
import { idempotentProcedure } from "../middleware/idempotency.js";

export const hypothesisRecord = idempotentProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				sessionId: Schema.Number,
				content: Schema.String,
				createdTurnId: Schema.optional(Schema.Number),
				citedTestErrorId: Schema.optional(Schema.Number),
				citedStackFrameId: Schema.optional(Schema.Number),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const store = yield* DataStore;
				const id = yield* store.writeHypothesis({
					sessionId: input.sessionId,
					content: input.content,
					...(input.createdTurnId !== undefined && { createdTurnId: input.createdTurnId }),
					...(input.citedTestErrorId !== undefined && { citedTestErrorId: input.citedTestErrorId }),
					...(input.citedStackFrameId !== undefined && { citedStackFrameId: input.citedStackFrameId }),
				});
				return { id };
			}),
		);
	});
