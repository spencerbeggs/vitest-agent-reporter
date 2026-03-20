/**
 * vitest-agent-reporter
 *
 * Tests for formatConsoleMarkdown() and getWorstMetric().
 */

import { describe, expect, it } from "vitest";
import type { AgentReport } from "../types.js";
import type { ConsoleFormatOptions } from "./console.js";
import { formatConsoleMarkdown, getWorstMetric, relativePath } from "./console.js";

// --- Test Fixtures ---

const baseOptions: ConsoleFormatOptions = {
	consoleOutput: "failures",
	coverageConsoleLimit: 10,
	noColor: true,
};

const passingReport: AgentReport = {
	timestamp: "2024-01-01T00:00:00.000Z",
	reason: "passed",
	summary: { total: 5, passed: 5, failed: 0, skipped: 0, duration: 120.456 },
	failed: [],
	unhandledErrors: [],
	failedFiles: [],
};

const failingReport: AgentReport = {
	timestamp: "2024-01-01T00:00:00.000Z",
	reason: "failed",
	summary: { total: 5, passed: 3, failed: 2, skipped: 0, duration: 250.789 },
	failed: [
		{
			file: "src/auth/login.test.ts",
			state: "failed",
			duration: 180,
			tests: [
				{
					name: "validates credentials",
					fullName: "Auth > validates credentials",
					state: "failed",
					duration: 90,
					errors: [{ message: "expected true to equal false", diff: "- true\n+ false" }],
				},
				{
					name: "rejects invalid token",
					fullName: "Auth > rejects invalid token",
					state: "failed",
					duration: 90,
					errors: [{ message: "expected 401 to equal 403" }],
				},
			],
		},
	],
	unhandledErrors: [],
	failedFiles: ["src/auth/login.test.ts"],
	coverage: {
		totals: { statements: 72, branches: 68, functions: 75, lines: 73 },
		threshold: 80,
		lowCoverage: [
			{
				file: "src/auth/session.ts",
				summary: { statements: 45, branches: 30, functions: 50, lines: 40 },
				uncoveredLines: "42-50,99,120-135",
			},
		],
		lowCoverageFiles: ["src/auth/session.ts"],
	},
};

// --- Tests ---

describe("relativePath", () => {
	it("strips cwd prefix from absolute path", () => {
		expect(relativePath("/Users/dev/project/src/foo.ts", "/Users/dev/project")).toBe("src/foo.ts");
	});

	it("returns path unchanged if no prefix match", () => {
		expect(relativePath("src/foo.ts", "/Users/dev/project")).toBe("src/foo.ts");
	});
});

describe("getWorstMetric", () => {
	it("returns the metric with the lowest percentage", () => {
		const coverage = failingReport.coverage;
		if (!coverage) throw new Error("fixture missing coverage");
		const f = coverage.lowCoverage[0];
		const worst = getWorstMetric(f);
		expect(worst.label).toBe("Branch");
		expect(worst.pct).toBe(30);
	});

	it("returns first metric when all are equal", () => {
		const f = {
			file: "src/equal.ts",
			summary: { statements: 50, branches: 50, functions: 50, lines: 50 },
			uncoveredLines: "",
		};
		const worst = getWorstMetric(f);
		expect(worst.pct).toBe(50);
	});
});

describe("formatConsoleMarkdown", () => {
	it("returns empty string in silent mode", () => {
		const result = formatConsoleMarkdown(passingReport, { ...baseOptions, consoleOutput: "silent" });
		expect(result).toBe("");
	});

	// --- Compact header ---

	it("passing report has compact header with count and duration", () => {
		const result = formatConsoleMarkdown(passingReport, baseOptions);
		expect(result).toContain("Vitest");
		expect(result).toContain("5 passed");
		expect(result).toContain("120ms");
	});

	it("failing report header shows failed and passed counts", () => {
		const result = formatConsoleMarkdown(failingReport, baseOptions);
		expect(result).toContain("2 failed");
		expect(result).toContain("3 passed");
	});

	it("rounds duration to integer", () => {
		const result = formatConsoleMarkdown(passingReport, baseOptions);
		expect(result).toContain("120ms");
		expect(result).not.toContain("120.456");
	});

	it("includes project name in header when present", () => {
		const withProject = { ...passingReport, project: "core:unit" };
		const result = formatConsoleMarkdown(withProject, baseOptions);
		expect(result).toContain("(core:unit)");
	});

	// --- Failed tests ---

	it("shows file path and test names for failures", () => {
		const result = formatConsoleMarkdown(failingReport, baseOptions);
		expect(result).toContain("src/auth/login.test.ts");
		expect(result).toContain("Auth > validates credentials");
		expect(result).toContain("Auth > rejects invalid token");
	});

	it("shows error messages and diffs", () => {
		const result = formatConsoleMarkdown(failingReport, baseOptions);
		expect(result).toContain("expected true to equal false");
		expect(result).toContain("```diff");
		expect(result).toContain("- true");
		expect(result).toContain("+ false");
	});

	// --- Coverage gaps ---

	it("shows coverage gaps with worst metric and uncovered lines", () => {
		const result = formatConsoleMarkdown(failingReport, baseOptions);
		expect(result).toContain("Coverage gaps");
		expect(result).toContain("src/auth/session.ts");
		expect(result).toContain("Branch: 30%");
		expect(result).toContain("uncovered: 42-50,99,120-135");
	});

	it("omits coverage section when no low coverage files", () => {
		const noCovGaps: AgentReport = {
			...passingReport,
			coverage: {
				totals: { statements: 95, branches: 90, functions: 100, lines: 95 },
				threshold: 80,
				lowCoverage: [],
				lowCoverageFiles: [],
			},
		};
		const result = formatConsoleMarkdown(noCovGaps, baseOptions);
		expect(result).not.toContain("Coverage gaps");
	});

	it("omits coverage section when no coverage data at all", () => {
		const result = formatConsoleMarkdown(passingReport, baseOptions);
		expect(result).not.toContain("Coverage");
	});

	it("does NOT show coverage totals table", () => {
		const result = formatConsoleMarkdown(failingReport, baseOptions);
		expect(result).not.toContain("Statements");
		expect(result).not.toContain("Branches");
		expect(result).not.toContain("Functions");
	});

	it("respects coverageConsoleLimit", () => {
		const manyFiles: AgentReport = {
			...passingReport,
			coverage: {
				totals: { statements: 50, branches: 50, functions: 50, lines: 50 },
				threshold: 80,
				lowCoverage: Array.from({ length: 15 }, (_, i) => ({
					file: `src/file${i}.ts`,
					summary: { statements: 40, branches: 40, functions: 40, lines: 40 },
					uncoveredLines: `${i * 10}-${i * 10 + 5}`,
				})),
				lowCoverageFiles: Array.from({ length: 15 }, (_, i) => `src/file${i}.ts`),
			},
		};
		const result = formatConsoleMarkdown(manyFiles, { ...baseOptions, coverageConsoleLimit: 3 });
		expect(result).toContain("src/file0.ts");
		expect(result).toContain("src/file2.ts");
		expect(result).not.toContain("src/file3.ts");
	});

	// --- Next steps ---

	it("shows next steps with re-run command for failures", () => {
		const result = formatConsoleMarkdown(failingReport, baseOptions);
		expect(result).toContain("Next steps");
		expect(result).toContain("vitest run src/auth/login.test.ts");
	});

	it("shows cache file path in next steps when provided", () => {
		const result = formatConsoleMarkdown(failingReport, {
			...baseOptions,
			cacheFile: ".vitest-agent-reporter/reports/default.json",
		});
		expect(result).toContain(".vitest-agent-reporter/reports/default.json");
	});

	// --- Footer ---

	it("shows 'All tests passed' for passing report", () => {
		const result = formatConsoleMarkdown(passingReport, baseOptions);
		expect(result).toContain("All tests passed");
	});

	it("does NOT show summary table", () => {
		const result = formatConsoleMarkdown(failingReport, baseOptions);
		expect(result).not.toContain("| Passed |");
		expect(result).not.toContain("| Total |");
		expect(result).not.toContain("| Duration |");
	});
});
