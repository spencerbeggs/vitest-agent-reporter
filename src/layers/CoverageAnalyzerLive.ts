import { Effect, Layer, Option } from "effect";
import type { CoverageReport, FileCoverageReport } from "../schemas/Coverage.js";
import type { CoverageOptions } from "../services/CoverageAnalyzer.js";
import { CoverageAnalyzer } from "../services/CoverageAnalyzer.js";
import { compressLines } from "../utils/compress-lines.js";

// --- Istanbul duck-type interfaces (local, not Effect Schemas) ---

interface IstanbulSummary {
	statements: { pct: number };
	branches: { pct: number };
	functions: { pct: number };
	lines: { pct: number };
}

interface IstanbulFileCoverage {
	toSummary(): IstanbulSummary;
	getUncoveredLines(): number[];
}

interface IstanbulCoverageMap {
	getCoverageSummary(): IstanbulSummary;
	files(): string[];
	fileCoverageFor(path: string): IstanbulFileCoverage;
}

/**
 * Runtime duck-type check for istanbul CoverageMap.
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
 * Internal coverage processing logic. Shared by both `process` and `processScoped`.
 *
 * @param coverageMap - The value received by `onCoverage`; duck-typed at runtime
 * @param options - Coverage processing options
 * @param testedFiles - When provided, only flag threshold violations for files in this set
 * @returns Structured coverage report, or undefined if duck-typing fails
 */
function processCoverageInternal(
	coverageMap: unknown,
	options: CoverageOptions,
	testedFiles?: ReadonlyArray<string>,
): CoverageReport | undefined {
	if (!isIstanbulCoverageMap(coverageMap)) return undefined;

	const { threshold, includeBareZero } = options;
	const scoped = testedFiles !== undefined;

	const summary = coverageMap.getCoverageSummary();
	const totals = {
		statements: summary.statements.pct,
		branches: summary.branches.pct,
		functions: summary.functions.pct,
		lines: summary.lines.pct,
	};

	const testedFileSet = testedFiles ? new Set(testedFiles) : undefined;
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

		const isBareZero =
			fileStats.statements === 0 && fileStats.branches === 0 && fileStats.functions === 0 && fileStats.lines === 0;

		// Skip bare-zero files unless includeBareZero is enabled
		if (isBareZero && !includeBareZero) continue;

		const isBelowThreshold =
			fileStats.statements < threshold ||
			fileStats.branches < threshold ||
			fileStats.functions < threshold ||
			fileStats.lines < threshold;

		// For scoped processing, only flag threshold violations for in-scope files
		if (scoped && !testedFileSet?.has(filePath)) {
			// Out-of-scope files are never flagged, even if below threshold
			continue;
		}

		// FIX: bare-zero files with includeBareZero=true always pass through
		// (the old code would skip them when threshold=0 because 0 < 0 is false)
		if (!isBareZero && !isBelowThreshold) continue;

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
		scoped,
		...(scoped && testedFiles ? { scopedFiles: [...testedFiles] } : {}),
		lowCoverage,
		lowCoverageFiles: lowCoverage.map((f) => f.file),
	};
}

export const CoverageAnalyzerLive: Layer.Layer<CoverageAnalyzer> = Layer.succeed(CoverageAnalyzer, {
	process: (coverage, options) =>
		Effect.sync(() => {
			const result = processCoverageInternal(coverage, options);
			return result ? Option.some(result) : Option.none();
		}),
	processScoped: (coverage, options, testedFiles) =>
		Effect.sync(() => {
			const result = processCoverageInternal(coverage, options, testedFiles);
			return result ? Option.some(result) : Option.none();
		}),
});
