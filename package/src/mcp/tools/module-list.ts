import { Effect, Schema } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { publicProcedure } from "../context.js";

export const moduleList = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				project: Schema.optional(Schema.String),
				subProject: Schema.optional(Schema.String),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const project = input.project ?? "default";
				const subProject = input.subProject ?? null;

				const modules = yield* reader.listModules(project, subProject);

				if (modules.length === 0) {
					return "No modules found. Run run_tests({}) to execute tests and populate the database.";
				}

				const lines: string[] = ["## Modules", ""];
				lines.push("| ID | File | State | Tests | Duration |");
				lines.push("| --- | --- | --- | --- | --- |");

				for (const m of modules) {
					const duration = m.duration !== null ? `${m.duration}ms` : "\u2014";
					lines.push(`| ${m.id} | ${m.file} | ${m.state} | ${m.testCount} | ${duration} |`);
				}

				return lines.join("\n");
			}),
		);
	});
