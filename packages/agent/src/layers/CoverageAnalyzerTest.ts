import { Effect, Layer, Option } from "effect";
import type { CoverageReport } from "vitest-agent-sdk";
import { CoverageAnalyzer } from "../services/CoverageAnalyzer.js";

export const CoverageAnalyzerTest = {
	layer: (data?: CoverageReport): Layer.Layer<CoverageAnalyzer> =>
		Layer.succeed(CoverageAnalyzer, {
			process: () => Effect.succeed(data ? Option.some(data) : Option.none()),
			processScoped: () => Effect.succeed(data ? Option.some(data) : Option.none()),
		}),
} as const;
