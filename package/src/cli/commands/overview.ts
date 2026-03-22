/**
 * CLI overview command -- displays test landscape summary.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { CacheReader } from "../../services/CacheReader.js";
import { ProjectDiscovery } from "../../services/ProjectDiscovery.js";
import { formatOverview } from "../lib/format-overview.js";
import { resolveCacheDir } from "../lib/resolve-cache-dir.js";

const cacheDirOption = Options.text("cache-dir").pipe(
	Options.withAlias("d"),
	Options.withDescription("Cache directory path"),
	Options.optional,
);

export const overviewCommand = Command.make("overview", { cacheDir: cacheDirOption }, ({ cacheDir }) =>
	Effect.gen(function* () {
		const reader = yield* CacheReader;
		const discovery = yield* ProjectDiscovery;

		// Try to resolve cache dir, but don't fail if none exists
		let dir: string | null = null;
		if (Option.isSome(cacheDir)) {
			dir = cacheDir.value;
		} else {
			const resolved = yield* resolveCacheDir.pipe(
				Effect.map((d) => d as string | null),
				Effect.catchAll(() => Effect.succeed(null as string | null)),
			);
			dir = resolved;
		}

		// Read manifest if available
		let manifest = null;
		if (dir) {
			const manifestOpt = yield* reader.readManifest(dir);
			if (Option.isSome(manifestOpt)) manifest = manifestOpt.value;
		}

		// Discover test files
		const testFiles = yield* discovery
			.discoverTestFiles(process.cwd())
			.pipe(
				Effect.catchAll(() =>
					Effect.succeed(
						[] as ReadonlyArray<{ readonly testFile: string; readonly sourceFiles: ReadonlyArray<string> }>,
					),
				),
			);

		const output = formatOverview(manifest, testFiles, null);
		yield* Effect.sync(() => process.stdout.write(`${output}\n`));
	}),
);
