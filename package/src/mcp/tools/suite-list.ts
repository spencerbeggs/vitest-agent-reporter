import { Effect, Schema } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { publicProcedure } from "../context.js";

export const suiteList = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				project: Schema.optional(Schema.String),
				subProject: Schema.optional(Schema.String),
				module: Schema.optional(Schema.String),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const project = input.project ?? "default";
				const subProject = input.subProject ?? null;

				const opts: { module?: string } = {};
				if (input.module !== undefined) opts.module = input.module;

				const suites = yield* reader.listSuites(project, subProject, opts);

				if (suites.length === 0) {
					return "No suites found.";
				}

				const lines: string[] = ["## Suites", ""];
				lines.push("| ID | Name | Module | State | Tests |");
				lines.push("| --- | --- | --- | --- | --- |");

				for (const s of suites) {
					lines.push(`| ${s.id} | ${s.name} | ${s.module} | ${s.state} | ${s.testCount} |`);
				}

				return lines.join("\n");
			}),
		);
	});
