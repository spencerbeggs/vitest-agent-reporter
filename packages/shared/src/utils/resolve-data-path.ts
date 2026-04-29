import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Effect } from "effect";
import { AppDirs } from "xdg-effect";
import { VitestAgentReporterConfig } from "../schemas/Config.js";
import { VitestAgentReporterConfigFile } from "../services/Config.js";
import { normalizeWorkspaceKey } from "./normalize-workspace-key.js";
import { resolveWorkspaceKey } from "./resolve-workspace-key.js";

/**
 * Filename of the SQLite database that stores all reporter data.
 */
export const DATABASE_FILENAME = "data.db";

/**
 * Caller-supplied overrides for `resolveDataPath`.
 */
export interface ResolveDataPathOptions {
	/**
	 * Programmatic override for the entire data directory. Highest precedence.
	 *
	 * Use this when the reporter or plugin user has explicitly set
	 * `reporter.cacheDir`. The returned path is `<cacheDir>/data.db`.
	 */
	readonly cacheDir?: string;
}

/**
 * Resolve the absolute path to the SQLite database for `projectDir`.
 *
 * The directory containing the database is ensured to exist before the
 * function returns, so callers can open the database immediately without
 * needing to create parent directories. better-sqlite3 creates the file but
 * not its parent.
 *
 * Precedence (highest first):
 *
 * 1. `options.cacheDir` — programmatic override.
 * 2. `cacheDir` from `vitest-agent-reporter.config.toml`.
 * 3. `<XDG data>/<normalized projectKey from config>/data.db`.
 * 4. `<XDG data>/<normalized workspace name>/data.db`.
 *
 * The XDG data directory is namespaced via `AppDirs` (typically
 * `$XDG_DATA_HOME/vitest-agent-reporter`, defaulting to
 * `~/.local/share/vitest-agent-reporter`).
 *
 * Fails with `WorkspaceRootNotFoundError` when the workspace cannot be
 * detected and no override is set. The function never silently falls back to
 * a path hash — the path is a function of identity, not filesystem layout.
 *
 * @param projectDir - Absolute path inside the user's workspace.
 * @param options - Optional programmatic overrides.
 */
export const resolveDataPath = (projectDir: string, options: ResolveDataPathOptions = {}) =>
	Effect.gen(function* () {
		// 1. Programmatic override wins.
		if (options.cacheDir) {
			ensureDirSync(options.cacheDir);
			return join(options.cacheDir, DATABASE_FILENAME);
		}

		const config = yield* VitestAgentReporterConfigFile;
		const loaded = yield* config.loadOrDefault(new VitestAgentReporterConfig({}));

		// 2. Config file cacheDir.
		if (loaded.cacheDir) {
			ensureDirSync(loaded.cacheDir);
			return join(loaded.cacheDir, DATABASE_FILENAME);
		}

		const appDirs = yield* AppDirs;
		const dataRoot = yield* appDirs.ensureData;

		// 3. Config file projectKey overrides workspace name.
		const key = loaded.projectKey ? normalizeWorkspaceKey(loaded.projectKey) : yield* resolveWorkspaceKey(projectDir);

		const dir = join(dataRoot, key);
		ensureDirSync(dir);
		return join(dir, DATABASE_FILENAME);
	});

const ensureDirSync = (path: string): void => {
	mkdirSync(path, { recursive: true });
};
