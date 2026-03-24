/**
 * CLI trends command -- display coverage trend data.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import type { ResolvedThresholds } from "../../schemas/Thresholds.js";
import type { TrendRecord } from "../../schemas/Trends.js";
import { DataReader } from "../../services/DataReader.js";
import { splitProject } from "../../utils/split-project.js";
import { formatTrends } from "../lib/format-trends.js";

const formatOption = Options.withDefault(Options.choice("format", ["markdown", "json"]), "markdown");

export const trendsCommand = Command.make("trends", { format: formatOption }, ({ format }) =>
	Effect.gen(function* () {
		const reader = yield* DataReader;

		const manifestOpt = yield* reader.getManifest();
		if (Option.isNone(manifestOpt)) {
			yield* Effect.sync(() => process.stdout.write("No test results found. Run tests first.\n"));
			return;
		}

		const manifest = manifestOpt.value;
		const projects: Array<{ project: string; trends: TrendRecord; targets?: ResolvedThresholds }> = [];

		for (const entry of manifest.projects) {
			const { project, subProject } = splitProject(entry.project);
			const trendsOpt = yield* reader
				.getTrends(project, subProject)
				.pipe(Effect.catchAll(() => Effect.succeed(Option.none())));

			if (Option.isSome(trendsOpt)) {
				const reportOpt = yield* reader
					.getLatestRun(project, subProject)
					.pipe(Effect.catchAll(() => Effect.succeed(Option.none())));
				const targets = Option.isSome(reportOpt) ? reportOpt.value.coverage?.targets : undefined;

				projects.push({
					project: entry.project,
					trends: trendsOpt.value,
					...(targets
						? { targets: { global: targets.global, perFile: false as const, patterns: targets.patterns ?? [] } }
						: {}),
				});
			}
		}

		if (format === "json") {
			yield* Effect.sync(() => process.stdout.write(`${JSON.stringify(projects, null, 2)}\n`));
		} else {
			const output = formatTrends(projects as Parameters<typeof formatTrends>[0]);
			yield* Effect.sync(() => process.stdout.write(`${output}\n`));
		}
	}),
);
