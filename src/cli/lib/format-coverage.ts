/**
 * Formats coverage gap analysis as markdown.
 *
 * @packageDocumentation
 */

import type { AgentReport } from "../../schemas/AgentReport.js";

export function formatCoverage(reports: ReadonlyArray<{ project: string; report: AgentReport }>): string {
	const lines: string[] = [];
	lines.push("## Coverage Gaps\n");

	for (const { project, report } of reports) {
		if (!report.coverage) continue;

		const lowCov = report.coverage.lowCoverage;
		if (lowCov.length === 0) continue;

		lines.push(`### ${project}`);
		lines.push(`**Threshold:** ${report.coverage.threshold}%\n`);
		lines.push("| File | Lines | Branches | Uncovered |");
		lines.push("| ---- | ----- | -------- | --------- |");

		for (const file of lowCov) {
			lines.push(`| ${file.file} | ${file.summary.lines}% | ${file.summary.branches}% | ${file.uncoveredLines} |`);
		}
	}

	return lines.join("\n");
}
