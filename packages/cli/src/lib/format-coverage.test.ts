import { describe, expect, it } from "vitest";
import type { AgentReport } from "vitest-agent-reporter-shared";
import { formatCoverage } from "./format-coverage.js";

function makeReport(overrides: Partial<AgentReport> = {}): AgentReport {
	return {
		timestamp: "2026-03-20T00:00:00.000Z",
		reason: "passed",
		summary: { total: 10, passed: 10, failed: 0, skipped: 0, duration: 100 },
		failed: [],
		unhandledErrors: [],
		failedFiles: [],
		...overrides,
	};
}

describe("formatCoverage", () => {
	it("renders cached threshold and project heading", () => {
		const report = makeReport({
			coverage: {
				totals: {
					statements: 80,
					branches: 70,
					functions: 90,
					lines: 75,
				},
				thresholds: { global: { lines: 80, functions: 80, branches: 80, statements: 80 }, patterns: [] },
				scoped: false,
				lowCoverage: [
					{
						file: "src/utils.ts",
						summary: {
							statements: 60,
							branches: 50,
							functions: 70,
							lines: 55,
						},
						uncoveredLines: "42-50,99",
					},
				],
				lowCoverageFiles: ["src/utils.ts"],
			},
		});

		const result = formatCoverage([{ project: "core", report }]);

		expect(result).toContain("## Coverage Gaps");
		expect(result).toContain("**Minimum thresholds:** lines: 80%, functions: 80%, branches: 80%, statements: 80%");
		expect(result).toContain("### core");
		expect(result).toContain("#### Files below minimum thresholds");
		expect(result).toContain("| File | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s |");
		expect(result).toContain("| src/utils.ts | 60 | 50 | 70 | 55 | 42-50,99 |");
	});

	it("renders multiple files in coverage table", () => {
		const report = makeReport({
			coverage: {
				totals: {
					statements: 70,
					branches: 60,
					functions: 80,
					lines: 65,
				},
				thresholds: { global: { lines: 80, functions: 80, branches: 80, statements: 80 }, patterns: [] },
				scoped: false,
				lowCoverage: [
					{
						file: "src/utils.ts",
						summary: {
							statements: 60,
							branches: 50,
							functions: 70,
							lines: 55,
						},
						uncoveredLines: "42-50",
					},
					{
						file: "src/coverage.ts",
						summary: {
							statements: 40,
							branches: 30,
							functions: 50,
							lines: 35,
						},
						uncoveredLines: "1-20,100-120",
					},
				],
				lowCoverageFiles: ["src/utils.ts", "src/coverage.ts"],
			},
		});

		const result = formatCoverage([{ project: "core", report }]);

		expect(result).toContain("| src/utils.ts |");
		expect(result).toContain("| src/coverage.ts |");
	});

	it("renders multiple projects with their own thresholds", () => {
		const report1 = makeReport({
			coverage: {
				totals: {
					statements: 80,
					branches: 70,
					functions: 90,
					lines: 75,
				},
				thresholds: { global: { lines: 80 }, patterns: [] },
				scoped: false,
				lowCoverage: [
					{
						file: "src/a.ts",
						summary: {
							statements: 50,
							branches: 40,
							functions: 60,
							lines: 45,
						},
						uncoveredLines: "10-20",
					},
				],
				lowCoverageFiles: ["src/a.ts"],
			},
		});

		const report2 = makeReport({
			coverage: {
				totals: {
					statements: 90,
					branches: 85,
					functions: 95,
					lines: 88,
				},
				thresholds: { global: { lines: 90, branches: 90 }, patterns: [] },
				scoped: false,
				lowCoverage: [
					{
						file: "src/b.ts",
						summary: {
							statements: 70,
							branches: 60,
							functions: 80,
							lines: 65,
						},
						uncoveredLines: "5-8",
					},
				],
				lowCoverageFiles: ["src/b.ts"],
			},
		});

		const result = formatCoverage([
			{ project: "core", report: report1 },
			{ project: "utils", report: report2 },
		]);

		expect(result).toContain("### core");
		expect(result).toContain("**Minimum thresholds:** lines: 80%");
		expect(result).toContain("### utils");
		expect(result).toContain("**Minimum thresholds:** lines: 90%, branches: 90%");
		expect(result).toContain("| src/a.ts |");
		expect(result).toContain("| src/b.ts |");
	});

	it("skips projects with no coverage", () => {
		const report = makeReport();
		const result = formatCoverage([{ project: "core", report }]);

		expect(result).toContain("## Coverage Gaps");
		expect(result).not.toContain("### core");
	});

	it("skips projects with empty low coverage", () => {
		const report = makeReport({
			coverage: {
				totals: {
					statements: 100,
					branches: 100,
					functions: 100,
					lines: 100,
				},
				thresholds: { global: { lines: 80, functions: 80, branches: 80, statements: 80 }, patterns: [] },
				scoped: false,
				lowCoverage: [],
				lowCoverageFiles: [],
			},
		});

		const result = formatCoverage([{ project: "core", report }]);

		expect(result).not.toContain("### core");
	});

	it("handles empty reports array", () => {
		const result = formatCoverage([]);
		expect(result).toContain("## Coverage Gaps");
	});
});
