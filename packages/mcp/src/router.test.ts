import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, describe, expect, it } from "vitest";
import { DataStore, DataStoreTestLayer, OutputPipelineLive, ProjectDiscoveryTest } from "vitest-agent-reporter-shared";
import type { McpContext } from "./context.js";
import { createCallerFactory } from "./context.js";
import { appRouter } from "./router.js";

const TestLayer = Layer.mergeAll(DataStoreTestLayer, OutputPipelineLive, ProjectDiscoveryTest.layer([]));
const testRuntime = ManagedRuntime.make(TestLayer);

function createTestCaller(cwd: string = process.cwd()) {
	const factory = createCallerFactory(appRouter);
	return factory({
		runtime: testRuntime as unknown as McpContext["runtime"],
		cwd,
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
		expect(note.found).toBe(true);
		if (note.found) expect(note.note.title).toBe("Test Note");

		// Update
		await caller.note_update({ id, title: "Updated" });
		const updated = await caller.note_get({ id });
		expect(updated.found).toBe(true);
		if (updated.found) expect(updated.note.title).toBe("Updated");

		// Delete
		await caller.note_delete({ id });
		const deleted = await caller.note_get({ id });
		expect(deleted.found).toBe(false);
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

	it("run_tests returns text content", { timeout: 30_000 }, async () => {
		// Anchor at an empty tempdir so the nested vitest invocation does not
		// pick up this monorepo's vitest.config.ts (which would re-load the
		// AgentPlugin and contend with the outer reporter on the same DB).
		const isolated = mkdtempSync(join(tmpdir(), "vitest-agent-reporter-run-tests-"));
		try {
			const caller = createTestCaller(isolated);
			const result = await caller.run_tests({ files: ["nonexistent.test.ts"], timeout: 5 });
			expect(typeof result).toBe("string");
		} finally {
			rmSync(isolated, { recursive: true, force: true });
		}
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

	it("test_get returns test details for known test", async () => {
		const caller = createTestCaller();
		const result = await caller.test_get({ fullName: "utils > adds numbers", project: "default" });
		expect(typeof result).toBe("string");
		expect(result).toContain("utils > adds numbers");
		expect(result).toContain("## Details");
		expect(result).toContain("passed");
		expect(result).toContain("src/utils.test.ts");
	});

	it("test_get returns not found for unknown test", async () => {
		const caller = createTestCaller();
		const result = await caller.test_get({ fullName: "nonexistent > test", project: "default" });
		expect(result).toContain("Test not found");
		expect(result).toContain("test_list");
	});

	it("file_coverage returns coverage data for tracked file", async () => {
		const caller = createTestCaller();
		const result = await caller.file_coverage({ filePath: "src/utils.ts", project: "default" });
		expect(typeof result).toBe("string");
		expect(result).toContain("src/utils.ts");
		// File is in lowCoverage (branches at 70% below typical threshold)
		// or shows project totals if not in lowCoverage list
		expect(result).toMatch(/Metrics|Coverage Totals/);
	});

	it("file_coverage returns fallback for unknown file", async () => {
		const caller = createTestCaller();
		const result = await caller.file_coverage({ filePath: "nonexistent.ts", project: "default" });
		expect(typeof result).toBe("string");
		expect(result).toContain("nonexistent.ts");
		expect(result).toContain("not in the low-coverage list");
	});

	describe("hypothesis_record and hypothesis_validate", () => {
		it("hypothesis_record creates a hypothesis and returns { id }", async () => {
			// Seed a session so the FK resolves
			const sessionId = await testRuntime.runPromise(
				Effect.gen(function* () {
					const store = yield* DataStore;
					return yield* store.writeSession({
						cc_session_id: "cc-hyp-record-test",
						project: "default",
						cwd: process.cwd(),
						agent_kind: "main",
						started_at: new Date().toISOString(),
					});
				}),
			);

			const caller = createTestCaller();
			const first = await caller.hypothesis_record({
				sessionId,
				content: "The failure is caused by a missing null guard in the parser.",
			});

			expect(first).toHaveProperty("id");
			expect((first as { id: number }).id).toBeGreaterThan(0);
			// Fresh insert must NOT carry the replay marker.
			expect((first as { _idempotentReplay?: true })._idempotentReplay).toBeUndefined();

			// Second call with the same key replays the cached response with
			// the _idempotentReplay marker attached.
			const replay = await caller.hypothesis_record({
				sessionId,
				content: "The failure is caused by a missing null guard in the parser.",
			});
			expect((replay as { id: number }).id).toBe((first as { id: number }).id);
			expect((replay as { _idempotentReplay?: true })._idempotentReplay).toBe(true);
		});

		it("hypothesis_validate updates the validation outcome to confirmed", async () => {
			// Seed session + hypothesis
			const { hypothesisId } = await testRuntime.runPromise(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const sessionId = yield* store.writeSession({
						cc_session_id: "cc-hyp-validate-test",
						project: "default",
						cwd: process.cwd(),
						agent_kind: "main",
						started_at: new Date().toISOString(),
					});
					const hypothesisId = yield* store.writeHypothesis({
						sessionId,
						content: "Race condition in the event loop.",
					});
					return { hypothesisId };
				}),
			);

			const caller = createTestCaller();
			const result = await caller.hypothesis_validate({
				id: hypothesisId,
				outcome: "confirmed",
				validatedAt: new Date().toISOString(),
			});

			expect(result).toEqual({});
		});

		it("hypothesis_validate returns error for unknown hypothesis id", async () => {
			const caller = createTestCaller();
			await expect(
				caller.hypothesis_validate({
					id: 999999,
					outcome: "refuted",
					validatedAt: new Date().toISOString(),
				}),
			).rejects.toThrow();
		});
	});

	describe("triage_brief tool", () => {
		it("returns 'no orientation signal' on empty DB", async () => {
			const caller = createTestCaller();
			const result = await caller.triage_brief({});
			expect(typeof result).toBe("string");
			expect(result).toMatch(/No orientation signal|orientation triage|Recent Test Runs/i);
		});

		it("includes content when test runs are seeded", async () => {
			const caller = createTestCaller();
			await seedTestData();
			const result = await caller.triage_brief({});
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});
	});

	describe("wrapup_prompt tool", () => {
		it("returns 'Nothing to wrap up' for an unknown session", async () => {
			const caller = createTestCaller();
			const result = await caller.wrapup_prompt({});
			expect(typeof result).toBe("string");
			expect(result).toMatch(/Nothing to wrap up|no recent activity/i);
		});

		it("emits a failure-prompt nudge for the user_prompt_nudge variant", async () => {
			const caller = createTestCaller();
			const result = await caller.wrapup_prompt({
				kind: "user_prompt_nudge",
				userPromptHint: "fix the broken test in foo.test.ts",
			});
			expect(result).toContain("test_history");
			expect(result).toContain("failure_signature_get");
		});
	});
});
