import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { CoverageBaselines, CoverageReport, ResolvedThresholds } from "vitest-agent-reporter-shared";

export interface CoverageOptions {
	readonly thresholds: ResolvedThresholds;
	readonly targets?: ResolvedThresholds;
	readonly baselines?: CoverageBaselines;
	readonly includeBareZero: boolean;
}

export class CoverageAnalyzer extends Context.Tag("vitest-agent-reporter/CoverageAnalyzer")<
	CoverageAnalyzer,
	{
		readonly process: (coverage: unknown, options: CoverageOptions) => Effect.Effect<Option.Option<CoverageReport>>;
		readonly processScoped: (
			coverage: unknown,
			options: CoverageOptions,
			testedFiles: ReadonlyArray<string>,
		) => Effect.Effect<Option.Option<CoverageReport>>;
	}
>() {}
