import { Effect, Option, Schema } from "effect";
import { DataReader } from "vitest-agent-sdk";
import { CoercedNumber } from "../coerce-schema.js";
import { publicProcedure } from "../context.js";

export const tddBehaviorGet = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				id: CoercedNumber,
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const opt = yield* reader.getBehaviorById(input.id);
				return Option.isNone(opt)
					? { found: false as const, id: input.id }
					: { found: true as const, behavior: opt.value };
			}),
		);
	});
