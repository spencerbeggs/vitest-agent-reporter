import * as NodeContext from "@effect/platform-node/NodeContext";
import { SqlClient } from "@effect/sql/SqlClient";
import { layer as sqliteClientLayer } from "@effect/sql-sqlite-node/SqliteClient";
import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import migration0001 from "../migrations/0001_initial.js";
import migration0002 from "../migrations/0002_comprehensive.js";
import migration0004 from "../migrations/0004_test_cases_created_turn_id.js";
import migration0005 from "../migrations/0005_file_coverage_tier.js";
import { DataStore } from "../services/DataStore.js";
import { DataStoreLive } from "./DataStoreLive.js";

const SqliteLayer = sqliteClientLayer({ filename: ":memory:" });
const PlatformLayer = NodeContext.layer;

const MigratorLayer = SqliteMigrator.layer({
	loader: SqliteMigrator.fromRecord({
		"0001_initial": migration0001,
		"0002_comprehensive": migration0002,
		"0004_test_cases_created_turn_id": migration0004,
		"0005_file_coverage_tier": migration0005,
	}),
}).pipe(Layer.provide(Layer.merge(SqliteLayer, PlatformLayer)));

const DataStoreLayer = DataStoreLive.pipe(Layer.provide(SqliteLayer));
const TestLayer = Layer.mergeAll(DataStoreLayer, MigratorLayer, SqliteLayer, PlatformLayer);

const run = <A, E>(effect: Effect.Effect<A, E, DataStore | SqlClient>) =>
	Effect.runPromise(Effect.provide(effect, TestLayer));

// Shared helpers for setting up prerequisite data
const settingsHash = "abc123";
const settingsInput = {
	vitest_version: "3.2.0",
	pool: "forks",
	environment: "node",
	test_timeout: 5000,
	hook_timeout: 10000,
	slow_test_threshold: 300,
	max_concurrency: 5,
	max_workers: 4,
	isolate: true,
	bail: 0,
	globals: false,
	file_parallelism: true,
	sequence_seed: 42,
	coverage_provider: "v8",
};

const runInput = {
	invocationId: "inv-001",
	project: "my-project",
	subProject: null,
	settingsHash,
	timestamp: "2026-03-22T00:00:00.000Z",
	commitSha: "deadbeef",
	branch: "main",
	reason: "passed" as const,
	duration: 1234,
	total: 10,
	passed: 9,
	failed: 1,
	skipped: 0,
	scoped: false,
};

describe("DataStoreLive", () => {
	describe("ensureFile", () => {
		it("inserts a new file and returns its ID", async () => {
			const id = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					return yield* store.ensureFile("src/index.ts");
				}),
			);
			expect(id).toBeGreaterThan(0);
		});

		it("is idempotent -- returns the same ID for the same path", async () => {
			const [id1, id2] = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const first = yield* store.ensureFile("src/utils.ts");
					const second = yield* store.ensureFile("src/utils.ts");
					return [first, second];
				}),
			);
			expect(id1).toBe(id2);
		});
	});

	describe("writeSettings", () => {
		it("inserts settings and env vars", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings(settingsHash, settingsInput, { CI: "true", NODE_ENV: "test" });

					const sql = yield* SqlClient;
					const rows = yield* sql<{ hash: string }>`SELECT hash FROM settings WHERE hash = ${settingsHash}`;
					expect(rows).toHaveLength(1);

					const envRows = yield* sql<{
						key: string;
						value: string;
					}>`SELECT key, value FROM settings_env_vars WHERE settings_hash = ${settingsHash} ORDER BY key`;
					expect(envRows).toHaveLength(2);
					expect(envRows[0].key).toBe("CI");
					expect(envRows[1].key).toBe("NODE_ENV");
				}),
			);
		});

		it("is idempotent on the same hash", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const hash = "idempotent-hash";
					yield* store.writeSettings(hash, settingsInput, { A: "1" });
					yield* store.writeSettings(hash, settingsInput, { A: "1" });

					const sql = yield* SqlClient;
					const rows = yield* sql<{ hash: string }>`SELECT hash FROM settings WHERE hash = ${hash}`;
					expect(rows).toHaveLength(1);
				}),
			);
		});
	});

	describe("writeRun", () => {
		it("inserts a test run and returns an auto-incremented ID", async () => {
			const id = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings(settingsHash, settingsInput, {});
					return yield* store.writeRun(runInput);
				}),
			);
			expect(id).toBeGreaterThan(0);
		});

		it("returns different IDs for subsequent runs", async () => {
			const [id1, id2] = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("run-hash-2", settingsInput, {});
					const first = yield* store.writeRun({ ...runInput, settingsHash: "run-hash-2" });
					const second = yield* store.writeRun({
						...runInput,
						settingsHash: "run-hash-2",
						timestamp: "2026-03-22T01:00:00.000Z",
					});
					return [first, second];
				}),
			);
			expect(id2).toBeGreaterThan(id1);
		});
	});

	describe("writeModules", () => {
		it("inserts module rows linked to a run ID and returns IDs", async () => {
			const ids = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("mod-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "mod-hash" });
					const fileId = yield* store.ensureFile("src/mod.test.ts");
					return yield* store.writeModules(runId, [
						{
							fileId,
							relativeModuleId: "src/mod.test.ts",
							state: "passed",
							duration: 100,
						},
					]);
				}),
			);
			expect(ids).toHaveLength(1);
			expect(ids[0]).toBeGreaterThan(0);
		});
	});

	describe("writeSuites", () => {
		it("inserts suite rows linked to a module ID", async () => {
			const ids = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("suite-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "suite-hash" });
					const fileId = yield* store.ensureFile("src/suite.test.ts");
					const [moduleId] = yield* store.writeModules(runId, [
						{ fileId, relativeModuleId: "src/suite.test.ts", state: "passed" },
					]);
					return yield* store.writeSuites(moduleId, [{ name: "my suite", fullName: "my suite", state: "passed" }]);
				}),
			);
			expect(ids).toHaveLength(1);
			expect(ids[0]).toBeGreaterThan(0);
		});
	});

	describe("writeTestCases", () => {
		it("inserts test case rows linked to a module ID", async () => {
			const ids = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("tc-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "tc-hash" });
					const fileId = yield* store.ensureFile("src/tc.test.ts");
					const [moduleId] = yield* store.writeModules(runId, [
						{ fileId, relativeModuleId: "src/tc.test.ts", state: "passed" },
					]);
					return yield* store.writeTestCases(moduleId, [
						{
							name: "does something",
							fullName: "suite > does something",
							state: "passed",
							duration: 5,
							flaky: false,
							slow: false,
						},
						{
							name: "fails",
							fullName: "suite > fails",
							state: "failed",
							classification: "new-failure",
							duration: 10,
						},
					]);
				}),
			);
			expect(ids).toHaveLength(2);
			expect(ids[0]).toBeGreaterThan(0);
			expect(ids[1]).toBeGreaterThan(ids[0]);
		});
	});

	describe("writeErrors", () => {
		it("inserts error rows with the correct scope", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("err-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "err-hash" });
					yield* store.writeErrors(runId, [
						{
							scope: "unhandled",
							message: "Unexpected error",
							stack: "Error: Unexpected error\n  at ...",
						},
						{
							scope: "test",
							message: "Expected true to be false",
							diff: "- true\n+ false",
						},
					]);

					const sql = yield* SqlClient;
					const rows = yield* sql<{
						scope: string;
						message: string;
					}>`SELECT scope, message FROM test_errors WHERE run_id = ${runId} ORDER BY id`;
					expect(rows).toHaveLength(2);
					expect(rows[0].scope).toBe("unhandled");
					expect(rows[1].scope).toBe("test");
				}),
			);
		});

		it("persists signature_hash on test_errors when provided", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const sql = yield* SqlClient;

					yield* store.writeSettings("sig-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "sig-hash" });

					yield* store.writeFailureSignature({
						signatureHash: "abcdef0123456789",
						runId,
						seenAt: "2026-04-29T00:00:00Z",
					});

					yield* store.writeErrors(runId, [
						{
							scope: "unhandled",
							message: "boom",
							signatureHash: "abcdef0123456789",
							ordinal: 0,
						},
					]);

					const rows = yield* sql<{ signature_hash: string | null }>`
						SELECT signature_hash FROM test_errors WHERE run_id = ${runId}
					`;
					expect(rows).toHaveLength(1);
					expect(rows[0].signature_hash).toBe("abcdef0123456789");
				}),
			);
		});
	});

	describe("writeErrors with frames", () => {
		it("persists source_mapped_line and function_boundary_line when frames are provided", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const sql = yield* SqlClient;

					yield* store.writeSettings("frame-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "frame-hash" });

					yield* store.writeErrors(runId, [
						{
							scope: "unhandled",
							message: "boom",
							ordinal: 0,
							frames: [
								{
									ordinal: 0,
									method: "Foo.bar",
									filePath: "/abs/src/foo.ts",
									line: 42,
									col: 9,
									sourceMappedLine: 17,
									functionBoundaryLine: 12,
								},
							],
						},
					]);

					const rows = yield* sql<{
						source_mapped_line: number | null;
						function_boundary_line: number | null;
					}>`
						SELECT source_mapped_line, function_boundary_line FROM stack_frames
					`;
					expect(rows).toHaveLength(1);
					expect(rows[0].source_mapped_line).toBe(17);
					expect(rows[0].function_boundary_line).toBe(12);
				}),
			);
		});
	});

	describe("endSession", () => {
		it("updates ended_at and end_reason on the matching cc_session_id", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const sql = yield* SqlClient;

					yield* store.writeSession({
						cc_session_id: "cc-end-test",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-29T00:00:00Z",
					});

					yield* store.endSession("cc-end-test", "2026-04-29T00:01:00Z", "clear");

					const rows = yield* sql<{ ended_at: string | null; end_reason: string | null }>`
						SELECT ended_at, end_reason FROM sessions WHERE cc_session_id = 'cc-end-test'
					`;
					expect(rows[0].ended_at).toBe("2026-04-29T00:01:00Z");
					expect(rows[0].end_reason).toBe("clear");
				}),
			);
		});

		it("fails loudly when cc_session_id is unknown", async () => {
			await expect(
				run(
					Effect.gen(function* () {
						const store = yield* DataStore;
						yield* store.endSession("nope", "2026-04-29T00:01:00Z", "clear");
					}),
				),
			).rejects.toThrow(/unknown cc_session_id/);
		});
	});

	describe("writeFailureSignature", () => {
		it("inserts on first call and increments occurrence_count on second", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const sql = yield* SqlClient;

					yield* store.writeSettings("fs-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "fs-hash" });

					yield* store.writeFailureSignature({
						signatureHash: "deadbeefcafe1234",
						runId,
						seenAt: "2026-04-29T00:00:00Z",
					});
					yield* store.writeFailureSignature({
						signatureHash: "deadbeefcafe1234",
						runId,
						seenAt: "2026-04-29T00:00:01Z",
					});

					const rows = yield* sql<{ signature_hash: string; occurrence_count: number }>`
						SELECT signature_hash, occurrence_count FROM failure_signatures WHERE signature_hash = 'deadbeefcafe1234'
					`;
					expect(rows).toHaveLength(1);
					expect(rows[0].occurrence_count).toBe(2);
				}),
			);
		});
	});

	describe("writeCoverage", () => {
		it("inserts file coverage rows", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("cov-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "cov-hash" });
					const fileId = yield* store.ensureFile("src/covered.ts");

					yield* store.writeCoverage(runId, [
						{
							fileId,
							statements: 85.5,
							branches: 70.0,
							functions: 90.0,
							lines: 82.3,
							uncoveredLines: "42-50,99",
						},
					]);

					const sql = yield* SqlClient;
					const rows = yield* sql<{
						lines: number;
						uncovered_lines: string;
					}>`SELECT lines, uncovered_lines FROM file_coverage WHERE run_id = ${runId}`;
					expect(rows).toHaveLength(1);
					expect(rows[0].lines).toBeCloseTo(82.3);
					expect(rows[0].uncovered_lines).toBe("42-50,99");
				}),
			);
		});
	});

	describe("writeHistory", () => {
		it("inserts a history row", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("hist-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "hist-hash" });

					yield* store.writeHistory(
						"my-project",
						null,
						"suite > test one",
						runId,
						"2026-03-22T00:00:00.000Z",
						"passed",
						50,
						false,
						0,
						null,
					);

					const sql = yield* SqlClient;
					const rows = yield* sql<{
						full_name: string;
					}>`SELECT full_name FROM test_history WHERE project = 'my-project'`;
					expect(rows).toHaveLength(1);
					expect(rows[0].full_name).toBe("suite > test one");
				}),
			);
		});

		it("respects 10-entry sliding window", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("hist-win-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "hist-win-hash" });

					// Insert 12 entries for the same test
					for (let i = 0; i < 12; i++) {
						yield* store.writeHistory(
							"window-proj",
							null,
							"windowed test",
							runId,
							`2026-03-22T${String(i).padStart(2, "0")}:00:00.000Z`,
							"passed",
							10,
							false,
							0,
							null,
						);
					}

					const sql = yield* SqlClient;
					const rows = yield* sql<{
						id: number;
					}>`SELECT id FROM test_history WHERE project = 'window-proj' AND full_name = 'windowed test'`;
					expect(rows).toHaveLength(10);
				}),
			);
		});
	});

	describe("writeBaselines", () => {
		it("upserts global baseline metrics", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeBaselines({
						updatedAt: "2026-03-22T00:00:00.000Z",
						global: { lines: 80, branches: 70 },
						patterns: [],
					});

					const sql = yield* SqlClient;
					const rows = yield* sql<{
						metric: string;
						value: number;
					}>`SELECT metric, value FROM coverage_baselines WHERE project = '__global__' ORDER BY metric`;
					expect(rows).toHaveLength(2);
					expect(rows[0].metric).toBe("branches");
					expect(rows[0].value).toBe(70);
					expect(rows[1].metric).toBe("lines");
					expect(rows[1].value).toBe(80);
				}),
			);
		});

		it("upserts pattern baseline metrics", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeBaselines({
						updatedAt: "2026-03-22T00:00:00.000Z",
						global: {},
						patterns: [["src/**/*.ts", { lines: 90, functions: 85 }]],
					});

					const sql = yield* SqlClient;
					const rows = yield* sql<{
						pattern: string;
						metric: string;
						value: number;
					}>`SELECT pattern, metric, value FROM coverage_baselines WHERE pattern IS NOT NULL ORDER BY metric`;
					expect(rows).toHaveLength(2);
					expect(rows[0].pattern).toBe("src/**/*.ts");
				}),
			);
		});
	});

	describe("writeTrends", () => {
		it("inserts a trend entry", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("trend-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "trend-hash" });

					yield* store.writeTrends("my-project", null, runId, {
						timestamp: "2026-03-22T00:00:00.000Z",
						coverage: { lines: 80, branches: 70, functions: 85, statements: 82 },
						delta: { lines: 1, branches: 0.5, functions: 0, statements: 0.3 },
						direction: "improving",
						targetsHash: "hash123",
					});

					const sql = yield* SqlClient;
					const rows = yield* sql<{
						direction: string;
					}>`SELECT direction FROM coverage_trends WHERE project = 'my-project'`;
					expect(rows).toHaveLength(1);
					expect(rows[0].direction).toBe("improving");
				}),
			);
		});

		it("respects 50-entry sliding window", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("trend-win-hash", settingsInput, {});

					// Insert 52 entries
					for (let i = 0; i < 52; i++) {
						const runId = yield* store.writeRun({
							...runInput,
							settingsHash: "trend-win-hash",
							timestamp: `2026-03-22T${String(i).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z`,
						});
						yield* store.writeTrends("trend-win-proj", null, runId, {
							timestamp: `2026-03-22T${String(i).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00.000Z`,
							coverage: { lines: 80 + i * 0.1, branches: 70, functions: 85, statements: 82 },
							delta: { lines: 0.1, branches: 0, functions: 0, statements: 0 },
							direction: "improving",
						});
					}

					const sql = yield* SqlClient;
					const rows = yield* sql<{ id: number }>`SELECT id FROM coverage_trends WHERE project = 'trend-win-proj'`;
					expect(rows).toHaveLength(50);
				}),
			);
		});
	});

	describe("writeSourceMap", () => {
		it("creates source-to-test mapping", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					yield* store.writeSettings("sm-hash", settingsInput, {});
					const runId = yield* store.writeRun({ ...runInput, settingsHash: "sm-hash" });
					const fileId = yield* store.ensureFile("src/sm.test.ts");
					const [moduleId] = yield* store.writeModules(runId, [
						{ fileId, relativeModuleId: "src/sm.test.ts", state: "passed" },
					]);

					yield* store.writeSourceMap("src/sm.ts", moduleId, "convention");

					const sql = yield* SqlClient;
					const rows = yield* sql<{
						mapping_type: string;
					}>`SELECT mapping_type FROM source_test_map WHERE test_module_id = ${moduleId}`;
					expect(rows).toHaveLength(1);
					expect(rows[0].mapping_type).toBe("convention");
				}),
			);
		});
	});

	describe("writeNote / updateNote / deleteNote", () => {
		it("creates a note and returns its ID", async () => {
			const id = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					return yield* store.writeNote({
						title: "Test note",
						content: "Some content",
						scope: "global",
					});
				}),
			);
			expect(id).toBeGreaterThan(0);
		});

		it("updates a note", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const id = yield* store.writeNote({
						title: "Original",
						content: "Original content",
						scope: "global",
					});

					yield* store.updateNote(id, { title: "Updated", pinned: true });

					const sql = yield* SqlClient;
					const rows = yield* sql<{ title: string; pinned: number }>`SELECT title, pinned FROM notes WHERE id = ${id}`;
					expect(rows[0].title).toBe("Updated");
					expect(rows[0].pinned).toBe(1);
				}),
			);
		});

		it("deletes a note", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const id = yield* store.writeNote({
						title: "To delete",
						content: "Will be deleted",
						scope: "global",
					});

					yield* store.deleteNote(id);

					const sql = yield* SqlClient;
					const rows = yield* sql<{ id: number }>`SELECT id FROM notes WHERE id = ${id}`;
					expect(rows).toHaveLength(0);
				}),
			);
		});

		it("handles updateNote with no fields (no-op)", async () => {
			await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const id = yield* store.writeNote({
						title: "No change",
						content: "stays same",
						scope: "global",
					});

					// Should not throw
					yield* store.updateNote(id, {});

					const sql = yield* SqlClient;
					const rows = yield* sql<{ title: string }>`SELECT title FROM notes WHERE id = ${id}`;
					expect(rows[0].title).toBe("No change");
				}),
			);
		});
	});

	describe("writeHypothesis", () => {
		it("writes a hypothesis and returns a positive integer id", async () => {
			const result = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const sessionId = yield* store.writeSession({
						cc_session_id: "cc-hyp-basic",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-30T00:00:00Z",
					});
					return yield* store.writeHypothesis({
						sessionId,
						content: "The failure is caused by a missing null check.",
					});
				}),
			);
			expect(result).toBeGreaterThan(0);
		});

		it("writes a hypothesis with all optional fields", async () => {
			const result = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const sessionId = yield* store.writeSession({
						cc_session_id: "cc-hyp-full",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-30T00:00:00Z",
					});
					const id1 = yield* store.writeHypothesis({
						sessionId,
						content: "First hypothesis.",
					});
					const id2 = yield* store.writeHypothesis({
						sessionId,
						content: "Second hypothesis with evidence ref.",
					});
					return { id1, id2 };
				}),
			);
			expect(result.id1).toBeGreaterThan(0);
			expect(result.id2).toBeGreaterThan(result.id1);
		});

		it("fails with a DataStoreError when session_id FK does not exist", async () => {
			await expect(
				run(
					Effect.gen(function* () {
						const store = yield* DataStore;
						return yield* store.writeHypothesis({
							sessionId: 99999,
							content: "This should fail due to FK constraint.",
						});
					}),
				),
			).rejects.toThrow();
		});
	});

	describe("validateHypothesis", () => {
		it("updates validation_outcome to confirmed", async () => {
			const sql_ = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const sql = yield* SqlClient;
					const sessionId = yield* store.writeSession({
						cc_session_id: "cc-val-confirmed",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-30T00:00:00Z",
					});
					const hypothesisId = yield* store.writeHypothesis({
						sessionId,
						content: "The bug is in the parser.",
					});
					yield* store.validateHypothesis({
						id: hypothesisId,
						outcome: "confirmed",
						validatedAt: "2026-04-30T01:00:00Z",
					});
					const rows = yield* sql<{ validation_outcome: string | null }>`
						SELECT validation_outcome FROM hypotheses WHERE id = ${hypothesisId}
					`;
					return rows[0].validation_outcome;
				}),
			);
			expect(sql_).toBe("confirmed");
		});

		it("updates validation_outcome to refuted", async () => {
			const result = await run(
				Effect.gen(function* () {
					const store = yield* DataStore;
					const sql = yield* SqlClient;
					const sessionId = yield* store.writeSession({
						cc_session_id: "cc-val-refuted",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-30T00:00:00Z",
					});
					const hypothesisId = yield* store.writeHypothesis({
						sessionId,
						content: "The bug is in the serializer.",
					});
					yield* store.validateHypothesis({
						id: hypothesisId,
						outcome: "refuted",
						validatedAt: "2026-04-30T02:00:00Z",
					});
					const rows = yield* sql<{ validation_outcome: string | null }>`
						SELECT validation_outcome FROM hypotheses WHERE id = ${hypothesisId}
					`;
					return rows[0].validation_outcome;
				}),
			);
			expect(result).toBe("refuted");
		});

		it("fails with DataStoreError for unknown hypothesis id", async () => {
			await expect(
				run(
					Effect.gen(function* () {
						const store = yield* DataStore;
						yield* store.validateHypothesis({
							id: 99999,
							outcome: "confirmed",
							validatedAt: "2026-04-30T00:00:00Z",
						});
					}),
				),
			).rejects.toThrow("unknown hypothesis id: 99999");
		});
	});

	describe("writeSession + writeTurn", () => {
		it("writes a session and a turn referencing it", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-test",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-29T00:00:00Z",
					});
					const turnId = yield* ds.writeTurn({
						session_id: sessionId,
						turn_no: 1,
						type: "user_prompt",
						payload: JSON.stringify({ type: "user_prompt", prompt: "hi" }),
						occurred_at: "2026-04-29T00:00:01Z",
					});
					return { sessionId, turnId };
				}),
			);
			expect(result.sessionId).toBeGreaterThan(0);
			expect(result.turnId).toBeGreaterThan(0);
		});

		it("auto-assigns turn_no when omitted (next per session)", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sql = yield* SqlClient;

					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-auto-no",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-29T00:00:00Z",
					});

					yield* ds.writeTurn({
						session_id: sessionId,
						type: "user_prompt",
						payload: '{"type":"user_prompt","prompt":"a"}',
						occurred_at: "2026-04-29T00:00:01Z",
					});
					yield* ds.writeTurn({
						session_id: sessionId,
						type: "user_prompt",
						payload: '{"type":"user_prompt","prompt":"b"}',
						occurred_at: "2026-04-29T00:00:02Z",
					});

					const rows = yield* sql<{ turn_no: number }>`
						SELECT turn_no FROM turns WHERE session_id = ${sessionId} ORDER BY turn_no
					`;
					return rows;
				}),
			);
			expect(result.map((r) => r.turn_no)).toEqual([1, 2]);
		});
	});

	describe("pruneSessions", () => {
		it("keeps the N most-recent sessions' turns and drops older ones", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sql = yield* SqlClient;

					// Seed 4 sessions, oldest first.
					for (let i = 0; i < 4; i++) {
						const id = yield* ds.writeSession({
							cc_session_id: `cc-prune-${i}`,
							project: "p",
							cwd: "/tmp/p",
							agent_kind: "main",
							started_at: `2026-04-${String(20 + i).padStart(2, "0")}T00:00:00Z`,
						});
						yield* ds.writeTurn({
							session_id: id,
							type: "user_prompt",
							payload: JSON.stringify({ type: "user_prompt", prompt: `p${i}` }),
							occurred_at: `2026-04-${String(20 + i).padStart(2, "0")}T00:00:01Z`,
						});
					}

					const out = yield* ds.pruneSessions(2);
					const remainingTurnSessions = yield* sql<{ session_id: number }>`
						SELECT DISTINCT session_id FROM turns ORDER BY session_id
					`;
					return { out, remainingTurnSessions };
				}),
			);
			expect(result.out.affectedSessions).toBe(2);
			expect(result.out.prunedTurns).toBe(2);
			// Sessions 1+2 (the two oldest) lose their turns; 3+4 keep them.
			expect(result.remainingTurnSessions).toHaveLength(2);
		});

		it("returns zeros when fewer sessions exist than the keepRecent count", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					yield* ds.writeSession({
						cc_session_id: "cc-prune-only",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-29T00:00:00Z",
					});
					return yield* ds.pruneSessions(30);
				}),
			);
			expect(result.affectedSessions).toBe(0);
			expect(result.prunedTurns).toBe(0);
		});

		it("retains the sessions rows themselves (only turn rows are dropped)", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sql = yield* SqlClient;

					for (let i = 0; i < 3; i++) {
						const id = yield* ds.writeSession({
							cc_session_id: `cc-keep-${i}`,
							project: "p",
							cwd: "/tmp/p",
							agent_kind: "main",
							started_at: `2026-04-${String(20 + i).padStart(2, "0")}T00:00:00Z`,
						});
						yield* ds.writeTurn({
							session_id: id,
							type: "user_prompt",
							payload: JSON.stringify({ type: "user_prompt", prompt: `p${i}` }),
							occurred_at: `2026-04-${String(20 + i).padStart(2, "0")}T00:00:01Z`,
						});
					}

					yield* ds.pruneSessions(1);
					const sessionRows = yield* sql<{ count: number }>`SELECT COUNT(*) AS count FROM sessions`;
					return sessionRows[0].count;
				}),
			);
			expect(result).toBe(3);
		});
	});

	describe("writeTddSession", () => {
		it("inserts a tdd_sessions row and returns the id", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sql = yield* SqlClient;

					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-tdd-1",
						project: "demo",
						cwd: "/tmp/demo",
						agent_kind: "subagent",
						agent_type: "tdd-orchestrator",
						started_at: "2026-04-29T00:00:00Z",
					});

					const tddId = yield* ds.writeTddSession({
						sessionId,
						goal: "add login validation",
						startedAt: "2026-04-29T00:00:01Z",
					});

					const rows = yield* sql<{ goal: string; session_id: number }>`
						SELECT goal, session_id FROM tdd_sessions WHERE id = ${tddId}
					`;
					return rows;
				}),
			);
			expect(result).toHaveLength(1);
			expect(result[0].goal).toBe("add login validation");
		});

		it("rejects duplicate (sessionId, goal) via the UNIQUE constraint", async () => {
			const exit = await Effect.runPromiseExit(
				Effect.provide(
					Effect.gen(function* () {
						const ds = yield* DataStore;
						const sessionId = yield* ds.writeSession({
							cc_session_id: "cc-tdd-2",
							project: "demo",
							cwd: "/tmp/demo",
							agent_kind: "subagent",
							started_at: "2026-04-29T00:00:00Z",
						});
						yield* ds.writeTddSession({ sessionId, goal: "g", startedAt: "2026-04-29T00:00:01Z" });
						yield* ds.writeTddSession({ sessionId, goal: "g", startedAt: "2026-04-29T00:00:02Z" });
					}),
					TestLayer,
				),
			);
			expect(exit._tag).toBe("Failure");
		});
	});

	describe("endTddSession", () => {
		it("updates ended_at, outcome, summary_note_id", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sql = yield* SqlClient;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-tdd-end",
						project: "demo",
						cwd: "/tmp/demo",
						agent_kind: "subagent",
						started_at: "2026-04-29T00:00:00Z",
					});
					const tddId = yield* ds.writeTddSession({
						sessionId,
						goal: "g",
						startedAt: "2026-04-29T00:00:01Z",
					});
					yield* ds.endTddSession({
						id: tddId,
						endedAt: "2026-04-29T00:01:00Z",
						outcome: "succeeded",
					});
					const rows = yield* sql<{ outcome: string; ended_at: string }>`
						SELECT outcome, ended_at FROM tdd_sessions WHERE id = ${tddId}
					`;
					return rows;
				}),
			);
			expect(result[0].outcome).toBe("succeeded");
			expect(result[0].ended_at).toBe("2026-04-29T00:01:00Z");
		});
	});

	describe("writeTddSessionBehaviors", () => {
		it("inserts each behavior with sequential ordinals starting at 0", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-decomp",
						project: "demo",
						cwd: "/tmp/demo",
						agent_kind: "subagent",
						started_at: "2026-04-29T00:00:00Z",
					});
					const tddId = yield* ds.writeTddSession({
						sessionId,
						goal: "add OAuth flow",
						startedAt: "2026-04-29T00:00:01Z",
					});

					return yield* ds.writeTddSessionBehaviors({
						parentTddSessionId: tddId,
						behaviors: [
							{ behavior: "rejects empty token", suggestedTestName: "rejects empty token" },
							{
								behavior: "accepts valid token",
								suggestedTestName: "accepts valid token",
								dependsOnBehaviorIds: [],
							},
						],
					});
				}),
			);
			expect(result).toHaveLength(2);
			expect(result[0].ordinal).toBe(0);
			expect(result[1].ordinal).toBe(1);
			expect(result[0].behavior).toBe("rejects empty token");
		});
	});

	describe("writeTddPhase", () => {
		it("opens a new phase and closes the prior one", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sql = yield* SqlClient;

					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-phase",
						project: "demo",
						cwd: "/tmp/demo",
						agent_kind: "subagent",
						started_at: "2026-04-29T00:00:00Z",
					});
					const tddId = yield* ds.writeTddSession({
						sessionId,
						goal: "g",
						startedAt: "2026-04-29T00:00:01Z",
					});

					const r1 = yield* ds.writeTddPhase({
						tddSessionId: tddId,
						phase: "red",
						startedAt: "2026-04-29T00:00:02Z",
					});
					const r2 = yield* ds.writeTddPhase({
						tddSessionId: tddId,
						phase: "green",
						startedAt: "2026-04-29T00:00:10Z",
						transitionReason: "test failed",
					});

					const closed = yield* sql<{ ended_at: string | null }>`
						SELECT ended_at FROM tdd_phases WHERE id = ${r1.id}
					`;
					return { r1, r2, closed };
				}),
			);
			expect(result.r1.previousPhaseId).toBeNull();
			expect(result.r2.previousPhaseId).toBe(result.r1.id);
			expect(result.closed[0].ended_at).toBe("2026-04-29T00:00:10Z");
		});
	});

	describe("writeTddArtifact", () => {
		it("inserts a tdd_artifacts row and returns the id", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sql = yield* SqlClient;

					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-art",
						project: "demo",
						cwd: "/tmp/demo",
						agent_kind: "subagent",
						started_at: "2026-04-29T00:00:00Z",
					});
					const tddId = yield* ds.writeTddSession({
						sessionId,
						goal: "g",
						startedAt: "2026-04-29T00:00:01Z",
					});
					const phase = yield* ds.writeTddPhase({
						tddSessionId: tddId,
						phase: "red",
						startedAt: "2026-04-29T00:00:02Z",
					});

					const id = yield* ds.writeTddArtifact({
						phaseId: phase.id,
						artifactKind: "test_written",
						recordedAt: "2026-04-29T00:00:03Z",
					});

					const rows = yield* sql<{ artifact_kind: string }>`
						SELECT artifact_kind FROM tdd_artifacts WHERE id = ${id}
					`;
					return rows;
				}),
			);
			expect(result[0].artifact_kind).toBe("test_written");
		});
	});

	describe("writeCommit + writeRunChangedFiles", () => {
		it("inserts a commit and a set of changed files", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sql = yield* SqlClient;

					yield* ds.writeCommit({
						sha: "abc1234",
						parentSha: "0000000",
						message: "feat: add foo",
						author: "Test User <test@example.com>",
						committedAt: "2026-04-29T00:00:00Z",
						branch: "main",
					});

					yield* ds.writeSettings("commit-hash", settingsInput, {});
					const runId = yield* ds.writeRun({
						...runInput,
						invocationId: "inv-commit",
						settingsHash: "commit-hash",
						project: "demo",
						timestamp: "2026-04-29T00:00:01Z",
						duration: 1,
						total: 0,
						passed: 0,
						failed: 0,
						skipped: 0,
						reason: "passed" as const,
					});
					yield* ds.writeRunChangedFiles({
						runId,
						files: [
							{ filePath: "/abs/src/foo.ts", changeKind: "modified", commitSha: "abc1234" },
							{ filePath: "/abs/src/bar.ts", changeKind: "added", commitSha: "abc1234" },
						],
					});

					const commit = yield* sql<{ sha: string }>`SELECT sha FROM commits WHERE sha = 'abc1234'`;
					const files = yield* sql<{
						change_kind: string;
					}>`SELECT change_kind FROM run_changed_files WHERE run_id = ${runId}`;
					return { commit, files };
				}),
			);
			expect(result.commit).toHaveLength(1);
			expect(result.files).toHaveLength(2);
		});
	});
});
