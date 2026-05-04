import { Effect, Schema } from "effect";
import { DataReader } from "vitest-agent-sdk";
import { publicProcedure } from "../context.js";

export const turnSearch = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				sessionId: Schema.optional(Schema.Number),
				since: Schema.optional(Schema.String),
				type: Schema.optional(
					Schema.Literal("user_prompt", "tool_call", "tool_result", "file_edit", "hook_fire", "note", "hypothesis"),
				),
				limit: Schema.optional(Schema.Number),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const rows = yield* reader.searchTurns({
					...(input.sessionId !== undefined && { sessionId: input.sessionId }),
					...(input.since !== undefined && { since: input.since }),
					...(input.type !== undefined && { type: input.type }),
					limit: input.limit ?? 100,
				});
				if (rows.length === 0) return "No turns matched.";
				const lines: string[] = ["# Turns", ""];
				for (const t of rows) {
					lines.push(`- session=${t.sessionId} turn=${t.turnNo} type=${t.type} at=${t.occurredAt}`);
				}
				return lines.join("\n");
			}),
		);
	});
