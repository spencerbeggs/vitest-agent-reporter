import { describe, expect, it } from "vitest";
import type { AgentReport } from "../schemas/AgentReport.js";
import { ciAnnotationsFormatter } from "./ci-annotations.js";

describe("ciAnnotationsFormatter", () => {
	it("emits one ::error::... line per failed test with extracted file/line", () => {
		const report: AgentReport = {
			timestamp: "2026-04-29T00:00:00Z",
			project: "demo",
			reason: "failed",
			summary: { total: 2, passed: 1, failed: 1, skipped: 0, duration: 50 },
			failed: [
				{
					file: "src/foo.test.ts",
					state: "failed",
					tests: [
						{
							name: "fails",
							fullName: "Foo > fails",
							state: "failed",
							errors: [
								{
									message: "expected 1 to equal 2",
									stack: "Error: expected 1 to equal 2\n    at Object.<anonymous> (src/foo.test.ts:42:7)",
								},
							],
						},
					],
				},
			],
			unhandledErrors: [],
			failedFiles: ["src/foo.test.ts"],
		};
		const out = ciAnnotationsFormatter.render([report], {
			detail: "neutral",
			noColor: true,
			coverageConsoleLimit: 10,
		});
		expect(out).toHaveLength(1);
		expect(out[0].target).toBe("stdout");
		expect(out[0].content).toContain("::error file=src/foo.test.ts,line=42");
		expect(out[0].content).toContain("expected 1 to equal 2");
	});

	it("emits a single passing-summary ::notice when no failures", () => {
		const report: AgentReport = {
			timestamp: "2026-04-29T00:00:00Z",
			reason: "passed",
			summary: { total: 5, passed: 5, failed: 0, skipped: 0, duration: 30 },
			failed: [],
			unhandledErrors: [],
			failedFiles: [],
		};
		const out = ciAnnotationsFormatter.render([report], {
			detail: "neutral",
			noColor: true,
			coverageConsoleLimit: 10,
		});
		expect(out[0].content).toContain("::notice");
		expect(out[0].content).toContain("5 passed");
	});

	it("escapes carriage returns and percent signs per GitHub Actions spec", () => {
		const report: AgentReport = {
			timestamp: "2026-04-29T00:00:00Z",
			reason: "failed",
			summary: { total: 1, passed: 0, failed: 1, skipped: 0, duration: 10 },
			failed: [
				{
					file: "src/x.test.ts",
					state: "failed",
					tests: [
						{
							name: "fails",
							fullName: "X > fails",
							state: "failed",
							errors: [{ message: "100%\nbroken\rfoo" }],
						},
					],
				},
			],
			unhandledErrors: [],
			failedFiles: ["src/x.test.ts"],
		};
		const out = ciAnnotationsFormatter.render([report], {
			detail: "neutral",
			noColor: true,
			coverageConsoleLimit: 10,
		});
		expect(out[0].content).toContain("100%25");
		expect(out[0].content).toContain("%0A");
		expect(out[0].content).toContain("%0D");
	});

	it("matches pathological '(((!((!' stack input in linear time (ReDoS regression)", () => {
		// CodeQL flagged the original STACK_FILE_LINE regex as polynomial on
		// inputs with many `(` and no closing `)`. Both `:` and `(` are now
		// excluded from the file-path character class so the engine cannot
		// retry at every `(` position. A 50k-char pathological input must
		// complete well under the test budget.
		const pathological = `Error\n    at fn ${"(".repeat(50000)}!`;
		const report: AgentReport = {
			timestamp: "2026-04-29T00:00:00Z",
			reason: "failed",
			summary: { total: 1, passed: 0, failed: 1, skipped: 0, duration: 1 },
			failed: [
				{
					file: "src/x.test.ts",
					state: "failed",
					tests: [
						{
							name: "fails",
							fullName: "X > fails",
							state: "failed",
							errors: [{ message: "boom", stack: pathological }],
						},
					],
				},
			],
			unhandledErrors: [],
			failedFiles: ["src/x.test.ts"],
		};
		const start = Date.now();
		const out = ciAnnotationsFormatter.render([report], {
			detail: "neutral",
			noColor: true,
			coverageConsoleLimit: 10,
		});
		const elapsed = Date.now() - start;
		expect(out).toHaveLength(1);
		expect(elapsed).toBeLessThan(500);
	});
});
