/**
 * CLI cache command -- manage the vitest-agent-reporter database.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { DataStore, resolveDataPath } from "vitest-agent-reporter-shared";

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

const keepRecentOption = Options.withDefault(Options.integer("keep-recent"), 30).pipe(
	Options.withDescription("Number of most-recent sessions to keep in full"),
);

const pruneCommand = Command.make("prune", { keepRecent: keepRecentOption }, ({ keepRecent }) =>
	Effect.gen(function* () {
		const store = yield* DataStore;
		const result = yield* store.pruneSessions(keepRecent);
		yield* Effect.sync(() =>
			process.stdout.write(
				`Pruned ${result.prunedTurns} turn row(s) across ${result.affectedSessions} session(s); session rows retained.\n`,
			),
		);
	}),
).pipe(Command.withDescription("Drop old sessions' turn history (W1 retention; keeps the last N in full)"));

const cacheParent = Command.make("cache");

export const cacheCommand = cacheParent.pipe(Command.withSubcommands([pathCommand, cleanCommand, pruneCommand]));
