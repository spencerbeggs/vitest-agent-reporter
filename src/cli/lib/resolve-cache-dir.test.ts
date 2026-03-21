import { FileSystem } from "@effect/platform";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { resolveCacheDir } from "./resolve-cache-dir.js";

/**
 * Creates a mock FileSystem layer where `exists` returns true
 * for the given set of paths and false for everything else.
 */
function mockFileSystemLayer(existingPaths: ReadonlyArray<string>): Layer.Layer<FileSystem.FileSystem> {
	return Layer.succeed(FileSystem.FileSystem, {
		exists: (path: string) => Effect.succeed(existingPaths.includes(path)),
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

	it("fails with CacheError when no cache directory found", async () => {
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

		expect(result._tag).toBe("CacheError");
		expect(result.operation).toBe("read");
		expect(result.reason).toContain("No cache directory found");
	});
});
