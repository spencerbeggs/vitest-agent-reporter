import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { CoverageBaselines } from "../schemas/Baselines.js";
import type { CoverageReport } from "../schemas/Coverage.js";
import type { ResolvedThresholds } from "../schemas/Thresholds.js";

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
