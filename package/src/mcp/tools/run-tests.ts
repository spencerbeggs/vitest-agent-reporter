import { spawnSync } from "node:child_process";
import { Schema } from "effect";
import { publicProcedure } from "../context.js";

const FORBIDDEN_CHARS = /[;|&`$(){}[\]<>!#]/;

export function sanitizeTestArgs(args: readonly string[]): string[] {
	const result: string[] = [];
	for (const arg of args) {
		if (FORBIDDEN_CHARS.test(arg)) {
			throw new Error(`Unsafe argument rejected: ${arg}`);
		}
		result.push(arg);
	}
	return result;
}

export const runTests = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				files: Schema.optional(Schema.Array(Schema.String)),
				project: Schema.optional(Schema.String),
				timeout: Schema.optional(Schema.Number),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		const args = ["vitest", "run"];
		if (input.files) {
			args.push(...sanitizeTestArgs(input.files));
		}
		if (input.project) {
			args.push("--project", ...sanitizeTestArgs([input.project]));
		}

		const timeoutMs = (input.timeout ?? 120) * 1000;

		// Use spawnSync with array args to avoid shell interpretation.
		// This handles file paths with spaces correctly and eliminates
		// shell injection risk entirely (no shell involved).
		const result = spawnSync("npx", args, {
			cwd: ctx.cwd,
			timeout: timeoutMs,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		});

		return {
			exitCode: result.status ?? 1,
			stdout: result.stdout ?? "",
			stderr: result.stderr ?? "",
		};
	});
