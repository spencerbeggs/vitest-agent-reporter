import { Effect, Schema } from "effect";
import { DataReader } from "vitest-agent-reporter-shared";
import { publicProcedure } from "../context.js";

export const commitChanges = publicProcedure
	.input(Schema.standardSchemaV1(Schema.Struct({ sha: Schema.optional(Schema.String) })))
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const entries = yield* reader.getCommitChanges(input.sha);
				if (entries.length === 0) {
					return input.sha
						? `No commit recorded with sha ${input.sha}.`
						: "No commits recorded yet. The PostToolUse hook on `git commit` populates this table.";
				}
				const lines: string[] = [];
				for (const e of entries) {
					lines.push(`## ${e.sha.slice(0, 8)} ${e.message ?? "(no message)"}`);
					if (e.author) lines.push(`- Author: ${e.author}`);
					if (e.committedAt) lines.push(`- When: ${e.committedAt}`);
					if (e.branch) lines.push(`- Branch: ${e.branch}`);
					if (e.files.length > 0) {
						lines.push(`- Changed files:`);
						for (const f of e.files) {
							lines.push(`  - \`${f.filePath}\` (${f.changeKind})`);
						}
					}
					lines.push("");
				}
				return lines.join("\n").trim();
			}),
		);
	});
