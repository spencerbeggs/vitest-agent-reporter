/**
 * Formats coverage trend data as markdown.
 *
 * @packageDocumentation
 */

import type { ResolvedThresholds } from "../../schemas/Thresholds.js";
import type { TrendRecord } from "../../schemas/Trends.js";
import { getRecentDirection } from "../../utils/compute-trend.js";

interface TrendProject {
	project: string;
	trends: TrendRecord;
	targets?: ResolvedThresholds;
}

export function formatTrends(projects: TrendProject[]): string {
	const lines: string[] = [];
	lines.push("## Coverage Trends\n");

	if (projects.length === 0 || projects.every((p) => p.trends.entries.length === 0)) {
		lines.push("No trend data. Run tests with coverage to start tracking.");
		return lines.join("\n");
	}

	for (const { project, trends, targets } of projects) {
		if (trends.entries.length === 0) continue;

		const { direction, runCount } = getRecentDirection(trends);
		const latest = trends.entries[trends.entries.length - 1];

		lines.push(`### ${project}\n`);
		lines.push(`Direction: ${direction} (last ${runCount} runs)\n`);

		const hasTargets = targets?.global && Object.keys(targets.global).length > 0;

		if (hasTargets) {
			lines.push("| Metric | Current | 5-run avg | Target | Gap |");
			lines.push("| ------ | ------- | --------- | ------ | --- |");
		} else {
			lines.push("| Metric | Current | 5-run avg |");
			lines.push("| ------ | ------- | --------- |");
		}

		const recent5 = trends.entries.slice(-5);
		const metrics = ["lines", "functions", "branches", "statements"] as const;

		for (const m of metrics) {
			const current = latest.coverage[m];
			const avg = recent5.reduce((sum, e) => sum + e.coverage[m], 0) / recent5.length;
			const target = targets?.global?.[m];

			if (hasTargets) {
				const rawGap = target !== undefined ? target - current : undefined;
				const gap = rawGap !== undefined ? (rawGap <= 0 ? "met" : `${rawGap.toFixed(1)}%`) : "--";
				const targetStr = target !== undefined ? `${target}%` : "--";
				lines.push(
					`| ${m.charAt(0).toUpperCase() + m.slice(1)} | ${current.toFixed(1)}% | ${avg.toFixed(1)}% | ${targetStr} | ${gap} |`,
				);
			} else {
				lines.push(`| ${m.charAt(0).toUpperCase() + m.slice(1)} | ${current.toFixed(1)}% | ${avg.toFixed(1)}% |`);
			}
		}

		if (trends.entries.length > 1) {
			const trajectory = trends.entries
				.slice(-10)
				.map((e) => e.coverage.lines.toFixed(1))
				.join(" -> ");
			lines.push(`\nRecent: ${trajectory} (lines)`);
		}

		lines.push("");
	}

	return lines.join("\n");
}
