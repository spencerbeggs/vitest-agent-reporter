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
		expect(result).toContain("### Files below minimum thresholds");
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

	it("dedupes coverage data across projects (coverage is global, not per-project)", () => {
		// In real monorepo runs the reporter attaches the same global
		// coverage data to every project's report. Without dedupe the
		// CLI would print every file once per project section.
		const sharedCoverage = {
			totals: { statements: 80, branches: 70, functions: 90, lines: 75 },
			thresholds: { global: { lines: 80 } as const, patterns: [] as Array<[string, never]> },
			scoped: false,
			lowCoverage: [
				{
					file: "src/a.ts",
					summary: { statements: 50, branches: 40, functions: 60, lines: 45 },
					uncoveredLines: "10-20",
				},
			],
			lowCoverageFiles: ["src/a.ts"],
		};
		const report1 = makeReport({ coverage: sharedCoverage });
		const report2 = makeReport({ coverage: sharedCoverage });

		const result = formatCoverage([
			{ project: "core", report: report1 },
			{ project: "utils", report: report2 },
		]);

		// Single threshold line + single table row (deduped on file path).
		const thresholdMatches = result.match(/\*\*Minimum thresholds:\*\*/g) ?? [];
		expect(thresholdMatches.length).toBe(1);
		const fileMatches = result.match(/\| src\/a\.ts \|/g) ?? [];
		expect(fileMatches.length).toBe(1);
		// No per-project headings: coverage is workspace-global.
		expect(result).not.toContain("### core");
		expect(result).not.toContain("### utils");
	});

	it("skips projects with no coverage", () => {
		const report = makeReport();
		const result = formatCoverage([{ project: "core", report }]);

		expect(result).toContain("## Coverage Gaps");
		expect(result).not.toContain("### Files below");
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

		expect(result).not.toContain("### Files below");
	});

	it("handles empty reports array", () => {
		const result = formatCoverage([]);
		expect(result).toContain("## Coverage Gaps");
	});
});
