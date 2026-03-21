/**
 * Auto-discovers the vitest-agent-reporter cache directory.
 *
 * @packageDocumentation
 */

import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { CacheError } from "../../errors/CacheError.js";

const DEFAULT_LOCATIONS = [".vitest-agent-reporter", "node_modules/.vite/vitest-agent-reporter"];

export const resolveCacheDir: Effect.Effect<string, CacheError, FileSystem.FileSystem> = Effect.gen(function* () {
	const fs = yield* FileSystem.FileSystem;
	for (const dir of DEFAULT_LOCATIONS) {
		const manifestPath = `${dir}/manifest.json`;
		const exists = yield* fs.exists(manifestPath).pipe(Effect.catchAll(() => Effect.succeed(false)));
		if (exists) return dir;
	}
	return yield* Effect.fail(
		new CacheError({
			operation: "read",
			path: ".",
			reason: "No cache directory found. Run tests first or specify --cache-dir.",
		}),
	);
});
