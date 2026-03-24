import { Effect, Option, Schema } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { publicProcedure } from "../context.js";

export const configure = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				settingsHash: Schema.optional(Schema.String),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				if (input.settingsHash === undefined) {
					return [
						"# Configure",
						"",
						"This tool is read-only in the current version.",
						"",
						"To view settings for a specific test run, provide the `settingsHash` from",
						"a manifest entry or test run record.",
						"",
						"Configuration is written automatically by `AgentPlugin` when tests run.",
					].join("\n");
				}

				const reader = yield* DataReader;
				const settingsOpt = yield* reader.getSettings(input.settingsHash);

				if (Option.isNone(settingsOpt)) {
					return `No settings found for hash \`${input.settingsHash}\`.`;
				}

				const s = settingsOpt.value;
				const lines: string[] = [`# Settings — \`${s.hash}\``, ""];

				lines.push(`**Captured:** ${s.capturedAt}`);

				if (s.project) {
					lines.push(`**Project:** ${s.project}`);
				}

				if (s.environment) {
					lines.push(`**Environment:** ${s.environment}`);
				}

				if (s.pool) {
					lines.push(`**Pool:** ${s.pool}`);
				}

				if (s.shard) {
					lines.push(`**Shard:** ${s.shard}`);
				}

				lines.push("");
				lines.push("## Coverage");
				lines.push(`- **Enabled:** ${s.coverageEnabled ? "yes" : "no"}`);

				if (s.coverageProvider) {
					lines.push(`- **Provider:** ${s.coverageProvider}`);
				}

				if (s.coverageThresholds) {
					lines.push(`- **Thresholds:** \`${s.coverageThresholds}\``);
				}

				if (s.coverageTargets) {
					lines.push(`- **Targets:** \`${s.coverageTargets}\``);
				}

				if (s.reporters) {
					lines.push("");
					lines.push("## Reporters");
					lines.push(`\`${s.reporters}\``);
				}

				const envKeys = Object.keys(s.envVars);
				if (envKeys.length > 0) {
					lines.push("");
					lines.push("## Environment Variables");
					for (const key of envKeys) {
						lines.push(`- \`${key}\`: \`${s.envVars[key]}\``);
					}
				}

				return lines.join("\n");
			}),
		);
	});
