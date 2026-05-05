import { Effect, Schema } from "effect";
import { formatTriageEffect } from "vitest-agent-sdk";
import { CoercedNumber } from "../coerce-schema.js";
import { publicProcedure } from "../context.js";

export const triageBrief = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				project: Schema.optional(Schema.String),
				maxLines: Schema.optional(CoercedNumber),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const md = yield* formatTriageEffect({
					...(input.project !== undefined && { project: input.project }),
					...(input.maxLines !== undefined && { maxLines: input.maxLines }),
				});
				return md.length > 0 ? md : "No orientation signal yet — run tests to populate the database.";
			}),
		);
	});
