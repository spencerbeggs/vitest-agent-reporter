/**
 * Auto-discovers the vitest-agent-reporter cache directory.
 *
 * @packageDocumentation
 */

import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { CacheError } from "../../errors/CacheError.js";

const DEFAULT_LOCATIONS = [".vitest-agent-reporter", "node_modules/.vite/vitest-agent-reporter"];

const VITE_VITEST_DIR = "node_modules/.vite/vitest";

export const resolveCacheDir: Effect.Effect<string, CacheError, FileSystem.FileSystem> = Effect.gen(function* () {
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
		new CacheError({
			operation: "read",
			path: ".",
			reason: "No cache directory found. Run tests first or specify --cache-dir.",
		}),
	);
});
