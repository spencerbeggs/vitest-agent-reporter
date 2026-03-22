/**
 * CLI coverage command -- displays coverage gap analysis.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import type { AgentReport } from "../../schemas/AgentReport.js";
import { CacheReader } from "../../services/CacheReader.js";
import { formatCoverage } from "../lib/format-coverage.js";
import { resolveCacheDir } from "../lib/resolve-cache-dir.js";

const cacheDirOption = Options.text("cache-dir").pipe(
	Options.withAlias("d"),
	Options.withDescription("Cache directory path"),
	Options.optional,
);

export const coverageCommand = Command.make("coverage", { cacheDir: cacheDirOption }, ({ cacheDir }) =>
	Effect.gen(function* () {
		const reader = yield* CacheReader;
		const dir = Option.isSome(cacheDir) ? cacheDir.value : yield* resolveCacheDir;

		const manifestOpt = yield* reader.readManifest(dir);
		if (Option.isNone(manifestOpt)) {
			yield* Effect.sync(() => process.stdout.write("No test results found.\n"));
			return;
		}

		const manifest = manifestOpt.value;
		const reportEntries: Array<{ project: string; report: AgentReport }> = [];

		for (const entry of manifest.projects) {
			const reportOpt = yield* reader.readReport(dir, entry.project);
			if (Option.isSome(reportOpt)) {
				reportEntries.push({ project: entry.project, report: reportOpt.value });
			}
		}

		const output = formatCoverage(reportEntries);
		yield* Effect.sync(() => process.stdout.write(`${output}\n`));
	}),
);
