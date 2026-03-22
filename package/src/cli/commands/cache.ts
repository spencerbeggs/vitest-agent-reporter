/**
 * CLI cache command -- manage the vitest-agent-reporter cache.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import { resolveCacheDir } from "../lib/resolve-cache-dir.js";

const cacheDirOption = Options.text("cache-dir").pipe(
	Options.withAlias("d"),
	Options.withDescription("Cache directory path"),
	Options.optional,
);

const pathCommand = Command.make("path", { cacheDir: cacheDirOption }, ({ cacheDir }) =>
	Effect.gen(function* () {
		const dir = Option.isSome(cacheDir) ? cacheDir.value : yield* resolveCacheDir;
		yield* Effect.sync(() => process.stdout.write(`${dir}\n`));
	}),
);

const cleanCommand = Command.make("clean", { cacheDir: cacheDirOption }, ({ cacheDir }) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;

		// Try to resolve cache dir; if not found, report and exit
		const resolvedDir = yield* (Option.isSome(cacheDir) ? Effect.succeed(cacheDir.value) : resolveCacheDir).pipe(
			Effect.map((d): string | undefined => d),
			Effect.catchAll(() => Effect.succeed(undefined as string | undefined)),
		);

		if (resolvedDir === undefined) {
			yield* Effect.sync(() => process.stdout.write("No cache directory found.\n"));
			return;
		}

		yield* fs.remove(resolvedDir, { recursive: true }).pipe(Effect.catchAll(() => Effect.void));
		yield* Effect.sync(() => process.stdout.write(`Deleted cache at ${resolvedDir}\n`));
	}),
);

const cacheParent = Command.make("cache");

export const cacheCommand = cacheParent.pipe(Command.withSubcommands([pathCommand, cleanCommand]));
