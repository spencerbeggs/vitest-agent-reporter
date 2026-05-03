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
 * Coverage data is global across the workspace, not per-project: the
 * reporter runs the istanbul `CoverageMap` exactly once and attaches
 * the same result to every project's report (see the architecture
 * doc on per-project coverage). Rendering a separate section per
 * project would duplicate every file row N times in an N-project
 * monorepo. Instead we aggregate across projects, dedupe on file
 * path, and emit a single set of tables under `## Coverage Gaps`.
 * Threshold and target specs are pulled from the first project that
 * carries them — they are workspace-global by construction.
 *
 * @public
 */
export function formatCoverage(reports: ReadonlyArray<{ project: string; report: AgentReport }>): string {
	const lines: string[] = [];
	lines.push("## Coverage Gaps\n");

	// Dedupe across projects. The first occurrence of each file path
	// wins; later occurrences (from other projects' reports) carry
	// identical data and are discarded.
	const belowThresholdsByFile = new Map<string, FileCoverageReport>();
	const belowTargetsByFile = new Map<string, FileCoverageReport>();
	let thresholds: MetricThresholds | undefined;
	let targets: MetricThresholds | undefined;

	for (const { report } of reports) {
		const cov = report.coverage;
		if (!cov) continue;

		thresholds ??= cov.thresholds.global;
		targets ??= cov.targets?.global;

		for (const f of cov.lowCoverage) {
			if (!belowThresholdsByFile.has(f.file)) belowThresholdsByFile.set(f.file, f);
		}
		for (const f of cov.belowTarget ?? []) {
			if (!belowTargetsByFile.has(f.file)) belowTargetsByFile.set(f.file, f);
		}
	}

	if (belowThresholdsByFile.size === 0 && belowTargetsByFile.size === 0) {
		// Replace the empty `## Coverage Gaps` section body with an
		// explicit all-clear line. Without this, agents would receive
		// an ambiguous bare heading when invoking
		// `vitest-agent-reporter coverage` on a healthy project — they
		// can't distinguish "no gaps" from "the formatter forgot to
		// render the body". An explicit line gives them an
		// unambiguous signal there is nothing to act on.
		lines.push("All targets met — no coverage gaps.");
		return lines.join("\n");
	}

	lines.push(`**Minimum thresholds:** ${formatThresholdDisplay(thresholds)}`);
	if (targets) {
		lines.push(`**Aspirational targets:** ${formatThresholdDisplay(targets)}`);
	}
	lines.push("");

	if (belowThresholdsByFile.size > 0) {
		lines.push("### Files below minimum thresholds");
		lines.push("");
		lines.push(...renderCoverageTable([...belowThresholdsByFile.values()]));
		lines.push("");
	}

	if (belowTargetsByFile.size > 0) {
		lines.push("### Files below aspirational targets");
		lines.push("");
		lines.push(...renderCoverageTable([...belowTargetsByFile.values()]));
		lines.push("");
	}

	return lines.join("\n");
}
