/**
 * Formats a test landscape overview as markdown.
 *
 * @packageDocumentation
 */

import type { CacheManifest, TestFileEntry } from "vitest-agent-sdk";

export function formatOverview(
	manifest: CacheManifest | null,
	testFiles: ReadonlyArray<TestFileEntry>,
	packageManager: string | null,
): string {
	const lines: string[] = [];
	lines.push("## Test Landscape\n");

	if (packageManager) {
		lines.push(`**Package manager:** ${packageManager}`);
	}
	lines.push(`**Test files:** ${testFiles.length}`);

	if (manifest) {
		lines.push(`**Projects:** ${manifest.projects.length}`);

		for (const entry of manifest.projects) {
			lines.push(`\n### ${entry.project}`);
			lines.push(`- **Last result:** ${entry.lastResult ?? "unknown"}`);
		}
	}

	// File map
	const mappedFiles = testFiles.filter((f) => f.sourceFiles.length > 0);
	if (mappedFiles.length > 0) {
		lines.push("\n### File Map");
		lines.push("| Source | Tests |");
		lines.push("| ------ | ----- |");

		// Group by source file
		const sourceMap = new Map<string, string[]>();
		for (const entry of mappedFiles) {
			for (const src of entry.sourceFiles) {
				const existing = sourceMap.get(src) ?? [];
				existing.push(entry.testFile);
				sourceMap.set(src, existing);
			}
		}

		for (const [source, tests] of sourceMap) {
			lines.push(`| ${source} | ${tests.join(", ")} |`);
		}
	}

	return lines.join("\n");
}
