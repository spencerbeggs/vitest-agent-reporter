/**
 * vitest-agent-reporter
 *
 * Coverage processing: duck-types an istanbul CoverageMap and produces
 * a {@link CoverageReport}.
 *
 * @packageDocumentation
 */

import type { CoverageReport, FileCoverageReport, IstanbulCoverageMap } from "./types.js";
import { compressLines } from "./utils.js";

/**
 * Runtime duck-type check for istanbul CoverageMap.
 *
 * @privateRemarks
 * We check for the three methods we use (`getCoverageSummary`, `files`,
 * `fileCoverageFor`) rather than importing istanbul types. This lets us
 * work with both `\@vitest/coverage-v8` and `\@vitest/coverage-istanbul`
 * without requiring either as a peer dependency.
 *
 * @internal
 */
function isIstanbulCoverageMap(value: unknown): value is IstanbulCoverageMap {
	if (value === null || typeof value !== "object") return false;
	const obj = value as Record<string, unknown>;
	return (
		typeof obj.getCoverageSummary === "function" &&
		typeof obj.files === "function" &&
		typeof obj.fileCoverageFor === "function"
	);
}

/**
 * Process an istanbul CoverageMap into a structured {@link CoverageReport}.
 *
 * @remarks
 * This function duck-types the incoming `coverageMap` value at runtime.
 * If it does not conform to the {@link IstanbulCoverageMap} interface,
 * `undefined` is returned and coverage is silently skipped.
 *
 * Files where all four metrics (statements, branches, functions, lines)
 * are at 0% are considered "bare zero" and excluded by default. These are
 * typically generated files or re-exports with no executable code.
 *
 * Low-coverage files are sorted worst-first by line coverage percentage
 * so agents see the most critical gaps first.
 *
 * @privateRemarks
 * The duck-typing approach avoids forcing consumers to install a specific
 * coverage provider. Both `\@vitest/coverage-v8` and `\@vitest/coverage-istanbul`
 * normalize to the same istanbul CoverageMap interface, so structural
 * checking is sufficient.
 *
 * @param coverageMap - The value received by `onCoverage`; duck-typed at runtime
 * @param options - Coverage processing options with `threshold` (percentage
 *   below which files are flagged, 0-100) and `includeBareZero` (whether to
 *   include files where all metrics are 0%)
 * @returns Structured coverage report, or `undefined` if duck-typing fails
 *
 * @see {@link IstanbulCoverageMap} for the expected interface
 * @see {@link compressLines} for the uncovered line range format
 * @internal
 */
export function processCoverage(
	coverageMap: unknown,
	options: { threshold: number; includeBareZero: boolean },
): CoverageReport | undefined {
	if (!isIstanbulCoverageMap(coverageMap)) return undefined;

	const { threshold, includeBareZero } = options;

	const summary = coverageMap.getCoverageSummary();
	const totals = {
		statements: summary.statements.pct,
		branches: summary.branches.pct,
		functions: summary.functions.pct,
		lines: summary.lines.pct,
	};

	const lowCoverage: FileCoverageReport[] = [];

	for (const filePath of coverageMap.files()) {
		const fileCoverage = coverageMap.fileCoverageFor(filePath);
		const fileSummary = fileCoverage.toSummary();

		const fileStats = {
			statements: fileSummary.statements.pct,
			branches: fileSummary.branches.pct,
			functions: fileSummary.functions.pct,
			lines: fileSummary.lines.pct,
		};

		// Skip bare-zero files (all four metrics = 0) unless includeBareZero
		const isBareZero =
			fileStats.statements === 0 && fileStats.branches === 0 && fileStats.functions === 0 && fileStats.lines === 0;

		if (isBareZero && !includeBareZero) continue;

		// Flag files where ANY metric is below threshold
		const isBelowThreshold =
			fileStats.statements < threshold ||
			fileStats.branches < threshold ||
			fileStats.functions < threshold ||
			fileStats.lines < threshold;

		if (!isBelowThreshold) continue;

		const uncoveredLines = compressLines(fileCoverage.getUncoveredLines());

		lowCoverage.push({
			file: filePath,
			summary: fileStats,
			uncoveredLines,
		});
	}

	// Sort worst-first by lines percentage ascending
	lowCoverage.sort((a, b) => a.summary.lines - b.summary.lines);

	return {
		totals,
		threshold,
		lowCoverage,
		lowCoverageFiles: lowCoverage.map((f) => f.file),
	};
}
