import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { CacheWriter } from "../services/CacheWriter.js";
import { CacheWriterLive } from "./CacheWriterLive.js";
import { CacheWriterTest } from "./CacheWriterTest.js";

describe("CacheWriter", () => {
	it("ensureDir records directory creation", async () => {
		const state = CacheWriterTest.empty();
		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.ensureDir("/tmp/cache")),
				CacheWriterTest.layer(state),
			),
		);
		expect(state.dirs).toContain("/tmp/cache");
	});

	it("writeHistory stores history JSON in state", async () => {
		const state = CacheWriterTest.empty();
		const history = {
			project: "core",
			updatedAt: "2026-03-21T00:00:00.000Z",
			tests: [
				{
					fullName: "Suite > my test",
					runs: [{ timestamp: "2026-03-21T00:00:00.000Z", state: "failed" as const }],
				},
			],
		};
		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.writeHistory("/tmp/cache", "core", history)),
				CacheWriterTest.layer(state),
			),
		);
		expect(state.histories.has("/tmp/cache/history/core.history.json")).toBe(true);
		const raw = state.histories.get("/tmp/cache/history/core.history.json");
		expect(raw).toBeDefined();
		const stored = JSON.parse(raw as string);
		expect(stored.project).toBe("core");
		expect(stored.tests).toHaveLength(1);
	});

	it("writeReport stores JSON in state", async () => {
		const state = CacheWriterTest.empty();
		const report = {
			timestamp: "2026-03-20T00:00:00.000Z",
			reason: "passed" as const,
			summary: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 100 },
			failed: [],
			unhandledErrors: [],
			failedFiles: [],
		};
		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.writeReport("/tmp/cache", "core", report)),
				CacheWriterTest.layer(state),
			),
		);
		expect(state.files.has("/tmp/cache/reports/core.json")).toBe(true);
		const raw = state.files.get("/tmp/cache/reports/core.json");
		expect(raw).toBeDefined();
		const stored = JSON.parse(raw as string);
		expect(stored.reason).toBe("passed");
	});

	it("writeManifest stores manifest JSON in state", async () => {
		const state = CacheWriterTest.empty();
		const manifest = {
			updatedAt: "2026-03-20T00:00:00.000Z",
			cacheDir: "/tmp/cache",
			projects: [],
		};
		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.writeManifest("/tmp/cache", manifest)),
				CacheWriterTest.layer(state),
			),
		);
		expect(state.files.has("/tmp/cache/manifest.json")).toBe(true);
	});

	it("writeBaselines stores baselines JSON in state", async () => {
		const state = CacheWriterTest.empty();
		const baselines = {
			updatedAt: "2026-03-21T00:00:00.000Z",
			global: { statements: 80, branches: 70, functions: 75, lines: 80 },
			patterns: [],
		};
		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.writeBaselines("/tmp/cache", baselines)),
				CacheWriterTest.layer(state),
			),
		);
		expect(state.baselines.has("/tmp/cache/baselines.json")).toBe(true);
		const raw = state.baselines.get("/tmp/cache/baselines.json");
		expect(raw).toBeDefined();
		const stored = JSON.parse(raw as string);
		expect(stored.global.statements).toBe(80);
	});
});

describe("CacheWriterLive", () => {
	it("writes report to disk", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-test-"));
		const reportsDir = path.join(tmpDir, "reports");
		fs.mkdirSync(reportsDir, { recursive: true });

		const layer = CacheWriterLive.pipe(Layer.provide(NodeFileSystem.layer));
		const report = {
			timestamp: "2026-03-20T00:00:00.000Z",
			reason: "passed" as const,
			summary: { total: 1, passed: 1, failed: 0, skipped: 0, duration: 100 },
			failed: [],
			unhandledErrors: [],
			failedFiles: [],
		};

		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.writeReport(tmpDir, "test-project", report)),
				layer,
			),
		);

		const filePath = path.join(tmpDir, "reports", "test-project.json");
		expect(fs.existsSync(filePath)).toBe(true);
		const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		expect(content.reason).toBe("passed");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("writes manifest to disk", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-test-"));

		const layer = CacheWriterLive.pipe(Layer.provide(NodeFileSystem.layer));
		const manifest = {
			updatedAt: "2026-03-20T00:00:00.000Z",
			cacheDir: tmpDir,
			projects: [],
		};

		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.writeManifest(tmpDir, manifest)),
				layer,
			),
		);

		const filePath = path.join(tmpDir, "manifest.json");
		expect(fs.existsSync(filePath)).toBe(true);
		const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		expect(content.cacheDir).toBe(tmpDir);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("ensureDir creates directory on disk", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-test-"));
		const targetDir = path.join(tmpDir, "nested", "cache");

		const layer = CacheWriterLive.pipe(Layer.provide(NodeFileSystem.layer));

		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.ensureDir(targetDir)),
				layer,
			),
		);

		expect(fs.existsSync(targetDir)).toBe(true);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("writes history to disk (directory must exist)", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-test-"));
		fs.mkdirSync(path.join(tmpDir, "history"), { recursive: true });

		const layer = CacheWriterLive.pipe(Layer.provide(NodeFileSystem.layer));
		const history = {
			project: "test-project",
			updatedAt: "2026-03-21T00:00:00.000Z",
			tests: [
				{
					fullName: "Suite > a test",
					runs: [{ timestamp: "2026-03-21T00:00:00.000Z", state: "passed" as const }],
				},
			],
		};

		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.writeHistory(tmpDir, "test-project", history)),
				layer,
			),
		);

		const filePath = path.join(tmpDir, "history", "test-project.history.json");
		expect(fs.existsSync(filePath)).toBe(true);
		const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		expect(content.project).toBe("test-project");
		expect(content.tests).toHaveLength(1);

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("writeTrends writes trends file", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-test-"));
		fs.mkdirSync(path.join(tmpDir, "trends"), { recursive: true });

		const layer = CacheWriterLive.pipe(Layer.provide(NodeFileSystem.layer));
		const trends = {
			entries: [
				{
					timestamp: "2026-03-21T00:00:00.000Z",
					coverage: { statements: 80, branches: 70, functions: 75, lines: 80 },
					delta: { statements: 2, branches: 1, functions: 0, lines: 2 },
					direction: "improving" as const,
				},
			],
		};

		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.writeTrends(tmpDir, "test-project", trends)),
				layer,
			),
		);

		const filePath = path.join(tmpDir, "trends", "test-project.trends.json");
		expect(fs.existsSync(filePath)).toBe(true);
		const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		expect(content.entries).toHaveLength(1);
		expect(content.entries[0].direction).toBe("improving");

		fs.rmSync(tmpDir, { recursive: true });
	});

	it("writes baselines to disk", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cw-test-"));

		const layer = CacheWriterLive.pipe(Layer.provide(NodeFileSystem.layer));
		const baselines = {
			updatedAt: "2026-03-21T00:00:00.000Z",
			global: { statements: 80, branches: 70, functions: 75, lines: 80 },
			patterns: [],
		};

		await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, (w) => w.writeBaselines(tmpDir, baselines)),
				layer,
			),
		);

		const filePath = path.join(tmpDir, "baselines.json");
		expect(fs.existsSync(filePath)).toBe(true);
		const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
		expect(content.global.statements).toBe(80);
		expect(content.updatedAt).toBe("2026-03-21T00:00:00.000Z");

		fs.rmSync(tmpDir, { recursive: true });
	});
});
