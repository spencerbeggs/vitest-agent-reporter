/**
 * CLI history command -- displays test failure history.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import type { HistoryRecord } from "../../schemas/History.js";
import { CacheReader } from "../../services/CacheReader.js";
import { formatHistory } from "../lib/format-history.js";
import { resolveCacheDir } from "../lib/resolve-cache-dir.js";

const cacheDirOption = Options.text("cache-dir").pipe(
	Options.withAlias("d"),
	Options.withDescription("Cache directory path"),
	Options.optional,
);

export const historyCommand = Command.make("history", { cacheDir: cacheDirOption }, ({ cacheDir }) =>
	Effect.gen(function* () {
		const reader = yield* CacheReader;
		const dir = Option.isSome(cacheDir) ? cacheDir.value : yield* resolveCacheDir;

		const manifestOpt = yield* reader.readManifest(dir);
		if (Option.isNone(manifestOpt)) {
			yield* Effect.sync(() => process.stdout.write("No test results found. Run tests first.\n"));
			return;
		}

		const manifest = manifestOpt.value;
		const records: HistoryRecord[] = [];
		for (const entry of manifest.projects) {
			const history = yield* reader.readHistory(dir, entry.project);
			if (history.tests.length > 0) {
				records.push(history);
			}
		}

		const output = formatHistory(records);
		yield* Effect.sync(() => process.stdout.write(`${output}\n`));
	}),
);
