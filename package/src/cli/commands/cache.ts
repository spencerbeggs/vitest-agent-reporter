/**
 * CLI cache command -- manage the vitest-agent-reporter database.
 *
 * @packageDocumentation
 */

import { Command } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { resolveDbPath } from "../lib/resolve-cache-dir.js";

const pathCommand = Command.make("path", {}, () =>
	Effect.gen(function* () {
		const dbPath = yield* resolveDbPath();
		yield* Effect.sync(() => process.stdout.write(`${dbPath}\n`));
	}),
);

const cleanCommand = Command.make("clean", {}, () =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;

		const resolvedPath = yield* resolveDbPath().pipe(
			Effect.map((d): string | undefined => d),
			Effect.catchAll(() => Effect.succeed(undefined as string | undefined)),
		);

		if (resolvedPath === undefined) {
			yield* Effect.sync(() => process.stdout.write("No database found.\n"));
			return;
		}

		yield* fs.remove(resolvedPath).pipe(Effect.catchAll(() => Effect.void));
		yield* Effect.sync(() => process.stdout.write(`Deleted database at ${resolvedPath}\n`));
	}),
);

const cacheParent = Command.make("cache");

export const cacheCommand = cacheParent.pipe(Command.withSubcommands([pathCommand, cleanCommand]));
