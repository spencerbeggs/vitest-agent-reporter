/**
 * Formats coverage gap analysis as markdown.
 *
 * @packageDocumentation
 */

import type { AgentReport } from "../../schemas/AgentReport.js";
import type { CoverageReport } from "../../schemas/Coverage.js";

/**
 * Format threshold display from the structured thresholds object.
 *
 * @internal
 */
function formatThresholdDisplay(thresholds: CoverageReport["thresholds"]): string {
	const parts: string[] = [];
	const g = thresholds.global;
	if (g.lines !== undefined) parts.push(`lines: ${g.lines}%`);
	if (g.functions !== undefined) parts.push(`functions: ${g.functions}%`);
	if (g.branches !== undefined) parts.push(`branches: ${g.branches}%`);
	if (g.statements !== undefined) parts.push(`statements: ${g.statements}%`);
	return parts.length > 0 ? parts.join(", ") : "none";
}

export function formatCoverage(reports: ReadonlyArray<{ project: string; report: AgentReport }>): string {
	const lines: string[] = [];
	lines.push("## Coverage Gaps\n");

	for (const { project, report } of reports) {
		if (!report.coverage) continue;

		const lowCov = report.coverage.lowCoverage;
		if (lowCov.length === 0) continue;

		lines.push(`### ${project}`);
		lines.push(`**Threshold:** ${formatThresholdDisplay(report.coverage.thresholds)}\n`);
		lines.push("| File | Lines | Branches | Uncovered |");
		lines.push("| ---- | ----- | -------- | --------- |");

		for (const file of lowCov) {
			lines.push(`| ${file.file} | ${file.summary.lines}% | ${file.summary.branches}% | ${file.uncoveredLines} |`);
		}
	}

	return lines.join("\n");
}
