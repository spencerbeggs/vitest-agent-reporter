import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { _resetMigrationCacheForTesting, ensureMigrated } from "./ensure-migrated.js";

const newDbPath = (): string => {
	const dir = mkdtempSync(join(tmpdir(), "ensure-migrated-test-"));
	return join(dir, "data.db");
};

describe("ensureMigrated", () => {
	afterEach(() => {
		_resetMigrationCacheForTesting();
	});

	it("creates and migrates a fresh database", async () => {
		const dbPath = newDbPath();
		await expect(ensureMigrated(dbPath)).resolves.toBeUndefined();
	});

	it("returns the same promise for concurrent calls with the same dbPath", () => {
		const dbPath = newDbPath();
		const a = ensureMigrated(dbPath);
		const b = ensureMigrated(dbPath);
		expect(a).toBe(b);
	});

	it("returns independent promises for different dbPaths", () => {
		const a = ensureMigrated(newDbPath());
		const b = ensureMigrated(newDbPath());
		expect(a).not.toBe(b);
	});

	it("serializes migration so concurrent callers do not race on a fresh database", async () => {
		const dbPath = newDbPath();
		const promises = [ensureMigrated(dbPath), ensureMigrated(dbPath), ensureMigrated(dbPath)];
		// All resolve without "database is locked".
		await expect(Promise.all(promises)).resolves.toBeDefined();
	});
});
