/**
 * CLI cache command -- manage the vitest-agent-reporter database.
 *
 * @packageDocumentation
 */

import { Command } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { resolveDataPath } from "vitest-agent-reporter-shared";

const pathCommand = Command.make("path", {}, () =>
	Effect.gen(function* () {
		const dbPath = yield* resolveDataPath(process.cwd());
		yield* Effect.sync(() => process.stdout.write(`${dbPath}\n`));
	}),
);

const cleanCommand = Command.make("clean", {}, () =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const dbPath = yield* resolveDataPath(process.cwd());
		yield* fs.remove(dbPath).pipe(Effect.catchAll(() => Effect.void));
		yield* Effect.sync(() => process.stdout.write(`Deleted database at ${dbPath}\n`));
	}),
);

const cacheParent = Command.make("cache");

export const cacheCommand = cacheParent.pipe(Command.withSubcommands([pathCommand, cleanCommand]));
