import { describe, expect, it } from "vitest";
import type { AgentReport } from "../schemas/AgentReport.js";
import type { CoverageReport } from "../schemas/Coverage.js";
import type { MetricThresholds } from "../schemas/Thresholds.js";
import { formatTerminal } from "./format-terminal.js";

const baseReport = (overrides: Partial<AgentReport> = {}): AgentReport => ({
	timestamp: "2026-04-29T00:00:00Z",
	reason: "passed",
	summary: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 },
	failed: [],
	unhandledErrors: [],
	failedFiles: [],
	...overrides,
});

const coverage = (
	overrides: Partial<CoverageReport> & {
		thresholdsGlobal?: MetricThresholds;
		targetsGlobal?: MetricThresholds;
	} = {},
): CoverageReport => {
	const { thresholdsGlobal, targetsGlobal, ...rest } = overrides;
	return {
		totals: { lines: 100, branches: 100, functions: 100, statements: 100 },
		thresholds: {
			global: thresholdsGlobal ?? { lines: 80, branches: 80, functions: 80, statements: 80 },
			patterns: [],
		},
		...(targetsGlobal !== undefined ? { targets: { global: targetsGlobal, patterns: [] } } : {}),
		lowCoverage: [],
		lowCoverageFiles: [],
		...rest,
	} as CoverageReport;
};

const baseOptions = { noColor: true, coverageConsoleLimit: 10 };

describe("formatTerminal", () => {
	it("emits the single-default-project shape for one unnamed report", () => {
		const out = formatTerminal(
			[
				baseReport({
					summary: { total: 8, passed: 8, failed: 0, skipped: 0, duration: 42 },
				}),
			],
			baseOptions,
		);
		expect(out).not.toContain("Project");
		expect(out).not.toContain("##");
		expect(out).not.toContain("`");
		expect(out).toContain("✓ 8 passed (42ms)");
		expect(out).toContain("Total: 8 passed (42ms)");
	});

	it("emits Project header and indented row when single named project", () => {
		const out = formatTerminal(
			[
				baseReport({
					project: "my-app",
					summary: { total: 12, passed: 12, failed: 0, skipped: 0, duration: 1500 },
				}),
			],
			baseOptions,
		);
		expect(out).toContain("Project: my-app");
		expect(out).toContain("✓ 12 passed (1.5s)");
		expect(out).toContain("Total: 12 passed (1.5s)");
	});

	it("emits Projects (N) header for multi-project runs", () => {
		const out = formatTerminal(
			[
				baseReport({
					project: "shared",
					summary: { total: 545, passed: 545, failed: 0, skipped: 0, duration: 5577 },
				}),
				baseReport({
					project: "reporter",
					summary: { total: 103, passed: 103, failed: 0, skipped: 0, duration: 2106 },
				}),
			],
			baseOptions,
		);
		expect(out).toContain("Projects (2):");
		expect(out).toContain("  ✓ shared  ");
		expect(out).toContain("545 passed (5.6s)");
		expect(out).toContain("103 passed (2.1s)");
		expect(out).toContain("Total: 648 passed (5.6s)");
		expect(out).not.toContain("##");
	});

	it("renders the failure section with project grouping and re-run hints", () => {
		const out = formatTerminal(
			[
				baseReport({
					project: "reporter",
					reason: "failed",
					summary: { total: 1, passed: 0, failed: 1, skipped: 0, duration: 50 },
					failed: [
						{
							file: "src/foo.test.ts",
							state: "failed",
							tests: [
								{
									name: "rejects empty",
									fullName: "Foo > rejects empty",
									state: "failed",
									errors: [{ message: "expected ValidationError" }],
									classification: "new-failure",
								},
							],
						},
					],
					failedFiles: ["src/foo.test.ts"],
					unhandledErrors: [],
				}),
			],
			baseOptions,
		);
		expect(out).toContain("Failures:");
		expect(out).toContain("reporter");
		expect(out).toContain("✗ src/foo.test.ts > Foo > rejects empty");
		expect(out).toContain("[new-failure]");
		expect(out).toContain("expected ValidationError");
		expect(out).toContain("Total: 1 failed, 0 passed (50ms)");
		expect(out).toContain("Next steps:");
		expect(out).toContain("Re-run: pnpm vitest run src/foo.test.ts");
	});

	it("collapses coverage to a single met-line when thresholds and targets are both satisfied", () => {
		const out = formatTerminal(
			[
				baseReport({
					summary: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 10 },
					coverage: coverage({
						targetsGlobal: { lines: 80, branches: 80, functions: 80, statements: 80 },
						belowTarget: [],
					}),
				}),
			],
			baseOptions,
		);
		expect(out).toContain(
			"Coverage: ✓ minimum thresholds + aspirational targets met (lines, branches, funcs, stmts ≥ 80%)",
		);
		expect(out).not.toContain("Files below aspirational target:");
	});

	it("renders Files below target rows with all below-target metrics, sorted worst-first", () => {
		const out = formatTerminal(
			[
				baseReport({
					summary: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 10 },
					coverage: coverage({
						totals: { lines: 67, branches: 75, functions: 33, statements: 67 },
						thresholdsGlobal: { lines: 0, branches: 0, functions: 0, statements: 0 },
						targetsGlobal: { lines: 80, branches: 80, functions: 80, statements: 80 },
						belowTarget: [
							{
								file: "/repo/cli/src/lib/record-turn.ts",
								summary: { lines: 67, branches: 75, functions: 33, statements: 67 },
								uncoveredLines: "29-32, 34-38, 42, 48",
							},
						],
					}),
				}),
			],
			{ ...baseOptions },
		);
		expect(out).toContain("Coverage: ✓ minimum thresholds met");
		expect(out).toContain("Coverage: ⚠ 1 file below aspirational targets");
		expect(out).toContain("Files below aspirational target:");
		expect(out).toContain("record-turn.ts");
		// Worst-first: funcs (33) before stmts (67) before lines (67) before branches (75).
		const idxFuncs = out.indexOf("funcs 33%");
		const idxBranches = out.indexOf("branches 75%");
		expect(idxFuncs).toBeGreaterThan(0);
		expect(idxBranches).toBeGreaterThan(idxFuncs);
		expect(out).toContain("uncov 29-32, 34-38, 42, 48");
	});

	it("flags below-threshold coverage as a failure-tier coverage row", () => {
		const out = formatTerminal(
			[
				baseReport({
					summary: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 10 },
					coverage: coverage({
						totals: { lines: 50, branches: 50, functions: 50, statements: 50 },
						thresholdsGlobal: { lines: 80, branches: 80, functions: 80, statements: 80 },
						lowCoverage: [
							{
								file: "/repo/src/x.ts",
								summary: { lines: 50, branches: 50, functions: 50, statements: 50 },
								uncoveredLines: "1-50",
							},
						],
						lowCoverageFiles: ["/repo/src/x.ts"],
						belowTarget: [],
					}),
				}),
			],
			baseOptions,
		);
		expect(out).toContain("Coverage: ✗ 1 file below minimum thresholds");
		expect(out).not.toContain("aspirational targets met");
	});

	it("includes a Trend line when trendSummary is provided", () => {
		const out = formatTerminal(
			[
				baseReport({
					summary: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 10 },
					coverage: coverage(),
				}),
			],
			{
				...baseOptions,
				trendSummary: { direction: "stable", runCount: 50 },
			},
		);
		expect(out).toContain("Trend: stable (50 runs)");
	});

	it("emits no markdown syntax in any branch", () => {
		const out = formatTerminal(
			[
				baseReport({
					project: "p",
					reason: "failed",
					summary: { total: 2, passed: 1, failed: 1, skipped: 0, duration: 100 },
					failed: [
						{
							file: "src/x.test.ts",
							state: "failed",
							tests: [
								{
									name: "fails",
									fullName: "X > fails",
									state: "failed",
									errors: [{ message: "boom" }],
								},
							],
						},
					],
					failedFiles: ["src/x.test.ts"],
				}),
			],
			baseOptions,
		);
		expect(out).not.toMatch(/^#/m);
		expect(out).not.toContain("```");
		expect(out).not.toMatch(/^- /m);
	});
});
