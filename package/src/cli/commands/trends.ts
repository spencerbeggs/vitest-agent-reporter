/**
 * CLI trends command -- display coverage trend data.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { CacheReader } from "../../services/CacheReader.js";
import { formatTrends } from "../lib/format-trends.js";
import { resolveCacheDir } from "../lib/resolve-cache-dir.js";

const cacheDirOption = Options.text("cache-dir").pipe(
	Options.withAlias("d"),
	Options.withDescription("Cache directory path"),
	Options.optional,
);

export const trendsCommand = Command.make("trends", { cacheDir: cacheDirOption }, ({ cacheDir }) =>
	Effect.gen(function* () {
		const reader = yield* CacheReader;
		const dir = Option.isSome(cacheDir) ? cacheDir.value : yield* resolveCacheDir;

		const manifestOpt = yield* reader.readManifest(dir);
		if (Option.isNone(manifestOpt)) {
			yield* Effect.sync(() => process.stdout.write("No test results found. Run tests first.\n"));
			return;
		}

		const manifest = manifestOpt.value;
		const projects = [];

		for (const entry of manifest.projects) {
			const trendsOpt = yield* reader
				.readTrends(dir, entry.project)
				.pipe(Effect.catchAll(() => Effect.succeed(Option.none())));

			if (Option.isSome(trendsOpt)) {
				const reportOpt = yield* reader
					.readReport(dir, entry.project)
					.pipe(Effect.catchAll(() => Effect.succeed(Option.none())));
				const targets = Option.isSome(reportOpt) ? reportOpt.value.coverage?.targets : undefined;

				projects.push({
					project: entry.project,
					trends: trendsOpt.value,
					targets: targets
						? { global: targets.global, perFile: false as const, patterns: targets.patterns ?? [] }
						: undefined,
				});
			}
		}

		const output = formatTrends(projects as Parameters<typeof formatTrends>[0]);
		yield* Effect.sync(() => process.stdout.write(`${output}\n`));
	}),
);
