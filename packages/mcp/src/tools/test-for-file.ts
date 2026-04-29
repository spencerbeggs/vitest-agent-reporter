import { Effect, Schema } from "effect";
import { DataReader } from "vitest-agent-reporter-shared";
import { publicProcedure } from "../context.js";

export const testForFile = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				filePath: Schema.String,
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const testFiles = yield* reader.getTestsForFile(input.filePath);

				if (testFiles.length === 0) {
					return `No test modules found covering \`${input.filePath}\`. Run run_tests({}) to populate the database, or check the file path.`;
				}

				const lines: string[] = [
					`# Tests for \`${input.filePath}\``,
					"",
					`Found ${testFiles.length} test module${testFiles.length === 1 ? "" : "s"}:`,
					"",
				];

				for (const testFile of testFiles) {
					lines.push(`- \`${testFile}\``);
				}

				return lines.join("\n");
			}),
		);
	});
