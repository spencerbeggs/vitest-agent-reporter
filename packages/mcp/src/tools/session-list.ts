import { Effect, Schema } from "effect";
import { DataReader } from "vitest-agent-reporter-shared";
import { publicProcedure } from "../context.js";

export const sessionList = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				project: Schema.optional(Schema.String),
				agentKind: Schema.optional(Schema.Literal("main", "subagent")),
				limit: Schema.optional(Schema.Number),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const rows = yield* reader.listSessions({
					...(input.project !== undefined && { project: input.project }),
					...(input.agentKind !== undefined && { agentKind: input.agentKind }),
					...(input.limit !== undefined && { limit: input.limit }),
				});
				if (rows.length === 0) return "No sessions recorded yet.";
				const lines: string[] = ["# Sessions", ""];
				for (const s of rows) {
					const ended = s.endedAt ? `ended ${s.endedAt}` : "open";
					lines.push(`- **${s.cc_session_id}** [${s.agentKind}] project=${s.project} started=${s.startedAt} ${ended}`);
				}
				return lines.join("\n");
			}),
		);
	});
