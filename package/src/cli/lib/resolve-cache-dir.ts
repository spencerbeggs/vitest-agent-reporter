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

import { join } from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { DataStoreError } from "../../errors/DataStoreError.js";

const DEFAULT_LOCATIONS = [".vitest-agent-reporter", "node_modules/.vite/vitest-agent-reporter"];

const VITE_VITEST_DIR = "node_modules/.vite/vitest";

const DB_FILENAME = "data.db";

/**
 * Resolves the path to the SQLite database file.
 *
 * Search order:
 * 1. `data.db` in well-known static cache locations
 * 2. `data.db` inside Vite's hash-based vitest subdirectories
 *
 * @param projectDir - Project root to anchor lookups at. Defaults to `""`,
 *   which produces paths relative to the current working directory. Pass
 *   an absolute path when the caller cannot rely on `process.cwd()` being
 *   the user's project (e.g. plugin-spawned MCP server processes).
 */
export const resolveDbPath = (projectDir = ""): Effect.Effect<string, DataStoreError, FileSystem.FileSystem> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;

		// Check well-known static paths for data.db
		for (const loc of DEFAULT_LOCATIONS) {
			const dbPath = join(projectDir, loc, DB_FILENAME);
			const exists = yield* fs.exists(dbPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
			if (exists) return dbPath;
		}

		// Scan Vite's hash-based vitest subdirectories
		const viteVitestDir = join(projectDir, VITE_VITEST_DIR);
		const vitestDirExists = yield* fs.exists(viteVitestDir).pipe(Effect.catchAll(() => Effect.succeed(false)));
		if (vitestDirExists) {
			const entries = yield* fs
				.readDirectory(viteVitestDir)
				.pipe(Effect.catchAll(() => Effect.succeed([] as string[])));
			for (const entry of entries) {
				const dbPath = join(viteVitestDir, entry, "vitest-agent-reporter", DB_FILENAME);
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
