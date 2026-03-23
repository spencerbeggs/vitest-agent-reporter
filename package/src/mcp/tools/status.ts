import { Effect, Option, Schema } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { publicProcedure } from "../context.js";

export const testStatus = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				project: Schema.optional(Schema.String),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const manifestOpt = yield* reader.getManifest();

				if (Option.isNone(manifestOpt)) {
					return "No test data available. Run tests first.";
				}

				const manifest = manifestOpt.value;
				let entries = manifest.projects;

				if (input.project !== undefined) {
					entries = entries.filter((e) => e.project === input.project);
					if (entries.length === 0) {
						return `No test data found for project \`${input.project}\`. Run tests first.`;
					}
				}

				const lines: string[] = ["# Test Status", ""];

				for (const entry of entries) {
					const icon =
						entry.lastResult === "passed"
							? "✅"
							: entry.lastResult === "failed"
								? "❌"
								: entry.lastResult === "interrupted"
									? "⚠️"
									: "⬜";

					const lastRun = entry.lastRun ? new Date(entry.lastRun).toLocaleString() : "never";
					lines.push(`- ${icon} **${entry.project}** — last run: ${lastRun}, result: ${entry.lastResult ?? "unknown"}`);
				}

				lines.push("");
				lines.push(`_Cache updated: ${manifest.updatedAt}_`);

				return lines.join("\n");
			}),
		);
	});
