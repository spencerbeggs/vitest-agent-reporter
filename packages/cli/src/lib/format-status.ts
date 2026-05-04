/**
 * Formats a CacheManifest and optional reports into markdown status output.
 *
 * @packageDocumentation
 */

import type { AgentReport, CacheManifest } from "vitest-agent-sdk";

export function formatStatus(manifest: CacheManifest, reports: Map<string, AgentReport>): string {
	const lines: string[] = [];
	lines.push("## Vitest Test Status\n");

	// Summary table
	lines.push("| Project | Last Run | Result | Report |");
	lines.push("| ------- | -------- | ------ | ------ |");

	for (const entry of manifest.projects) {
		const result = entry.lastResult ?? "unknown";
		const lastRun = entry.lastRun ?? "never";
		lines.push(`| ${entry.project} | ${lastRun} | ${result} | ${entry.reportFile} |`);
	}

	// Failing project details
	const failingEntries = manifest.projects.filter((e) => e.lastResult === "failed");
	for (const entry of failingEntries) {
		const report = reports.get(entry.project);
		if (!report) continue;

		lines.push(`\n### Failing: ${entry.project}`);
		lines.push(`- ${report.summary.failed} failed, ${report.summary.passed} passed (${report.summary.duration}ms)`);
		if (report.failedFiles.length > 0) {
			lines.push(`- Failed files: ${report.failedFiles.join(", ")}`);
		}
	}

	return lines.join("\n");
}
