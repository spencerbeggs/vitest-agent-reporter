/**
 * Plain-text terminal formatter for `AgentReport` collections.
 *
 * Designed for stdout: no markdown syntax, ANSI color when permitted,
 * compact columnar layout. Sibling to `format-console.ts` (markdown for
 * MCP / GFM) but consumed only by the `terminal` formatter — never
 * reaches MCP responses.
 *
 * Output sections (in order):
 *
 * 1. Project rows — one line per project, with per-project pass/fail
 *    counts and duration. Single-project repos with a default project
 *    name skip the project label entirely.
 * 2. Failures (when present) — grouped by project, with the test name,
 *    classification, error message, and a re-run hint inline.
 * 3. Coverage — header line distinguishing threshold-pass from
 *    target-aspiration, plus per-file rows showing every below-target
 *    metric and the uncovered-line ranges.
 * 4. Trend — single line summarizing direction and run count.
 * 5. Total — aggregated pass/fail/skipped count and total wall time.
 * 6. Next steps — re-run hints when failures exist.
 *
 * @packageDocumentation
 */

import type { AgentReport, TestReport } from "../schemas/AgentReport.js";
import type { FileCoverageReport } from "../schemas/Coverage.js";
import type { MetricThresholds } from "../schemas/Thresholds.js";
import type { AnsiOptions } from "./ansi.js";
import { ansi } from "./ansi.js";
import { compressLines } from "./compress-lines.js";
import { relativePath } from "./format-console.js";

/**
 * Compress a comma-separated line list into ranges where consecutive
 * numbers run together. Defensive: callers may pass already-compressed
 * strings (`"29-32, 34-38"`) or uncompressed (`"29,30,31,32,34,35,36,
 * 37,38"`); both are handled. If parsing fails, the original string is
 * returned unchanged.
 *
 * @internal
 */
const compressUncov = (uncoveredLines: string): string => {
	if (uncoveredLines.length === 0) return "";
	// Already-compressed strings contain hyphens; pass through unchanged.
	if (uncoveredLines.includes("-")) return uncoveredLines;
	const numbers: number[] = [];
	for (const piece of uncoveredLines.split(",")) {
		const n = Number.parseInt(piece.trim(), 10);
		if (Number.isNaN(n)) return uncoveredLines;
		numbers.push(n);
	}
	return compressLines(numbers);
};

/**
 * Options controlling terminal output.
 *
 * @internal
 */
export interface TerminalFormatOptions {
	readonly noColor: boolean;
	readonly coverageConsoleLimit: number;
	readonly trendSummary?: {
		direction: "improving" | "regressing" | "stable";
		runCount: number;
		firstMetric?: { name: string; from: number; to: number; target?: number };
	};
	readonly mcp?: boolean;
}

const METRICS = [
	{ key: "lines", label: "lines" },
	{ key: "branches", label: "branches" },
	{ key: "functions", label: "funcs" },
	{ key: "statements", label: "stmts" },
] as const;

/**
 * Format a duration in milliseconds as a short human string.
 *
 * Sub-second durations stay in ms (`"328ms"`); >=1s switch to seconds
 * with one decimal (`"5.6s"`). Avoids the noise of "5577ms" in summary
 * rows where second-level precision is plenty.
 *
 * @internal
 */
const formatDuration = (ms: number): string => {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
};

/**
 * Decide whether the project label should appear in the row.
 *
 * Single-project setups with no explicit `project.name` (Vitest's
 * default) yield a `project` of `"default"` after `splitProject`. In
 * that case there's nothing to disambiguate; suppress the label.
 *
 * @internal
 */
const showProjectLabel = (reports: ReadonlyArray<AgentReport>): boolean => {
	if (reports.length > 1) return true;
	const single = reports[0];
	if (!single?.project) return false;
	if (single.project === "default") return false;
	return true;
};

/**
 * Right-pad a column value to a fixed width with spaces. Plain ASCII
 * width — does not account for ANSI escapes (caller is responsible).
 *
 * @internal
 */
const pad = (s: string, width: number): string => (s.length >= width ? s : s + " ".repeat(width - s.length));

/**
 * Project row: `✓ name      103 passed (2.1s)` or
 * `✗ name      102 passed, 1 failed (2.1s)`.
 *
 * @internal
 */
const renderProjectRow = (report: AgentReport, ao: AnsiOptions, nameWidth: number): string => {
	const failed = report.summary.failed;
	const passed = report.summary.passed;
	const skipped = report.summary.skipped;
	const duration = formatDuration(report.summary.duration);
	const name = report.project ?? "default";
	const tick = failed === 0 ? ansi("✓", "green", ao) : ansi("✗", "red", ao);
	const counts: string[] = [];
	if (failed > 0) counts.push(`${failed} failed`);
	counts.push(`${passed} passed`);
	if (skipped > 0) counts.push(`${skipped} skipped`);
	return `  ${tick} ${pad(name, nameWidth)}  ${counts.join(", ")} (${duration})`;
};

/**
 * Pull all below-target metrics for a file, sorted worst-first.
 *
 * @internal
 */
const belowTargetMetrics = (
	f: FileCoverageReport,
	targets: MetricThresholds | undefined,
): Array<{ label: string; key: "lines" | "branches" | "functions" | "statements"; pct: number; target: number }> => {
	if (!targets) return [];
	const out: Array<{
		label: string;
		key: "lines" | "branches" | "functions" | "statements";
		pct: number;
		target: number;
	}> = [];
	for (const m of METRICS) {
		const target = targets[m.key];
		if (target == null) continue;
		const pct = f.summary[m.key];
		if (pct < target) out.push({ label: m.label, key: m.key, pct, target });
	}
	out.sort((a, b) => a.pct - b.pct);
	return out;
};

/**
 * Format the global target spec compactly.
 *
 * If every metric has the same target (the common case), collapse to
 * `≥ 80% lines, branches, funcs, stmts`. If targets differ, list per
 * metric: `lines ≥ 80%, branches ≥ 75%, funcs ≥ 70%, stmts ≥ 80%`.
 *
 * @internal
 */
const formatTargetSpec = (targets: MetricThresholds): string => {
	const set = new Set<number>();
	const present: Array<{ label: string; v: number }> = [];
	for (const m of METRICS) {
		const v = targets[m.key];
		if (v == null) continue;
		set.add(v);
		present.push({ label: m.label, v });
	}
	if (present.length === 0) return "";
	if (set.size === 1) {
		const v = [...set][0];
		return `${present.map((p) => p.label).join(", ")} ≥ ${v}%`;
	}
	return present.map((p) => `${p.label} ≥ ${p.v}%`).join(", ");
};

/**
 * Render uncovered line ranges with a metric prefix.
 *
 * @internal
 */
const renderUncov = (uncoveredLines: string): string => {
	const compressed = compressUncov(uncoveredLines);
	return compressed.length === 0 ? "" : `uncov ${compressed}`;
};

/**
 * Below-target file row plus its uncov continuation line.
 *
 * @internal
 */
const renderBelowTargetFile = (f: FileCoverageReport, targets: MetricThresholds): string[] => {
	const path = relativePath(f.file);
	const below = belowTargetMetrics(f, targets);
	if (below.length === 0) return [];
	const metricsCol = below.map((m) => `${m.label} ${Math.round(m.pct)}%`).join(", ");
	const lines = [`  ${path}  ${metricsCol}`];
	const uncov = renderUncov(f.uncoveredLines);
	if (uncov) lines.push(`    ${uncov}`);
	return lines;
};

/**
 * Aggregated coverage state across reports.
 *
 * @internal
 */
const aggregateCoverage = (
	reports: ReadonlyArray<AgentReport>,
): {
	hasCoverage: boolean;
	thresholdsMet: boolean;
	belowThresholdCount: number;
	belowTargetFiles: ReadonlyArray<FileCoverageReport>;
	thresholdsGlobal?: MetricThresholds;
	targetsGlobal?: MetricThresholds;
} => {
	let hasCoverage = false;
	let thresholdsGlobal: MetricThresholds | undefined;
	let targetsGlobal: MetricThresholds | undefined;
	const belowTargetFiles: FileCoverageReport[] = [];
	let belowThresholdCount = 0;
	for (const r of reports) {
		const cov = r.coverage;
		if (!cov) continue;
		hasCoverage = true;
		thresholdsGlobal ??= cov.thresholds.global;
		targetsGlobal ??= cov.targets?.global;
		if (cov.lowCoverage) belowThresholdCount += cov.lowCoverage.length;
		if (cov.belowTarget) belowTargetFiles.push(...cov.belowTarget);
	}
	return {
		hasCoverage,
		thresholdsMet: belowThresholdCount === 0,
		belowThresholdCount,
		belowTargetFiles,
		...(thresholdsGlobal !== undefined ? { thresholdsGlobal } : {}),
		...(targetsGlobal !== undefined ? { targetsGlobal } : {}),
	};
};

/**
 * Coverage section: one or two summary lines plus per-file rows.
 *
 * @internal
 */
const renderCoverageSection = (
	reports: ReadonlyArray<AgentReport>,
	options: TerminalFormatOptions,
	ao: AnsiOptions,
): string[] => {
	const agg = aggregateCoverage(reports);
	if (!agg.hasCoverage) return [];

	const lines: string[] = [];

	// Summary line
	if (!agg.thresholdsMet) {
		const spec = agg.thresholdsGlobal ? formatTargetSpec(agg.thresholdsGlobal) : "";
		const cross = ansi("✗", "red", ao);
		lines.push(
			`Coverage: ${cross} ${agg.belowThresholdCount} file${agg.belowThresholdCount === 1 ? "" : "s"} below thresholds${spec ? ` (${spec})` : ""}`,
		);
	} else if (agg.belowTargetFiles.length > 0) {
		const spec = agg.targetsGlobal ? formatTargetSpec(agg.targetsGlobal) : "";
		const tick = ansi("✓", "green", ao);
		lines.push(
			`Coverage: ${tick} thresholds met, ${agg.belowTargetFiles.length} file${agg.belowTargetFiles.length === 1 ? "" : "s"} below targets${spec ? ` (${spec})` : ""}`,
		);
	} else {
		const tick = ansi("✓", "green", ao);
		const spec = agg.targetsGlobal ? formatTargetSpec(agg.targetsGlobal) : "";
		lines.push(`Coverage: ${tick} all targets met${spec ? ` (${spec})` : ""}`);
	}

	// Trend line (separate from summary so it groups with coverage)
	if (options.trendSummary) {
		const { direction, runCount } = options.trendSummary;
		lines.push(`Trend: ${direction} (${runCount} runs)`);
	}

	// Per-file below-target rows
	if (agg.belowTargetFiles.length > 0 && agg.targetsGlobal) {
		lines.push("");
		lines.push("Files below target:");
		const limit = options.coverageConsoleLimit;
		const shown = agg.belowTargetFiles.slice(0, limit);
		for (const f of shown) {
			lines.push(...renderBelowTargetFile(f, agg.targetsGlobal));
		}
		if (agg.belowTargetFiles.length > limit) {
			lines.push(
				`  … ${agg.belowTargetFiles.length - limit} more (run \`vitest-agent-reporter coverage\` for full list)`,
			);
		}
	}

	return lines;
};

/**
 * Failures block: grouped by project, one entry per failed test with
 * inline error message and stack hint.
 *
 * @internal
 */
const renderFailuresSection = (reports: ReadonlyArray<AgentReport>, ao: AnsiOptions): string[] => {
	const lines: string[] = [];
	const reportsWithFailures = reports.filter((r) => r.summary.failed > 0 || r.unhandledErrors.length > 0);
	if (reportsWithFailures.length === 0) return lines;

	lines.push("Failures:");
	for (const report of reportsWithFailures) {
		const projectName = report.project ?? "default";
		lines.push(`  ${projectName}`);
		for (const mod of report.failed) {
			const file = relativePath(mod.file);
			const failedTests = mod.tests.filter((t) => t.state === "failed");
			for (const test of failedTests) {
				lines.push(...renderFailedTest(file, test, ao));
			}
			if (mod.errors && mod.errors.length > 0) {
				for (const err of mod.errors) {
					lines.push(`    ${ansi("✗", "red", ao)} ${file} (module-level error)`);
					lines.push(`        ${ansi(err.message, "red", ao)}`);
				}
			}
		}
		for (const err of report.unhandledErrors) {
			lines.push(`    ${ansi("✗", "red", ao)} unhandled error`);
			lines.push(`        ${ansi(err.message, "red", ao)}`);
		}
	}
	return lines;
};

const renderFailedTest = (file: string, test: TestReport, ao: AnsiOptions): string[] => {
	const cross = ansi("✗", "red", ao);
	const cls = test.classification ? ansi(`  [${test.classification}]`, "dim", ao) : "";
	const lines = [`    ${cross} ${file} > ${test.fullName}${cls}`];
	if (test.errors && test.errors.length > 0) {
		for (const err of test.errors) {
			lines.push(`        ${ansi(err.message, "dim", ao)}`);
		}
	}
	return lines;
};

/**
 * Total line: aggregated pass/fail/skip counts + max-project duration.
 *
 * @internal
 */
const renderTotal = (reports: ReadonlyArray<AgentReport>, ao: AnsiOptions): string => {
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	let maxDuration = 0;
	for (const r of reports) {
		passed += r.summary.passed;
		failed += r.summary.failed;
		skipped += r.summary.skipped;
		if (r.summary.duration > maxDuration) maxDuration = r.summary.duration;
	}
	const parts: string[] = [];
	if (failed > 0) parts.push(ansi(`${failed} failed`, "red", ao));
	parts.push(`${passed} passed`);
	if (skipped > 0) parts.push(`${skipped} skipped`);
	return `Total: ${parts.join(", ")} (${formatDuration(maxDuration)})`;
};

/**
 * Re-run hints when failures exist.
 *
 * @internal
 */
const renderNextSteps = (reports: ReadonlyArray<AgentReport>, options: TerminalFormatOptions): string[] => {
	const lines: string[] = [];
	const allFailedFiles = new Set<string>();
	for (const r of reports) {
		for (const f of r.failedFiles) allFailedFiles.add(relativePath(f));
	}
	if (allFailedFiles.size === 0) return lines;

	lines.push("Next steps:");
	for (const file of allFailedFiles) {
		lines.push(`  Re-run: pnpm vitest run ${file}`);
	}
	if (options.mcp) {
		lines.push("  Use the test_history MCP tool to check failure trends");
		lines.push("  Use the test_errors MCP tool to search errors by type");
	}
	return lines;
};

/**
 * Header line for multi-project runs.
 *
 * @internal
 */
const renderHeader = (reports: ReadonlyArray<AgentReport>): string[] => {
	const lines: string[] = [];
	if (showProjectLabel(reports) && reports.length > 1) {
		lines.push(`Projects (${reports.length}):`);
	} else if (showProjectLabel(reports) && reports.length === 1) {
		lines.push(`Project: ${reports[0]?.project ?? "default"}`);
	}
	return lines;
};

/**
 * Public entry point: render a collection of `AgentReport` rows as
 * a single plain-text block for stdout.
 *
 * @public
 */
export const formatTerminal = (reports: ReadonlyArray<AgentReport>, options: TerminalFormatOptions): string => {
	if (reports.length === 0) return "";

	const ao: AnsiOptions = { noColor: options.noColor };
	const out: string[] = [];

	const header = renderHeader(reports);
	if (header.length > 0) out.push(...header);

	if (reports.length > 1) {
		// Multi-project: indented project list.
		const widths = reports.map((r) => (r.project ?? "default").length);
		const nameWidth = Math.max(0, ...widths);
		for (const r of reports) {
			out.push(renderProjectRow(r, ao, nameWidth));
		}
		out.push("");
	} else if (showProjectLabel(reports)) {
		// Single named project: simpler per-project tick row.
		const r = reports[0];
		if (r) {
			const tick = r.summary.failed === 0 ? ansi("✓", "green", ao) : ansi("✗", "red", ao);
			const counts: string[] = [];
			if (r.summary.failed > 0) counts.push(`${r.summary.failed} failed`);
			counts.push(`${r.summary.passed} passed`);
			if (r.summary.skipped > 0) counts.push(`${r.summary.skipped} skipped`);
			out.push(`${tick} ${counts.join(", ")} (${formatDuration(r.summary.duration)})`);
			out.push("");
		}
	} else if (reports.length === 1) {
		// Single default project: leading tick row, no label.
		const r = reports[0];
		if (r) {
			const tick = r.summary.failed === 0 ? ansi("✓", "green", ao) : ansi("✗", "red", ao);
			const counts: string[] = [];
			if (r.summary.failed > 0) counts.push(`${r.summary.failed} failed`);
			counts.push(`${r.summary.passed} passed`);
			if (r.summary.skipped > 0) counts.push(`${r.summary.skipped} skipped`);
			out.push(`${tick} ${counts.join(", ")} (${formatDuration(r.summary.duration)})`);
			out.push("");
		}
	}

	const failures = renderFailuresSection(reports, ao);
	if (failures.length > 0) {
		out.push(...failures);
		out.push("");
	}

	const coverage = renderCoverageSection(reports, options, ao);
	if (coverage.length > 0) {
		out.push(...coverage);
		out.push("");
	}

	out.push(renderTotal(reports, ao));

	const nextSteps = renderNextSteps(reports, options);
	if (nextSteps.length > 0) {
		out.push("");
		out.push(...nextSteps);
	}

	return out.join("\n");
};
