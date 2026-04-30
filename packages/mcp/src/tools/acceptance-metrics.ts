import { Effect, Schema } from "effect";
import { DataReader } from "vitest-agent-reporter-shared";
import { publicProcedure } from "../context.js";

export const acceptanceMetrics = publicProcedure
	.input(Schema.standardSchemaV1(Schema.Struct({})))
	.query(async ({ ctx }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const m = yield* reader.computeAcceptanceMetrics();
				const fmt = (r: { total: number; ratio: number }) =>
					r.total === 0 ? "no data" : `${(r.ratio * 100).toFixed(1)}% (n=${r.total})`;
				return [
					"# Acceptance metrics",
					"",
					`1. Phase-evidence integrity: ${fmt(m.phaseEvidenceIntegrity)} — target ≥80%`,
					`2. Compliance-hook responsiveness: ${fmt(m.complianceHookResponsiveness)} — target ≥40%`,
					`3. Orientation usefulness: ${fmt(m.orientationUsefulness)} — target ≥50%`,
					`4. Anti-pattern detection rate: ${fmt(m.antiPatternDetectionRate)} — target ≥95%`,
				].join("\n");
			}),
		);
	});
