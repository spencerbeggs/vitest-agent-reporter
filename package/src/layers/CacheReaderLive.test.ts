import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect, it, vi } from "vitest";
import { CacheError } from "../errors/CacheError.js";
import type { HistoryRecord } from "../schemas/History.js";
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

	it("readHistory reads and decodes a valid history file", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-history-"));
		const historyDir = path.join(tmpDir, "history");
		fs.mkdirSync(historyDir, { recursive: true });
		const sampleHistory: HistoryRecord = {
			project: "core",
			updatedAt: "2026-03-20T00:00:00.000Z",
			tests: [
				{
					fullName: "my test",
					runs: [{ timestamp: "2026-03-20T00:00:00.000Z", state: "passed" }],
				},
			],
		};
		fs.writeFileSync(path.join(historyDir, "core.history.json"), JSON.stringify(sampleHistory));

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readHistory(tmpDir, "core")),
				layer,
			),
		);

		expect(result.project).toBe("core");
		expect(result.tests).toHaveLength(1);
		expect(result.tests[0].fullName).toBe("my test");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("readHistory returns empty HistoryRecord when file does not exist", async () => {
		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readHistory("/tmp/non-existent-cache-dir-xyz", "core")),
				layer,
			),
		);

		expect(result.project).toBe("core");
		expect(result.updatedAt).toBe("");
		expect(result.tests).toEqual([]);
	});

	it("readHistory returns empty HistoryRecord for corrupt JSON and logs warning", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-history-corrupt-"));
		const historyDir = path.join(tmpDir, "history");
		fs.mkdirSync(historyDir, { recursive: true });
		fs.writeFileSync(path.join(historyDir, "core.history.json"), "not valid json {{{");

		const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readHistory(tmpDir, "core")),
				layer,
			),
		);

		expect(result.project).toBe("core");
		expect(result.updatedAt).toBe("");
		expect(result.tests).toEqual([]);
		expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("corrupt history file"));

		stderrSpy.mockRestore();
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

	it("readBaselines returns baselines when file exists and is valid", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-baselines-"));
		const sampleBaselines = {
			updatedAt: "2026-03-20T00:00:00.000Z",
			global: { statements: 80, branches: 70, functions: 75, lines: 80 },
			patterns: [],
		};
		fs.writeFileSync(path.join(tmpDir, "baselines.json"), JSON.stringify(sampleBaselines));

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readBaselines(tmpDir)),
				layer,
			),
		);

		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.global.statements).toBe(80);
			expect(result.value.updatedAt).toBe("2026-03-20T00:00:00.000Z");
		}

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("readBaselines returns None when file is missing", async () => {
		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readBaselines("/tmp/non-existent-cache-dir-xyz")),
				layer,
			),
		);

		expect(Option.isNone(result)).toBe(true);
	});

	it("readTrends returns trends when file exists", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-trends-"));
		const trendsDir = path.join(tmpDir, "trends");
		fs.mkdirSync(trendsDir, { recursive: true });
		const sampleTrends = {
			entries: [
				{
					timestamp: "2026-03-20T00:00:00.000Z",
					coverage: { statements: 80, branches: 70, functions: 75, lines: 80 },
					delta: { statements: 0, branches: 0, functions: 0, lines: 0 },
					direction: "stable",
				},
			],
		};
		fs.writeFileSync(path.join(trendsDir, "core.trends.json"), JSON.stringify(sampleTrends));

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readTrends(tmpDir, "core")),
				layer,
			),
		);

		expect(Option.isSome(result)).toBe(true);
		if (Option.isSome(result)) {
			expect(result.value.entries).toHaveLength(1);
			expect(result.value.entries[0].direction).toBe("stable");
		}

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("readTrends returns None for missing file", async () => {
		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readTrends("/tmp/non-existent-cache-dir-xyz", "core")),
				layer,
			),
		);

		expect(Option.isNone(result)).toBe(true);
	});

	it("readBaselines returns CacheError when file is corrupt", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-baselines-corrupt-"));
		fs.writeFileSync(path.join(tmpDir, "baselines.json"), "not valid json {{{");

		const layer = CacheReaderLive.pipe(Layer.provide(NodeFileSystem.layer));

		const exit = await Effect.runPromiseExit(
			Effect.provide(
				Effect.flatMap(CacheReader, (r) => r.readBaselines(tmpDir)),
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
});
