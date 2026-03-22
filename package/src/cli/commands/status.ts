/**
 * CLI status command -- displays test status from cached results.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import type { AgentReport } from "../../schemas/AgentReport.js";
import { CacheReader } from "../../services/CacheReader.js";
import { formatStatus } from "../lib/format-status.js";
import { resolveCacheDir } from "../lib/resolve-cache-dir.js";

const cacheDirOption = Options.text("cache-dir").pipe(
	Options.withAlias("d"),
	Options.withDescription("Cache directory path"),
	Options.optional,
);

export const statusCommand = Command.make("status", { cacheDir: cacheDirOption }, ({ cacheDir }) =>
	Effect.gen(function* () {
		const reader = yield* CacheReader;
		const dir = Option.isSome(cacheDir) ? cacheDir.value : yield* resolveCacheDir;

		const manifestOpt = yield* reader.readManifest(dir);
		if (Option.isNone(manifestOpt)) {
			yield* Effect.sync(() => process.stdout.write("No test results found. Run tests first.\n"));
			return;
		}

		const manifest = manifestOpt.value;

		// Load failing reports
		const reports = new Map<string, AgentReport>();
		for (const entry of manifest.projects) {
			if (entry.lastResult === "failed") {
				const reportOpt = yield* reader.readReport(dir, entry.project);
				if (Option.isSome(reportOpt)) {
					reports.set(entry.project, reportOpt.value);
				}
			}
		}

		const output = formatStatus(manifest, reports);
		yield* Effect.sync(() => process.stdout.write(`${output}\n`));
	}),
);
