import { FileSystem } from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { resolveCacheDir, resolveDbPath } from "./resolve-cache-dir.js";

/**
 * Creates a mock FileSystem layer where `exists` returns true
 * for the given set of paths and false for everything else.
 * Optionally supports `readDirectory` for directory listing
 * and `readFileString` for file content.
 */
function mockFileSystemLayer(
	existingPaths: ReadonlyArray<string>,
	directories?: Record<string, string[]>,
	fileContents?: Record<string, string>,
): Layer.Layer<FileSystem.FileSystem> {
	return Layer.succeed(FileSystem.FileSystem, {
		exists: (path: string) => Effect.succeed(existingPaths.includes(path)),
		readDirectory: (path: string) => {
			const entries = directories?.[path];
			if (entries) return Effect.succeed(entries);
			return Effect.fail(new Error(`ENOENT: ${path}`));
		},
		readFileString: (path: string) => {
			const content = fileContents?.[path];
			if (content !== undefined) return Effect.succeed(content);
			return Effect.fail(new Error(`ENOENT: ${path}`));
		},
	} as unknown as FileSystem.FileSystem);
}

describe("resolveCacheDir", () => {
	it("finds .vitest-agent-reporter when manifest exists", async () => {
		const layer = mockFileSystemLayer([".vitest-agent-reporter/manifest.json"]);

		const result = await Effect.runPromise(resolveCacheDir.pipe(Effect.provide(layer)));
		expect(result).toBe(".vitest-agent-reporter");
	});

	it("finds node_modules/.vite/vitest-agent-reporter when manifest exists", async () => {
		const layer = mockFileSystemLayer(["node_modules/.vite/vitest-agent-reporter/manifest.json"]);

		const result = await Effect.runPromise(resolveCacheDir.pipe(Effect.provide(layer)));
		expect(result).toBe("node_modules/.vite/vitest-agent-reporter");
	});

	it("prefers .vitest-agent-reporter over node_modules location", async () => {
		const layer = mockFileSystemLayer([
			".vitest-agent-reporter/manifest.json",
			"node_modules/.vite/vitest-agent-reporter/manifest.json",
		]);

		const result = await Effect.runPromise(resolveCacheDir.pipe(Effect.provide(layer)));
		expect(result).toBe(".vitest-agent-reporter");
	});

	it("finds cache in Vite's hash-based vitest subdirectory", async () => {
		const layer = mockFileSystemLayer(
			["node_modules/.vite/vitest", "node_modules/.vite/vitest/abc123/vitest-agent-reporter/manifest.json"],
			{ "node_modules/.vite/vitest": ["abc123"] },
		);

		const result = await Effect.runPromise(resolveCacheDir.pipe(Effect.provide(layer)));
		expect(result).toBe("node_modules/.vite/vitest/abc123/vitest-agent-reporter");
	});

	it("prefers static paths over hash-based vitest subdirectory", async () => {
		const layer = mockFileSystemLayer(
			[
				".vitest-agent-reporter/manifest.json",
				"node_modules/.vite/vitest",
				"node_modules/.vite/vitest/abc123/vitest-agent-reporter/manifest.json",
			],
			{ "node_modules/.vite/vitest": ["abc123"] },
		);

		const result = await Effect.runPromise(resolveCacheDir.pipe(Effect.provide(layer)));
		expect(result).toBe(".vitest-agent-reporter");
	});

	it("fails with DataStoreError when no cache directory found", async () => {
		const layer = mockFileSystemLayer([]);

		const result = await Effect.runPromise(
			resolveCacheDir.pipe(
				Effect.matchEffect({
					onFailure: (e) => Effect.succeed(e),
					onSuccess: () => Effect.fail(new Error("Expected failure")),
				}),
				Effect.provide(layer),
			),
		);

		expect(result._tag).toBe("DataStoreError");
		expect(result.operation).toBe("read");
		expect(result.reason).toContain("No cache directory found");
	});
});

describe("resolveDbPath", () => {
	it("finds data.db in .vitest-agent-reporter", async () => {
		const layer = mockFileSystemLayer([".vitest-agent-reporter/data.db"]);

		const result = await Effect.runPromise(resolveDbPath.pipe(Effect.provide(layer)));
		expect(result).toBe(".vitest-agent-reporter/data.db");
	});

	it("finds data.db in node_modules/.vite/vitest-agent-reporter", async () => {
		const layer = mockFileSystemLayer(["node_modules/.vite/vitest-agent-reporter/data.db"]);

		const result = await Effect.runPromise(resolveDbPath.pipe(Effect.provide(layer)));
		expect(result).toBe("node_modules/.vite/vitest-agent-reporter/data.db");
	});

	it("finds data.db in Vite's hash-based vitest subdirectory", async () => {
		const layer = mockFileSystemLayer(
			["node_modules/.vite/vitest", "node_modules/.vite/vitest/abc123/vitest-agent-reporter/data.db"],
			{ "node_modules/.vite/vitest": ["abc123"] },
		);

		const result = await Effect.runPromise(resolveDbPath.pipe(Effect.provide(layer)));
		expect(result).toBe("node_modules/.vite/vitest/abc123/vitest-agent-reporter/data.db");
	});

	it("fails with DataStoreError when no database found", async () => {
		const layer = mockFileSystemLayer([]);

		const result = await Effect.runPromise(
			resolveDbPath.pipe(
				Effect.matchEffect({
					onFailure: (e) => Effect.succeed(e),
					onSuccess: () => Effect.fail(new Error("Expected failure")),
				}),
				Effect.provide(layer),
			),
		);

		expect(result._tag).toBe("DataStoreError");
		expect(result.operation).toBe("read");
		expect(result.reason).toContain("No database found");
	});
});
