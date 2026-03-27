import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, describe, expect, it } from "vitest";
import { DataStoreTestLayer } from "../layers/DataStoreTest.js";
import { OutputPipelineLive } from "../layers/OutputPipelineLive.js";
import { ProjectDiscoveryTest } from "../layers/ProjectDiscoveryTest.js";
import { DataStore } from "../services/DataStore.js";
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

async function seedTestData() {
	await testRuntime.runPromise(
		Effect.gen(function* () {
			const store = yield* DataStore;

			// Write settings
			yield* store.writeSettings(
				"abc123",
				{ vitest_version: "3.2.0", pool: "forks", coverage_provider: "v8" },
				{ CI: "true", NODE_ENV: "test" },
			);

			// Write a test run
			const runId = yield* store.writeRun({
				invocationId: "inv-001",
				project: "default",
				subProject: null,
				settingsHash: "abc123",
				timestamp: "2026-03-25T10:00:00.000Z",
				commitSha: null,
				branch: null,
				reason: "passed",
				duration: 1200,
				total: 5,
				passed: 5,
				failed: 0,
				skipped: 0,
				scoped: false,
			});

			// Write a module
			const fileId = yield* store.ensureFile("src/utils.test.ts");
			const moduleIds = yield* store.writeModules(runId, [
				{
					fileId,
					relativeModuleId: "src/utils.test.ts",
					state: "passed",
					duration: 500,
				},
			]);

			// Write suites
			yield* store.writeSuites(moduleIds[0], [
				{
					name: "utils",
					fullName: "utils",
					state: "passed",
				},
			]);

			// Write test cases
			yield* store.writeTestCases(moduleIds[0], [
				{
					name: "adds numbers",
					fullName: "utils > adds numbers",
					state: "passed",
					duration: 10,
				},
				{
					name: "subtracts numbers",
					fullName: "utils > subtracts numbers",
					state: "passed",
					duration: 5,
				},
			]);

			// Write coverage
			const srcFileId = yield* store.ensureFile("src/utils.ts");
			yield* store.writeCoverage(runId, [
				{
					fileId: srcFileId,
					statements: 85.5,
					branches: 70.0,
					functions: 90.0,
					lines: 85.0,
					uncoveredLines: "42-50",
				},
			]);

			// Write trends
			yield* store.writeTrends("default", null, runId, {
				timestamp: "2026-03-25T10:00:00.000Z",
				coverage: { statements: 85.5, branches: 70.0, functions: 90.0, lines: 85.0 },
				delta: { statements: 1.0, branches: 0.5, functions: 0.0, lines: 1.0 },
				direction: "improving",
			});
		}),
	);
}

afterAll(async () => {
	await testRuntime.dispose();
});

describe("MCP Router", () => {
	it("help returns complete tool catalog", async () => {
		const caller = createTestCaller();
		const result = await caller.help();
		expect(result).toContain("vitest-agent-reporter MCP Tools");
		expect(result).toContain("test_status");
		expect(result).toContain("run_tests");
		expect(result).toContain("note_create");
		expect(result).toContain("Parameter Key");
	});

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

	it("configure returns settings when no hash provided", async () => {
		await seedTestData();
		const caller = createTestCaller();
		const result = await caller.configure({});
		expect(typeof result).toBe("string");
		expect(result).toContain("Settings");
		expect(result).toContain("abc123");
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

	it("note_list returns no notes message for empty state", async () => {
		// Use a scope filter that won't match any notes
		const caller = createTestCaller();
		const result = await caller.note_list({ scope: "test", testFullName: "nonexistent" });
		expect(typeof result).toBe("string");
		expect(result).toContain("No notes found");
	});

	it("note_list returns markdown table when notes exist", async () => {
		const caller = createTestCaller();
		await caller.note_create({
			title: "Table Note",
			content: "Content for table test",
			scope: "global",
		});
		const result = await caller.note_list({});
		expect(typeof result).toBe("string");
		expect(result).toContain("## Notes");
		expect(result).toContain("| ID |");
		expect(result).toContain("Table Note");
	});

	it("note_search returns no notes for empty results", async () => {
		const caller = createTestCaller();
		const result = await caller.note_search({ query: "nonexistentkeyword999" });
		expect(typeof result).toBe("string");
		expect(result).toContain("No notes found");
	});

	it("note_search returns markdown table for matching content", async () => {
		const caller = createTestCaller();

		await caller.note_create({
			title: "Searchable Note",
			content: "This contains unique keyword xylophone",
			scope: "global",
		});

		const result = await caller.note_search({ query: "xylophone" });
		expect(typeof result).toBe("string");
		expect(result).toContain('Notes matching "xylophone"');
		expect(result).toContain("| ID |");
	});

	it("test_for_file returns no tests message for unknown file", async () => {
		const caller = createTestCaller();
		const result = await caller.test_for_file({ filePath: "nonexistent.ts" });
		expect(result).toContain("No test modules found");
	});

	it("test_coverage returns coverage data after seeding", async () => {
		const caller = createTestCaller();
		const result = await caller.test_coverage({ project: "default" });
		expect(typeof result).toBe("string");
		expect(result).toContain("Coverage Report");
		expect(result).toContain("statements");
	});

	it("run_tests returns text content", async () => {
		const caller = createTestCaller();
		const result = await caller.run_tests({ files: ["nonexistent.test.ts"], timeout: 5 });
		expect(typeof result).toBe("string");
	});

	it("project_list returns markdown with Projects heading", async () => {
		const caller = createTestCaller();
		const result = await caller.project_list({});
		expect(typeof result).toBe("string");
		expect(result).toContain("Projects");
	});

	it("test_list returns string", async () => {
		const caller = createTestCaller();
		const result = await caller.test_list({ project: "default" });
		expect(typeof result).toBe("string");
	});

	it("module_list returns string", async () => {
		const caller = createTestCaller();
		const result = await caller.module_list({ project: "default" });
		expect(typeof result).toBe("string");
	});

	it("suite_list returns string", async () => {
		const caller = createTestCaller();
		const result = await caller.suite_list({ project: "default" });
		expect(typeof result).toBe("string");
	});

	it("settings_list returns markdown with Settings and Hash", async () => {
		const caller = createTestCaller();
		const result = await caller.settings_list({});
		expect(typeof result).toBe("string");
		expect(result).toContain("Settings");
		expect(result).toContain("Hash");
	});
});
