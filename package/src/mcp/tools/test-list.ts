import { Effect, Schema } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { publicProcedure } from "../context.js";

export const testList = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				project: Schema.optional(Schema.String),
				subProject: Schema.optional(Schema.String),
				state: Schema.optional(Schema.String),
				module: Schema.optional(Schema.String),
				limit: Schema.optional(Schema.Number),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const project = input.project ?? "default";
				const subProject = input.subProject ?? null;

				const opts: { state?: string; module?: string; limit?: number } = {};
				if (input.state !== undefined) opts.state = input.state;
				if (input.module !== undefined) opts.module = input.module;
				if (input.limit !== undefined) opts.limit = input.limit;

				const tests = yield* reader.listTests(project, subProject, opts);

				if (tests.length === 0) {
					return "No tests found.";
				}

				const lines: string[] = ["## Tests", ""];
				lines.push("| ID | Full Name | State | Duration | Module | Classification |");
				lines.push("| --- | --- | --- | --- | --- | --- |");

				for (const t of tests) {
					const duration = t.duration !== null ? `${t.duration}ms` : "\u2014";
					const classification = t.classification ?? "\u2014";
					lines.push(`| ${t.id} | ${t.fullName} | ${t.state} | ${duration} | ${t.module} | ${classification} |`);
				}

				return lines.join("\n");
			}),
		);
	});
