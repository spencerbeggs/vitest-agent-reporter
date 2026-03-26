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
		const args = ["vitest", "run", "--coverage.enabled=false"];
		if (input.files) {
			args.push(...sanitizeTestArgs(input.files));
		}
		if (input.project) {
			args.push("--project", ...sanitizeTestArgs([input.project]));
		}

		const timeoutMs = (input.timeout ?? 120) * 1000;

		// Strip coverage env vars so the spawned vitest process doesn't
		// interfere with the parent's v8 coverage collection (avoids
		// ENOENT on coverage/.tmp files in CI).
		const env = { ...process.env };
		delete env.NODE_V8_COVERAGE;

		// Use spawnSync with array args to avoid shell interpretation.
		// This handles file paths with spaces correctly and eliminates
		// shell injection risk entirely (no shell involved).
		const result = spawnSync("npx", args, {
			cwd: ctx.cwd,
			timeout: timeoutMs,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
			env,
		});

		const stdout = result.stdout ?? "";
		const stderr = result.stderr ?? "";
		const exitCode = result.status ?? 1;

		if (!stdout && !stderr) {
			return "Tests completed with no output.";
		}

		let output = stdout;
		if (exitCode !== 0 && stderr.trim().length > 0) {
			output += `\n\n### Errors\n\n\`\`\`\n${stderr}\n\`\`\``;
		}

		return output || "Tests completed with no output.";
	});
