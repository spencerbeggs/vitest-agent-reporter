import * as NodeContext from "@effect/platform-node/NodeContext";
import type { SqlClient } from "@effect/sql/SqlClient";
import { layer as sqliteClientLayer } from "@effect/sql-sqlite-node/SqliteClient";
import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { DataReaderLive } from "../layers/DataReaderLive.js";
import { DataStoreLive } from "../layers/DataStoreLive.js";
import migration0001 from "../migrations/0001_initial.js";
import migration0002 from "../migrations/0002_comprehensive.js";
import type { DataReader } from "../services/DataReader.js";
import { DataStore } from "../services/DataStore.js";
import { formatTriageEffect } from "./format-triage.js";

const SqliteLayer = sqliteClientLayer({ filename: ":memory:" });
const PlatformLayer = NodeContext.layer;

const MigratorLayer = SqliteMigrator.layer({
	loader: SqliteMigrator.fromRecord({
		"0001_initial": migration0001,
		"0002_comprehensive": migration0002,
	}),
}).pipe(Layer.provide(Layer.merge(SqliteLayer, PlatformLayer)));

const TestLayer = Layer.mergeAll(
	DataStoreLive.pipe(Layer.provide(SqliteLayer)),
	DataReaderLive.pipe(Layer.provide(SqliteLayer)),
	MigratorLayer,
	SqliteLayer,
	PlatformLayer,
);

const run = <A, E>(effect: Effect.Effect<A, E, DataStore | DataReader | SqlClient>) =>
	Effect.runPromise(Effect.provide(effect, TestLayer));

// Canonical seed data matching DataStore's actual interfaces
const settingsHash = "triage-test-hash";
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
	invocationId: "inv-triage-001",
	project: "my-project",
	subProject: null,
	settingsHash,
	timestamp: "2026-04-30T10:00:00.000Z",
	commitSha: "abc1234",
	branch: "main",
	reason: "failed" as const,
	duration: 2500,
	total: 5,
	passed: 3,
	failed: 2,
	skipped: 0,
	scoped: false,
};

describe("formatTriageEffect", () => {
	it("returns a non-empty markdown string containing the project name", async () => {
		const result = await run(
			Effect.gen(function* () {
				const store = yield* DataStore;
				yield* store.writeSettings(settingsHash, settingsInput, {});
				yield* store.writeRun(runInput);
				return yield* formatTriageEffect();
			}),
		);
		expect(typeof result).toBe("string");
		expect(result.length).toBeGreaterThan(0);
		expect(result).toContain("my-project");
	});

	it("returns a string with no DataStoreError when the database is empty", async () => {
		// formatTriageEffect must have E = never (all errors swallowed)
		const result = await Effect.runPromise(Effect.provide(formatTriageEffect(), TestLayer));
		expect(typeof result).toBe("string");
	});

	it("includes session info when a session exists", async () => {
		const result = await run(
			Effect.gen(function* () {
				const store = yield* DataStore;
				yield* store.writeSession({
					cc_session_id: "cc-test-session-001",
					project: "my-project",
					cwd: "/workspace/my-project",
					agent_kind: "main",
					started_at: "2026-04-30T09:00:00.000Z",
				});
				return yield* formatTriageEffect();
			}),
		);
		expect(typeof result).toBe("string");
		expect(result).toContain("session");
	});

	it("respects maxLines by truncating long sections", async () => {
		const result = await run(
			Effect.gen(function* () {
				const store = yield* DataStore;
				yield* store.writeSettings(settingsHash, settingsInput, {});
				yield* store.writeRun(runInput);
				yield* store.writeRun({
					...runInput,
					invocationId: "inv-triage-002",
					project: "another",
				});
				yield* store.writeRun({
					...runInput,
					invocationId: "inv-triage-003",
					project: "third",
				});
				return yield* formatTriageEffect({ maxLines: 5 });
			}),
		);
		expect(result.split("\n").length).toBeLessThanOrEqual(5);
	});
});
