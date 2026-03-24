import { Layer, ManagedRuntime } from "effect";
import { afterAll, describe, expect, it } from "vitest";
import { DataStoreTestLayer } from "../layers/DataStoreTest.js";
import { OutputPipelineLive } from "../layers/OutputPipelineLive.js";
import { ProjectDiscoveryTest } from "../layers/ProjectDiscoveryTest.js";
import type { McpContext } from "./context.js";
import { createCallerFactory } from "./context.js";
import { appRouter } from "./router.js";

const TestLayer = Layer.mergeAll(DataStoreTestLayer, OutputPipelineLive, ProjectDiscoveryTest.layer([]));
const testRuntime = ManagedRuntime.make(TestLayer);

function createTestCaller() {
	const factory = createCallerFactory(appRouter);
	return factory({
		runtime: testRuntime as unknown as McpContext["runtime"],
		cwd: process.cwd(),
	});
}

afterAll(async () => {
	await testRuntime.dispose();
});

describe("MCP Router", () => {
	it("test_status returns no data message on empty DB", async () => {
		const caller = createTestCaller();
		const result = await caller.test_status({});
		expect(result).toContain("No test data");
	});

	it("cache_health returns diagnostic on empty DB", async () => {
		const caller = createTestCaller();
		const result = await caller.cache_health();
		expect(typeof result).toBe("string");
		expect(result).toContain("Cache Health");
	});

	it("test_overview returns no data message on empty DB", async () => {
		const caller = createTestCaller();
		const result = await caller.test_overview({});
		expect(result).toContain("No test data");
	});

	it("configure returns read-only message without settingsHash", async () => {
		const caller = createTestCaller();
		const result = await caller.configure({});
		expect(result).toContain("read-only");
	});

	it("note CRUD lifecycle", async () => {
		const caller = createTestCaller();

		// Create
		const { id } = await caller.note_create({
			title: "Test Note",
			content: "Some content",
			scope: "global",
		});
		expect(id).toBeGreaterThan(0);

		// Read
		const note = await caller.note_get({ id });
		expect(note?.title).toBe("Test Note");

		// Update
		await caller.note_update({ id, title: "Updated" });
		const updated = await caller.note_get({ id });
		expect(updated?.title).toBe("Updated");

		// Delete
		await caller.note_delete({ id });
		const deleted = await caller.note_get({ id });
		expect(deleted).toBeNull();
	});

	it("note_list returns empty array initially", async () => {
		const caller = createTestCaller();
		const notes = await caller.note_list({});
		expect(Array.isArray(notes)).toBe(true);
	});

	it("note_search returns results for matching content", async () => {
		const caller = createTestCaller();

		await caller.note_create({
			title: "Searchable Note",
			content: "This contains unique keyword xylophone",
			scope: "global",
		});

		const results = await caller.note_search({ query: "xylophone" });
		expect(Array.isArray(results)).toBe(true);
		expect(results.length).toBeGreaterThan(0);
	});

	it("test_for_file returns no tests message for unknown file", async () => {
		const caller = createTestCaller();
		const result = await caller.test_for_file({ filePath: "nonexistent.ts" });
		expect(result).toContain("No test modules found");
	});
});
