import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { CoverageReport } from "../schemas/Coverage.js";

export interface CoverageOptions {
	readonly threshold: number;
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
