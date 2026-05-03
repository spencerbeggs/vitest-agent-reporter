import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	SESSION_POINTER_FILENAME,
	clearSessionPointer,
	getSessionPointerPath,
	readSessionPointer,
	writeSessionPointer,
} from "./session-pointer.js";

describe("getSessionPointerPath", () => {
	it("appends the pointer filename to a directory path", () => {
		expect(getSessionPointerPath("/tmp/data")).toBe(`/tmp/data/${SESSION_POINTER_FILENAME}`);
	});

	it("collapses a data.db path to its containing directory before appending", () => {
		// resolveDataPath returns `<dir>/data.db`; callers should be able to
		// pass that directly without first computing dirname themselves.
		expect(getSessionPointerPath("/tmp/data/data.db")).toBe(`/tmp/data/${SESSION_POINTER_FILENAME}`);
	});
});

describe("session pointer read/write/clear", () => {
	let dir: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "vitest-agent-reporter-pointer-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns null when the pointer does not exist", () => {
		expect(readSessionPointer(dir)).toBeNull();
	});

	it("round-trips a session id through write then read", () => {
		writeSessionPointer(dir, "cc-session-abc");
		expect(readSessionPointer(dir)).toBe("cc-session-abc");
	});

	it("trims trailing whitespace and newlines on read", () => {
		// Hook scripts often write via `echo`, which appends a newline.
		writeFileSync(join(dir, SESSION_POINTER_FILENAME), "  cc-session-xyz \n", "utf8");
		expect(readSessionPointer(dir)).toBe("cc-session-xyz");
	});

	it("returns null when the pointer is whitespace-only", () => {
		writeFileSync(join(dir, SESSION_POINTER_FILENAME), "   \n", "utf8");
		expect(readSessionPointer(dir)).toBeNull();
	});

	it("overwrites a prior pointer value", () => {
		writeSessionPointer(dir, "first");
		writeSessionPointer(dir, "second");
		expect(readSessionPointer(dir)).toBe("second");
	});

	it("removes the pointer file on clear", () => {
		writeSessionPointer(dir, "cc-session-zzz");
		expect(existsSync(join(dir, SESSION_POINTER_FILENAME))).toBe(true);
		clearSessionPointer(dir);
		expect(existsSync(join(dir, SESSION_POINTER_FILENAME))).toBe(false);
		expect(readSessionPointer(dir)).toBeNull();
	});

	it("clear is idempotent when the pointer is already absent", () => {
		expect(() => clearSessionPointer(dir)).not.toThrow();
	});

	it("accepts a data.db file path interchangeably with a directory path", () => {
		// resolveDataPath returns the .db path; verify pointer ops work directly.
		const dbPath = join(dir, "data.db");
		mkdirSync(dir, { recursive: true });
		writeSessionPointer(dbPath, "cc-session-via-dbpath");
		expect(readSessionPointer(dbPath)).toBe("cc-session-via-dbpath");
		clearSessionPointer(dbPath);
		expect(readSessionPointer(dbPath)).toBeNull();
	});
});
