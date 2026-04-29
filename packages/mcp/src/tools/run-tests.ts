import { Writable } from "node:stream";
import { Effect, Schema } from "effect";
import type { AgentReport, VitestModuleError } from "vitest-agent-reporter-shared";
import { DataReader, buildAgentReport } from "vitest-agent-reporter-shared";
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

/**
 * Coerce unknown Vitest unhandled errors into VitestModuleError shape.
 *
 * @internal
 */
export function coerceErrors(errors: readonly unknown[]): VitestModuleError[] {
	return errors.map((e) => {
		if (e && typeof e === "object" && "message" in e) {
			const err = e as { message: string; stacks?: string[]; stack?: string };
			return {
				message: String(err.message),
				...(err.stacks ? { stacks: err.stacks } : err.stack ? { stacks: [err.stack] } : {}),
			};
		}
		return { message: String(e) };
	});
}

/**
 * Format an AgentReport as concise markdown suitable for MCP tool output.
 *
 * Classifications map test fullName to labels like "new-failure",
 * "persistent", "flaky", "recovered", "stable". Populated from DB
 * after the reporter writes history.
 *
 * @internal
 */
export function formatReportMarkdown(report: AgentReport, classifications?: ReadonlyMap<string, string>): string {
	const lines: string[] = [];
	const { summary } = report;
	const status = summary.failed > 0 ? "\u274C" : "\u2705";

	lines.push(
		`## ${status} Vitest -- ${summary.failed > 0 ? `${summary.failed} failed, ` : ""}${summary.passed} passed${summary.skipped > 0 ? `, ${summary.skipped} skipped` : ""} (${summary.duration}ms)`,
	);

	if (report.project) {
		lines.push(`\nProject: ${report.project}`);
	}

	for (const mod of report.failed) {
		lines.push(`\n### \u274C \`${mod.file}\``);
		for (const test of mod.tests) {
			if (test.state !== "failed") continue;
			const badge = classifications?.get(test.fullName);
			const label = badge ? ` [${badge}]` : "";
			lines.push(`\n- \u274C **${test.fullName}**${label}`);
			if (test.errors) {
				for (const err of test.errors) {
					lines.push(`  ${err.message}`);
					if (err.diff) {
						const diff =
							err.diff.length > 1000
								? `${err.diff.slice(0, 1000)}\n... (truncated, ${err.diff.length} chars total)`
								: err.diff;
						lines.push(`\n  \`\`\`diff\n  ${diff}\n  \`\`\``);
					}
				}
			}
		}
	}

	if (report.unhandledErrors.length > 0) {
		lines.push("\n### Unhandled Errors");
		for (const err of report.unhandledErrors) {
			lines.push(`\n- ${err.message}`);
			if (err.stack) {
				lines.push(`  \`\`\`\n  ${err.stack}\n  \`\`\``);
			}
		}
	}

	// Next steps
	if (summary.failed > 0 || report.unhandledErrors.length > 0) {
		const newFailures = classifications ? [...classifications.values()].filter((c) => c === "new-failure").length : 0;
		const persistent = classifications ? [...classifications.values()].filter((c) => c === "persistent").length : 0;
		const flaky = classifications ? [...classifications.values()].filter((c) => c === "flaky").length : 0;

		lines.push("\n### Next steps\n");
		if (newFailures > 0) lines.push(`- ${newFailures} new failure${newFailures > 1 ? "s" : ""} since last run`);
		if (persistent > 0) lines.push(`- ${persistent} persistent failure${persistent > 1 ? "s" : ""} (pre-existing)`);
		if (flaky > 0) lines.push(`- ${flaky} flaky test${flaky > 1 ? "s" : ""} -- consider retrying`);
		lines.push("- Use test_errors for detailed error analysis");
		lines.push("- Use test_history to check failure patterns");
		if (report.failedFiles.length > 0) {
			lines.push(`- Re-run failed: run_tests({ files: ${JSON.stringify(report.failedFiles)} })`);
		}
	}

	return lines.join("\n");
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
		const files = input.files ? sanitizeTestArgs(input.files) : [];
		const project = input.project ? sanitizeTestArgs([input.project])[0] : undefined;

		const timeoutMs = (input.timeout ?? 120) * 1000;

		// The MCP server communicates over stdio, so Vitest's console
		// output must not leak into stdout. Redirect to a null writable.
		const nullStream = new Writable({
			write(_chunk, _encoding, cb) {
				cb();
			},
		});

		// Dynamic import: vitest/node is only needed when this tool is
		// invoked. Keeps the MCP server startup fast.
		const { createVitest } = await import("vitest/node");

		let vitest: Awaited<ReturnType<typeof createVitest>> | undefined;

		try {
			vitest = await createVitest(
				"test",
				{
					root: ctx.cwd,
					run: true,
					coverage: { enabled: false },
					...(project ? { project } : {}),
				},
				{}, // viteOverrides
				{
					stdout: nullStream as unknown as NodeJS.WriteStream,
					stderr: nullStream as unknown as NodeJS.WriteStream,
				},
			);

			let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
			const result = await Promise.race([
				vitest.start(files.length > 0 ? files : undefined),
				new Promise<never>((_, reject) => {
					timeoutHandle = setTimeout(() => reject(new Error("VITEST_TIMEOUT")), timeoutMs);
				}),
			]).finally(() => {
				if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
			});

			const testModules = result.testModules as unknown as Parameters<typeof buildAgentReport>[0];
			const unhandledErrors = coerceErrors(result.unhandledErrors);

			const reason =
				unhandledErrors.length > 0 || result.testModules.some((m) => m.state() === "failed") ? "failed" : "passed";

			const report = buildAgentReport(testModules, unhandledErrors, reason, { omitPassingTests: true });

			// Read stored classifications from DB (written by the reporter via
			// classifyTest() during vitest.start). This avoids reimplementing
			// classification logic and stays consistent with AgentReporter.
			let classifications: ReadonlyMap<string, string> | undefined;
			try {
				const classProject = project ?? "default";
				classifications = await ctx.runtime.runPromise(
					Effect.gen(function* () {
						const reader = yield* DataReader;
						const tests = yield* reader.listTests(classProject, null, {});
						return new Map(
							tests.filter((t) => t.classification != null).map((t) => [t.fullName, t.classification as string]),
						);
					}),
				);
			} catch {
				// Classification is best-effort; don't fail the tool if DB read fails
			}

			return formatReportMarkdown(report, classifications);
		} catch (err) {
			if (err instanceof Error && err.message === "VITEST_TIMEOUT") {
				return `Test run timed out after ${input.timeout ?? 120} seconds.`;
			}
			const message = err instanceof Error ? err.message : String(err);
			return `Test run failed: ${message}`;
		} finally {
			await vitest?.close();
			nullStream.destroy();
		}
	});
