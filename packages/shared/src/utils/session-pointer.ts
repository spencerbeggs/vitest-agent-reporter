import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Filename of the per-workspace session pointer.
 *
 * The pointer holds the active Claude Code `cc_session_id` so CLI subcommands
 * invoked by the agent (rather than by a hook with the envelope in hand) can
 * resolve "the current session" without the caller having to discover it.
 *
 * SessionStart writes the pointer; SessionEnd clears it. The file lives
 * alongside `data.db` under the XDG-resolved data directory.
 *
 * Multi-window concurrent sessions against the same workspace will overwrite
 * each other's pointer — Claude Code does not surface a per-window identifier
 * we could disambiguate on, so the pointer is best-effort for the
 * single-window case. Hooks always pass `--cc-session-id` explicitly and are
 * unaffected.
 */
export const SESSION_POINTER_FILENAME = "current-session-id";

/**
 * Compute the absolute path to the session pointer given a workspace's data
 * path. Accepts either the directory itself or the `data.db` file path
 * (`resolveDataPath` returns the latter); both forms collapse to the same
 * pointer location.
 */
export const getSessionPointerPath = (dataPathOrDir: string): string => {
	const dir = dataPathOrDir.endsWith(".db") ? dirname(dataPathOrDir) : dataPathOrDir;
	return join(dir, SESSION_POINTER_FILENAME);
};

/**
 * Read the active session id from the pointer. Returns `null` when the file
 * does not exist or is empty/whitespace. Trims surrounding whitespace and
 * newlines that hook scripts often introduce via `echo`.
 */
export const readSessionPointer = (dataPathOrDir: string): string | null => {
	const path = getSessionPointerPath(dataPathOrDir);
	if (!existsSync(path)) return null;
	const raw = readFileSync(path, "utf8").trim();
	return raw.length > 0 ? raw : null;
};

/**
 * Write the active session id to the pointer. Overwrites any prior value.
 * Caller is responsible for ensuring the parent directory exists; in normal
 * operation the data directory has already been created by
 * `AppDirs.ensureData` during `resolveDataPath`.
 */
export const writeSessionPointer = (dataPathOrDir: string, ccSessionId: string): void => {
	const path = getSessionPointerPath(dataPathOrDir);
	writeFileSync(path, `${ccSessionId}\n`, "utf8");
};

/**
 * Remove the session pointer. Idempotent — does nothing when the file is
 * already absent. Called from the SessionEnd hook so a fresh window is not
 * tricked into reading the previous session's id.
 */
export const clearSessionPointer = (dataPathOrDir: string): void => {
	const path = getSessionPointerPath(dataPathOrDir);
	rmSync(path, { force: true });
};
