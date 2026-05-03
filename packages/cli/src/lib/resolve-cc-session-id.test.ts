import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_POINTER_FILENAME, writeSessionPointer } from "vitest-agent-reporter-shared";
import { resolveCcSessionId } from "./resolve-cc-session-id.js";

// The resolver depends on resolveDataPath, which needs a workspace marker
// (package.json + pnpm-workspace.yaml) on the search path. We construct a
// minimal workspace inside a tmpdir for each test so the resolution lands on
// our controlled directory rather than walking up to a real workspace.
const setupWorkspace = (): { workspaceDir: string; xdgDataHome: string; dataDir: string; cleanup: () => void } => {
	const root = mkdtempSync(join(tmpdir(), "vitest-pointer-resolve-"));
	const workspaceDir = join(root, "ws");
	const xdgDataHome = join(root, "xdg");
	const dataDir = join(xdgDataHome, "vitest-agent-reporter", "ws");
	mkdirSync(workspaceDir, { recursive: true });
	mkdirSync(dataDir, { recursive: true });
	// workspaces-effect requires `name` AND `version` on the root package.json.
	writeFileSync(join(workspaceDir, "package.json"), JSON.stringify({ name: "ws", version: "0.0.0", private: true }));
	writeFileSync(join(workspaceDir, "pnpm-workspace.yaml"), 'packages:\n  - "."\n');
	return {
		workspaceDir,
		xdgDataHome,
		dataDir,
		cleanup: () => rmSync(root, { recursive: true, force: true }),
	};
};

describe("resolveCcSessionId", () => {
	let env: ReturnType<typeof setupWorkspace>;
	let prevXdg: string | undefined;

	beforeEach(() => {
		env = setupWorkspace();
		prevXdg = process.env.XDG_DATA_HOME;
		process.env.XDG_DATA_HOME = env.xdgDataHome;
	});

	afterEach(() => {
		if (prevXdg === undefined) delete process.env.XDG_DATA_HOME;
		else process.env.XDG_DATA_HOME = prevXdg;
		env.cleanup();
	});

	it("returns the explicit value verbatim when provided", async () => {
		// Pointer is also set; explicit must still win to keep hooks
		// authoritative when they have the envelope id in hand.
		writeSessionPointer(env.dataDir, "from-pointer");
		const result = await Effect.runPromise(resolveCcSessionId({ explicit: "from-flag", projectDir: env.workspaceDir }));
		expect(result).toBe("from-flag");
	});

	it("falls back to the pointer when no explicit value is given", async () => {
		writeSessionPointer(env.dataDir, "from-pointer");
		const result = await Effect.runPromise(resolveCcSessionId({ projectDir: env.workspaceDir }));
		expect(result).toBe("from-pointer");
	});

	it("returns null when neither explicit nor pointer is present", async () => {
		const result = await Effect.runPromise(resolveCcSessionId({ projectDir: env.workspaceDir }));
		expect(result).toBeNull();
	});

	it("treats an empty-string explicit value as absent (falls through to pointer)", async () => {
		writeSessionPointer(env.dataDir, "from-pointer");
		const result = await Effect.runPromise(resolveCcSessionId({ explicit: "", projectDir: env.workspaceDir }));
		expect(result).toBe("from-pointer");
	});

	it("returns null when the pointer file holds whitespace only", async () => {
		writeFileSync(join(env.dataDir, SESSION_POINTER_FILENAME), "   \n", "utf8");
		const result = await Effect.runPromise(resolveCcSessionId({ projectDir: env.workspaceDir }));
		expect(result).toBeNull();
	});
});
