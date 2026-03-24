/**
 * Auto-discovers the vitest-agent-reporter cache directory or database path.
 *
 * @remarks
 * The cache directory is configurable via the plugin/reporter options.
 * These functions scan well-known default locations as a fallback.
 * A future improvement would use Vitest's programmatic API
 * (`createVitest`) to resolve the actual config.
 *
 * @packageDocumentation
 */

import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { DataStoreError } from "../../errors/DataStoreError.js";

const DEFAULT_LOCATIONS = [".vitest-agent-reporter", "node_modules/.vite/vitest-agent-reporter"];

const VITE_VITEST_DIR = "node_modules/.vite/vitest";

const DB_FILENAME = "data.db";

export const resolveCacheDir: Effect.Effect<string, DataStoreError, FileSystem.FileSystem> = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;

	// Check well-known static paths first
	for (const dir of DEFAULT_LOCATIONS) {
		const manifestPath = `${dir}/manifest.json`;
		const exists = yield* fs.exists(manifestPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
		if (exists) return dir;
	}

	// Vite stores cache under a hash-based subdirectory:
	// node_modules/.vite/vitest/<hash>/vitest-agent-reporter/
	// Scan for our cache inside any hash directory.
	const vitestDirExists = yield* fs.exists(VITE_VITEST_DIR).pipe(Effect.catchAll(() => Effect.succeed(false)));
	if (vitestDirExists) {
		const entries = yield* fs
			.readDirectory(VITE_VITEST_DIR)
			.pipe(Effect.catchAll(() => Effect.succeed([] as string[])));
		for (const entry of entries) {
			const candidate = `${VITE_VITEST_DIR}/${entry}/vitest-agent-reporter`;
			const manifestPath = `${candidate}/manifest.json`;
			const exists = yield* fs.exists(manifestPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
			if (exists) return candidate;
		}
	}

	return yield* Effect.fail(
		new DataStoreError({
			operation: "read",
			table: "cache",
			reason: "No cache directory found. Run tests first or specify --cache-dir.",
		}),
	);
});

/**
 * Resolves the path to the SQLite database file.
 *
 * Search order:
 * 1. `data.db` in well-known static cache locations
 * 2. `data.db` inside Vite's hash-based vitest subdirectories
 */
export const resolveDbPath: Effect.Effect<string, DataStoreError, FileSystem.FileSystem> = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;

	// Check well-known static paths for data.db
	for (const loc of DEFAULT_LOCATIONS) {
		const dbPath = `${loc}/${DB_FILENAME}`;
		const exists = yield* fs.exists(dbPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
		if (exists) return dbPath;
	}

	// Scan Vite's hash-based vitest subdirectories
	const vitestDirExists = yield* fs.exists(VITE_VITEST_DIR).pipe(Effect.catchAll(() => Effect.succeed(false)));
	if (vitestDirExists) {
		const entries = yield* fs
			.readDirectory(VITE_VITEST_DIR)
			.pipe(Effect.catchAll(() => Effect.succeed([] as string[])));
		for (const entry of entries) {
			const dbPath = `${VITE_VITEST_DIR}/${entry}/vitest-agent-reporter/${DB_FILENAME}`;
			const exists = yield* fs.exists(dbPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
			if (exists) return dbPath;
		}
	}

	return yield* Effect.fail(
		new DataStoreError({
			operation: "read",
			table: "database",
			reason: "No database found. Run tests first.",
		}),
	);
});
