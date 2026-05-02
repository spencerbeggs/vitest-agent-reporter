/**
 * Formats coverage gap analysis as markdown.
 *
 * Two tiers per project, both rendered as 6-column tables matching
 * the reporter's terminal output:
 *
 * 1. Files below the minimum coverage thresholds (build-failing).
 * 2. Files below the aspirational coverage targets (warnings — the
 *    minimum is met but the target is not).
 *
 * The earlier version of this command only surfaced the first tier
 * via `lowCoverage`, so projects whose thresholds were satisfied but
 * whose targets were not produced an empty `## Coverage Gaps`
 * section. Both tiers now render.
 *
 * @packageDocumentation
 */

import type { AgentReport, FileCoverageReport, MetricThresholds } from "vitest-agent-reporter-shared";

/**
 * Format a metric-thresholds object as a comma-separated `key: N%`
 * list. Returns `none` when no metric is set.
 *
 * @internal
 */
function formatThresholdDisplay(thresholds: MetricThresholds | undefined): string {
	if (!thresholds) return "none";
	const parts: string[] = [];
	if (thresholds.lines !== undefined) parts.push(`lines: ${thresholds.lines}%`);
	if (thresholds.functions !== undefined) parts.push(`functions: ${thresholds.functions}%`);
	if (thresholds.branches !== undefined) parts.push(`branches: ${thresholds.branches}%`);
	if (thresholds.statements !== undefined) parts.push(`statements: ${thresholds.statements}%`);
	return parts.length > 0 ? parts.join(", ") : "none";
}

/**
 * Render a 6-column coverage table for the given file rows. Empty
 * input produces no output (caller is responsible for the section
 * heading).
 *
 * @internal
 */
function renderCoverageTable(files: ReadonlyArray<FileCoverageReport>): string[] {
	if (files.length === 0) return [];
	const lines: string[] = [];
	lines.push("| File | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s |");
	lines.push("| ---- | ------- | -------- | ------- | ------- | ----------------- |");
	for (const f of files) {
		const stmts = Math.round(f.summary.statements);
		const branches = Math.round(f.summary.branches);
		const funcs = Math.round(f.summary.functions);
		const linesPct = Math.round(f.summary.lines);
		lines.push(`| ${f.file} | ${stmts} | ${branches} | ${funcs} | ${linesPct} | ${f.uncoveredLines} |`);
	}
	return lines;
}

/**
 * Format coverage gap analysis as markdown for the CLI's `coverage`
 * subcommand.
 *
 * @public
 */
export function formatCoverage(reports: ReadonlyArray<{ project: string; report: AgentReport }>): string {
	const lines: string[] = [];
	lines.push("## Coverage Gaps\n");

	for (const { project, report } of reports) {
		const cov = report.coverage;
		if (!cov) continue;

		const belowThresholds = cov.lowCoverage;
		const belowTargets = cov.belowTarget ?? [];
		if (belowThresholds.length === 0 && belowTargets.length === 0) continue;

		lines.push(`### ${project}`);
		lines.push(`**Minimum thresholds:** ${formatThresholdDisplay(cov.thresholds.global)}`);
		if (cov.targets) {
			lines.push(`**Aspirational targets:** ${formatThresholdDisplay(cov.targets.global)}`);
		}
		lines.push("");

		if (belowThresholds.length > 0) {
			lines.push("#### Files below minimum thresholds");
			lines.push("");
			lines.push(...renderCoverageTable(belowThresholds));
			lines.push("");
		}

		if (belowTargets.length > 0) {
			lines.push("#### Files below aspirational targets");
			lines.push("");
			lines.push(...renderCoverageTable(belowTargets));
			lines.push("");
		}
	}

	return lines.join("\n");
}
