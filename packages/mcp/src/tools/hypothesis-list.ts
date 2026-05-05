import { Effect, Schema } from "effect";
import { DataReader } from "vitest-agent-sdk";
import { publicProcedure } from "../context.js";

export const hypothesisList = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				sessionId: Schema.optional(Schema.Number),
				outcome: Schema.optional(Schema.Literal("confirmed", "refuted", "abandoned", "open")),
				limit: Schema.optional(Schema.Number),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const rows = yield* reader.listHypotheses({
					...(input.sessionId !== undefined && { sessionId: input.sessionId }),
					...(input.outcome !== undefined && { outcome: input.outcome }),
					...(input.limit !== undefined && { limit: input.limit }),
				});
				if (rows.length === 0) return "No hypotheses matched.";
				const lines: string[] = ["# Hypotheses", ""];
				for (const h of rows) {
					const status = h.validationOutcome ?? "open";
					lines.push(`- [${status}] id=${h.id} session=${h.sessionId}: ${h.content.slice(0, 120)}`);
				}
				return lines.join("\n");
			}),
		);
	});
