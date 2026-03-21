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
});
