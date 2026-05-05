import { Effect, Schema } from "effect";
import { DataStore } from "vitest-agent-sdk";
import { CoercedNumber } from "../coerce-schema.js";
import { idempotentProcedure } from "../middleware/idempotency.js";

export const hypothesisValidate = idempotentProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				id: CoercedNumber,
				outcome: Schema.Literal("confirmed", "refuted", "abandoned"),
				validatedTurnId: Schema.optional(CoercedNumber),
				validatedAt: Schema.String,
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const store = yield* DataStore;
				yield* store.validateHypothesis({
					id: input.id,
					outcome: input.outcome,
					validatedAt: input.validatedAt,
					...(input.validatedTurnId !== undefined && { validatedTurnId: input.validatedTurnId }),
				});
				return {};
			}),
		);
	});
