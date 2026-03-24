import { Effect, Option, Schema } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { publicProcedure } from "../context.js";

export const testCoverage = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				project: Schema.optional(Schema.String),
				subProject: Schema.optional(Schema.String),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;

				const project = input.project ?? "default";
				const subProject = input.subProject ?? null;

				const reportOpt = yield* reader.getLatestRun(project, subProject);

				if (Option.isNone(reportOpt)) {
					return "No test data available. Run tests first.";
				}

				const report = reportOpt.value;
				const coverage = report.coverage;

				if (coverage === undefined) {
					return "No coverage data available. Run tests with coverage enabled.";
				}

				const lines: string[] = ["# Coverage Report", ""];

				const { totals, thresholds, targets } = coverage;

				lines.push("## Totals");
				lines.push("");
				lines.push("| Metric | Value | Threshold | Target |");
				lines.push("| --- | --- | --- | --- |");

				const metrics = ["statements", "branches", "functions", "lines"] as const;
				for (const metric of metrics) {
					const value = totals[metric];
					const threshold = thresholds.global[metric];
					const target = targets?.global[metric];
					const thresholdStr = threshold !== undefined ? `${threshold}%` : "—";
					const targetStr = target !== undefined ? `${target}%` : "—";
					const icon =
						threshold !== undefined && value < threshold ? "❌" : target !== undefined && value < target ? "⚠️" : "✅";
					lines.push(`| ${metric} | ${icon} ${value.toFixed(2)}% | ${thresholdStr} | ${targetStr} |`);
				}

				lines.push("");

				if (coverage.lowCoverage.length > 0) {
					lines.push("## Coverage Gaps");
					lines.push("");
					lines.push("Files below coverage threshold:");
					lines.push("");

					for (const fileCoverage of coverage.lowCoverage) {
						lines.push(`### \`${fileCoverage.file}\``);
						lines.push("");
						lines.push("| Metric | Value |");
						lines.push("| --- | --- |");
						for (const metric of metrics) {
							lines.push(`| ${metric} | ${fileCoverage.summary[metric].toFixed(2)}% |`);
						}
						if (fileCoverage.uncoveredLines) {
							lines.push(`| Uncovered lines | \`${fileCoverage.uncoveredLines}\` |`);
						}
						lines.push("");
					}
				} else {
					lines.push("✅ All files meet coverage thresholds.");
					lines.push("");
				}

				if (coverage.belowTarget && coverage.belowTarget.length > 0) {
					lines.push("## Below Target");
					lines.push("");
					lines.push("Files below coverage targets (informational):");
					lines.push("");

					for (const fileCoverage of coverage.belowTarget) {
						lines.push(`- \`${fileCoverage.file}\``);
					}
					lines.push("");
				}

				lines.push(`_Run as of: ${report.timestamp}_`);

				return lines.join("\n");
			}),
		);
	});
