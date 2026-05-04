import { Effect, Schema } from "effect";
import { formatWrapupEffect } from "vitest-agent-sdk";
import { publicProcedure } from "../context.js";

export const wrapupPrompt = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				sessionId: Schema.optional(Schema.Number),
				ccSessionId: Schema.optional(Schema.String),
				kind: Schema.optional(Schema.Literal("stop", "session_end", "pre_compact", "tdd_handoff", "user_prompt_nudge")),
				userPromptHint: Schema.optional(Schema.String),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const md = yield* formatWrapupEffect({
					...(input.sessionId !== undefined && { sessionId: input.sessionId }),
					...(input.ccSessionId !== undefined && { ccSessionId: input.ccSessionId }),
					kind: input.kind ?? "session_end",
					...(input.userPromptHint !== undefined && { userPromptHint: input.userPromptHint }),
				});
				return md.length > 0 ? md : "Nothing to wrap up.";
			}),
		);
	});
