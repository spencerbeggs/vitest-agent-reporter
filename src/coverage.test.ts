/**
 * vitest-agent-reporter
 *
 * Tests for coverage.ts: processCoverage()
 */

import { describe, expect, it } from "vitest";
import { processCoverage } from "./coverage.js";

function mockCoverageMap(
	files: Record<
		string,
		{
			summary: { statements: number; branches: number; functions: number; lines: number };
			uncoveredLines: number[];
		}
	>,
	totals = { statements: 90, branches: 85, functions: 88, lines: 91 },
): unknown {
	const allFiles = Object.keys(files);

	return {
		getCoverageSummary: () => ({
			statements: { pct: totals.statements },
			branches: { pct: totals.branches },
			functions: { pct: totals.functions },
			lines: { pct: totals.lines },
		}),
		files: () => allFiles,
		fileCoverageFor: (path: string) => ({
			toSummary: () => {
				const s = files[path].summary;
				return {
					statements: { pct: s.statements },
					branches: { pct: s.branches },
					functions: { pct: s.functions },
					lines: { pct: s.lines },
				};
			},
			getUncoveredLines: () => files[path].uncoveredLines,
		}),
	};
}

describe("processCoverage", () => {
	it("returns CoverageReport with correct totals", () => {
		const map = mockCoverageMap({});
		const result = processCoverage(map, { threshold: 80, includeBareZero: false });

		expect(result).toBeDefined();
		expect(result?.totals).toEqual({
			statements: 90,
			branches: 85,
			functions: 88,
			lines: 91,
		});
		expect(result?.threshold).toBe(80);
	});

	it("flags files below threshold on any metric", () => {
		const map = mockCoverageMap({
			"src/good.ts": {
				summary: { statements: 95, branches: 90, functions: 92, lines: 94 },
				uncoveredLines: [],
			},
			"src/bad.ts": {
				summary: { statements: 95, branches: 70, functions: 92, lines: 94 },
				uncoveredLines: [10, 20],
			},
		});

		const result = processCoverage(map, { threshold: 80, includeBareZero: false });

		expect(result?.lowCoverage).toHaveLength(1);
		expect(result?.lowCoverage[0].file).toBe("src/bad.ts");
		expect(result?.lowCoverageFiles).toEqual(["src/bad.ts"]);
	});

	it("skips bare-zero files by default", () => {
		const map = mockCoverageMap({
			"src/zero.ts": {
				summary: { statements: 0, branches: 0, functions: 0, lines: 0 },
				uncoveredLines: [],
			},
		});

		const result = processCoverage(map, { threshold: 80, includeBareZero: false });

		expect(result?.lowCoverage).toHaveLength(0);
	});

	it("includes bare-zero files when includeBareZero is true", () => {
		const map = mockCoverageMap({
			"src/zero.ts": {
				summary: { statements: 0, branches: 0, functions: 0, lines: 0 },
				uncoveredLines: [],
			},
		});

		const result = processCoverage(map, { threshold: 80, includeBareZero: true });

		expect(result?.lowCoverage).toHaveLength(1);
		expect(result?.lowCoverage[0].file).toBe("src/zero.ts");
	});

	it("sorts flagged files by lines% ascending (worst first)", () => {
		const map = mockCoverageMap({
			"src/medium.ts": {
				summary: { statements: 60, branches: 60, functions: 60, lines: 60 },
				uncoveredLines: [5, 6],
			},
			"src/worst.ts": {
				summary: { statements: 20, branches: 20, functions: 20, lines: 20 },
				uncoveredLines: [1, 2, 3],
			},
			"src/low.ts": {
				summary: { statements: 40, branches: 40, functions: 40, lines: 40 },
				uncoveredLines: [10, 11],
			},
		});

		const result = processCoverage(map, { threshold: 80, includeBareZero: false });

		expect(result?.lowCoverage.map((f) => f.file)).toEqual(["src/worst.ts", "src/low.ts", "src/medium.ts"]);
	});

	it("compresses uncovered lines into ranges", () => {
		const map = mockCoverageMap({
			"src/partial.ts": {
				summary: { statements: 50, branches: 50, functions: 50, lines: 50 },
				uncoveredLines: [1, 2, 3, 5, 10, 11, 12],
			},
		});

		const result = processCoverage(map, { threshold: 80, includeBareZero: false });

		expect(result?.lowCoverage[0].uncoveredLines).toBe("1-3,5,10-12");
	});

	it("returns undefined for a plain object without required methods", () => {
		const result = processCoverage({ foo: "bar" }, { threshold: 80, includeBareZero: false });
		expect(result).toBeUndefined();
	});

	it("returns undefined for null", () => {
		const result = processCoverage(null, { threshold: 80, includeBareZero: false });
		expect(result).toBeUndefined();
	});

	it("returns undefined for a string", () => {
		const result = processCoverage("coverage", { threshold: 80, includeBareZero: false });
		expect(result).toBeUndefined();
	});

	it("works with an empty files list", () => {
		const map = mockCoverageMap({});
		const result = processCoverage(map, { threshold: 80, includeBareZero: false });

		expect(result).toBeDefined();
		expect(result?.lowCoverage).toHaveLength(0);
		expect(result?.lowCoverageFiles).toHaveLength(0);
	});
});
