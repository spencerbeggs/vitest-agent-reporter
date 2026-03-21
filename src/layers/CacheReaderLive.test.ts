import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";
import { CacheError } from "../errors/CacheError.js";
import { CacheReader } from "../services/CacheReader.js";
import { CacheReaderLive } from "./CacheReaderLive.js";
import { CacheReaderTest } from "./CacheReaderTest.js";

const sampleReport = {
	timestamp: "2026-03-20T00:00:00.000Z",
	reason: "passed" as const,
	summary: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 100 },
	failed: [],
	unhandledErrors: [],
	failedFiles: [],
};

const sampleManifest = {
	updatedAt: "2026-03-20T00:00:00.000Z",
	cacheDir: "/tmp/cache",
	projects: [
		{
			project: "core",
			reportFile: "reports/core.json",
			lastRun: "2026-03-20T00:00:00.000Z",
			lastResult: "passed" as const,
		},
	],
};

describe("CacheReaderTest", () => {
	it("readManifest returns Option.some when manifest data is seeded", async () => {
		const data = new Map<string, string>();
		data.set("/tmp/cache/manifest.json", JSON.stringify(sampleManifest));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readManifest("/tmp/cache")),
				CacheReaderTest.layer(data),
			),
		);

		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.cacheDir).toBe("/tmp/cache");
			expect(result.value.projects).toHaveLength(1);
		}
	});

	it("readManifest returns Option.none when no data seeded", async () => {
		const data = new Map<string, string>();

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readManifest("/tmp/cache")),
				CacheReaderTest.layer(data),
			),
		);

		expect(Option.isNone(result)).toBe(true);
	});

	it("readReport returns Option.some when report data is seeded", async () => {
		const data = new Map<string, string>();
		data.set("/tmp/cache/reports/core.json", JSON.stringify(sampleReport));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readReport("/tmp/cache", "core")),
				CacheReaderTest.layer(data),
			),
		);

		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.reason).toBe("passed");
			expect(result.value.summary.total).toBe(1);
		}
	});

	it("readReport returns Option.none when not seeded", async () => {
		const data = new Map<string, string>();

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readReport("/tmp/cache", "core")),
				CacheReaderTest.layer(data),
			),
		);

		expect(Option.isNone(result)).toBe(true);
	});

	it("listReports returns file names from seeded data", async () => {
		const data = new Map<string, string>();
		data.set("/tmp/cache/reports/core.json", JSON.stringify(sampleReport));
		data.set("/tmp/cache/reports/utils.json", JSON.stringify(sampleReport));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.listReports("/tmp/cache")),
				CacheReaderTest.layer(data),
			),
		);

		expect(result).toHaveLength(2);
		expect(result).toContain("core.json");
		expect(result).toContain("utils.json");
	});
});

describe("CacheReaderLive", () => {
	it("reads a manifest from disk", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-test-"));
		fs.writeFileSync(path.join(tmpDir, "manifest.json"), JSON.stringify(sampleManifest));

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readManifest(tmpDir)),
				layer,
			),
		);

		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.cacheDir).toBe("/tmp/cache");
			expect(result.value.projects).toHaveLength(1);
		}

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("readManifest returns Option.none for non-existent dir", async () => {
		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readManifest("/tmp/non-existent-cache-dir-xyz")),
				layer,
			),
		);

		expect(Option.isNone(result)).toBe(true);
	});

	it("reads a report from disk", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-test-"));
		const reportsDir = path.join(tmpDir, "reports");
		fs.mkdirSync(reportsDir, { recursive: true });
		fs.writeFileSync(path.join(reportsDir, "core.json"), JSON.stringify(sampleReport));

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readReport(tmpDir, "core")),
				layer,
			),
		);

		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.reason).toBe("passed");
		}

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("readReport returns Option.none for non-existent file", async () => {
		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readReport("/tmp/non-existent-cache-dir-xyz", "core")),
				layer,
			),
		);

		expect(Option.isNone(result)).toBe(true);
	});

	it("listReports returns json files from disk", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-test-"));
		const reportsDir = path.join(tmpDir, "reports");
		fs.mkdirSync(reportsDir, { recursive: true });
		fs.writeFileSync(path.join(reportsDir, "core.json"), JSON.stringify(sampleReport));
		fs.writeFileSync(path.join(reportsDir, "utils.json"), JSON.stringify(sampleReport));

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.listReports(tmpDir)),
				layer,
			),
		);

		expect(result).toHaveLength(2);
		expect(result).toContain("core.json");
		expect(result).toContain("utils.json");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("listReports returns empty array for non-existent dir", async () => {
		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.listReports("/tmp/non-existent-cache-dir-xyz")),
				layer,
			),
		);

		expect(result).toEqual([]);
	});

	it("readManifest fails with CacheError for corrupt JSON", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-corrupt-"));
		fs.writeFileSync(path.join(tmpDir, "manifest.json"), "not valid json {{{");

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const exit = await Effect.runPromiseExit(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readManifest(tmpDir)),
				layer,
			),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const error = Cause.failureOption(exit.cause);
			expect(Option.isSome(error)).toBe(true);
			if (Option.isSome(error)) {
				expect(error.value).toBeInstanceOf(CacheError);
				expect(error.value.operation).toBe("read");
			}
		}

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("readReport fails with CacheError for corrupt JSON", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-corrupt-"));
		const reportsDir = path.join(tmpDir, "reports");
		fs.mkdirSync(reportsDir, { recursive: true });
		fs.writeFileSync(path.join(reportsDir, "default.json"), "not valid json");

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const exit = await Effect.runPromiseExit(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readReport(tmpDir, "")),
				layer,
			),
		);

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const error = Cause.failureOption(exit.cause);
			expect(Option.isSome(error)).toBe(true);
			if (Option.isSome(error)) {
				expect(error.value).toBeInstanceOf(CacheError);
				expect(error.value.operation).toBe("read");
			}
		}

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("readManifest fails with CacheError for permission denied (non-NotFound SystemError)", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-perm-"));
		const manifestPath = path.join(tmpDir, "manifest.json");
		fs.writeFileSync(manifestPath, JSON.stringify(sampleManifest));
		fs.chmodSync(manifestPath, 0o000);

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const exit = await Effect.runPromiseExit(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readManifest(tmpDir)),
				layer,
			),
		);

		// Restore permissions before cleanup
		fs.chmodSync(manifestPath, 0o644);
		fs.rmSync(tmpDir, { recursive: true });

		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const error = Cause.failureOption(exit.cause);
			expect(Option.isSome(error)).toBe(true);
			if (Option.isSome(error)) {
				expect(error.value).toBeInstanceOf(CacheError);
				expect(error.value.operation).toBe("read");
			}
		}
	});
});
