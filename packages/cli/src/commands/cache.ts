/**
 * CLI cache command -- manage the vitest-agent-reporter database.
 *
 * @packageDocumentation
 */

import { Args, Command, Options } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import {
	DataStore,
	clearSessionPointer,
	getSessionPointerPath,
	readSessionPointer,
	resolveDataPath,
	writeSessionPointer,
} from "vitest-agent-reporter-shared";

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

// Session pointer subcommands.
//
// SessionStart writes the pointer; SessionEnd clears it. CLI commands that
// take --cc-session-id fall back to the pointer when the flag is omitted, so
// agents invoking the CLI directly via Bash don't need to know their own
// session id (which Claude Code does not surface as an env var). See
// shared/utils/session-pointer.ts for path semantics and the multi-window
// caveat.

const sessionPointerSetSubcommand = Command.make(
	"set",
	{ ccSessionId: Args.text({ name: "cc-session-id" }) },
	({ ccSessionId }) =>
		Effect.gen(function* () {
			const dbPath = yield* resolveDataPath(process.cwd());
			yield* Effect.sync(() => writeSessionPointer(dbPath, ccSessionId));
			yield* Effect.sync(() => process.stdout.write(`${getSessionPointerPath(dbPath)}\n`));
		}),
).pipe(Command.withDescription("Write the active Claude Code session id pointer (called by SessionStart)"));

const sessionPointerGetSubcommand = Command.make("get", {}, () =>
	Effect.gen(function* () {
		const dbPath = yield* resolveDataPath(process.cwd());
		const value = readSessionPointer(dbPath);
		if (value !== null) yield* Effect.sync(() => process.stdout.write(`${value}\n`));
	}),
).pipe(Command.withDescription("Print the active Claude Code session id, if any"));

const sessionPointerClearSubcommand = Command.make("clear", {}, () =>
	Effect.gen(function* () {
		const dbPath = yield* resolveDataPath(process.cwd());
		yield* Effect.sync(() => clearSessionPointer(dbPath));
	}),
).pipe(Command.withDescription("Remove the active Claude Code session id pointer (called by SessionEnd)"));

const sessionPointerPathSubcommand = Command.make("path", {}, () =>
	Effect.gen(function* () {
		const dbPath = yield* resolveDataPath(process.cwd());
		yield* Effect.sync(() => process.stdout.write(`${getSessionPointerPath(dbPath)}\n`));
	}),
).pipe(Command.withDescription("Print the absolute path of the session pointer file"));

const sessionPointerCommand = Command.make("session-pointer").pipe(
	Command.withSubcommands([
		sessionPointerSetSubcommand,
		sessionPointerGetSubcommand,
		sessionPointerClearSubcommand,
		sessionPointerPathSubcommand,
	]),
	Command.withDescription("Manage the per-workspace Claude Code session id pointer"),
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

export const cacheCommand = cacheParent.pipe(
	Command.withSubcommands([pathCommand, cleanCommand, pruneCommand, sessionPointerCommand]),
);
