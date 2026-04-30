import * as NodeContext from "@effect/platform-node/NodeContext";
import { SqlClient } from "@effect/sql/SqlClient";
import { layer as sqliteClientLayer } from "@effect/sql-sqlite-node/SqliteClient";
import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { DataReaderLive } from "../layers/DataReaderLive.js";
import { DataStoreLive } from "../layers/DataStoreLive.js";
import migration0001 from "../migrations/0001_initial.js";
import migration0002 from "../migrations/0002_comprehensive.js";
import migration0003 from "../migrations/0003_idempotent_responses.js";
import type { DataReader } from "../services/DataReader.js";
import { DataStore } from "../services/DataStore.js";
import { formatWrapupEffect } from "./format-wrapup.js";

const SqliteLayer = sqliteClientLayer({ filename: ":memory:" });
const PlatformLayer = NodeContext.layer;

const MigratorLayer = SqliteMigrator.layer({
	loader: SqliteMigrator.fromRecord({
		"0001_initial": migration0001,
		"0002_comprehensive": migration0002,
		"0003_idempotent_responses": migration0003,
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

describe("formatWrapupEffect", () => {
	describe("user_prompt_nudge", () => {
		it("returns empty string when prompt is unrelated to test failure", async () => {
			const result = await run(formatWrapupEffect({ kind: "user_prompt_nudge", userPromptHint: "add a feature" }));
			expect(result).toBe("");
		});

		it("returns the failure-related nudge when prompt mentions test failure", async () => {
			const result = await run(
				formatWrapupEffect({ kind: "user_prompt_nudge", userPromptHint: "fix the broken test in foo.test.ts" }),
			);
			expect(result).toContain("test_history");
			expect(result).toContain("failure_signature_get");
		});

		it("matches 'why is this failing' style prompts", async () => {
			const result = await run(
				formatWrapupEffect({ kind: "user_prompt_nudge", userPromptHint: "Why is this failing in CI?" }),
			);
			expect(result).toContain("vitest-agent-reporter-nudge");
		});
	});

	describe("session_end", () => {
		it("returns empty string for a quiet session (no edits, no hypotheses)", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-empty",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-30T00:00:00Z",
					});
					return yield* formatWrapupEffect({ sessionId, kind: "session_end" });
				}),
			);
			expect(result).toBe("");
		});

		it("nudges for hypothesis recording when recent file_edits exist", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-edits",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-30T00:00:00Z",
					});
					yield* ds.writeTurn({
						session_id: sessionId,
						type: "file_edit",
						payload: JSON.stringify({ type: "file_edit", file_path: "/abs/src/foo.ts", edit_kind: "edit" }),
						occurred_at: "2026-04-30T00:00:01Z",
					});
					return yield* formatWrapupEffect({ sessionId, kind: "session_end" });
				}),
			);
			expect(result).toContain("Session wrap-up");
			expect(result).toMatch(/hypothesis|record/i);
			expect(result).toContain("note_create");
		});

		it("resolves the session via ccSessionId when sessionId is omitted", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-resolve",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-30T00:00:00Z",
					});
					yield* ds.writeTurn({
						session_id: sessionId,
						type: "file_edit",
						payload: JSON.stringify({ type: "file_edit", file_path: "/abs/src/bar.ts", edit_kind: "write" }),
						occurred_at: "2026-04-30T00:00:01Z",
					});
					return yield* formatWrapupEffect({ ccSessionId: "cc-resolve", kind: "session_end" });
				}),
			);
			expect(result).toContain("Session wrap-up");
		});
	});

	describe("stop", () => {
		it("uses 'Before you finish' heading instead of 'Session wrap-up'", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-stop",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-30T00:00:00Z",
					});
					yield* ds.writeTurn({
						session_id: sessionId,
						type: "file_edit",
						payload: JSON.stringify({ type: "file_edit", file_path: "/abs/src/baz.ts", edit_kind: "edit" }),
						occurred_at: "2026-04-30T00:00:01Z",
					});
					return yield* formatWrapupEffect({ sessionId, kind: "stop" });
				}),
			);
			expect(result).toContain("Before you finish");
			expect(result).not.toContain("note_create");
		});
	});

	describe("pre_compact", () => {
		it("includes the 'what matters next' nudge", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-precompact",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "main",
						started_at: "2026-04-30T00:00:00Z",
					});
					yield* ds.writeTurn({
						session_id: sessionId,
						type: "file_edit",
						payload: JSON.stringify({ type: "file_edit", file_path: "/abs/src/qux.ts", edit_kind: "edit" }),
						occurred_at: "2026-04-30T00:00:01Z",
					});
					return yield* formatWrapupEffect({ sessionId, kind: "pre_compact" });
				}),
			);
			expect(result).toContain("matters next");
		});
	});

	describe("tdd_handoff", () => {
		it("emits the structured handoff format for a TDD subagent finish", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sql = yield* SqlClient;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-tdd",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "subagent",
						agent_type: "tdd-orchestrator",
						started_at: "2026-04-30T00:00:00Z",
					});
					yield* sql`
						INSERT INTO tdd_sessions (id, session_id, goal, started_at, ended_at, outcome)
						VALUES (1, ${sessionId}, 'add login validation', '2026-04-30T00:00:00Z', '2026-04-30T00:01:00Z', 'succeeded')
					`;
					return yield* formatWrapupEffect({ sessionId, kind: "tdd_handoff" });
				}),
			);
			expect(result).toContain("tdd-orchestrator");
			expect(result).toContain("add login validation");
			expect(result).toContain("succeeded");
			expect(result).toContain("/tdd resume:1");
		});

		it("returns empty string when no tdd session metadata is recorded (skip injection)", async () => {
			const result = await run(
				Effect.gen(function* () {
					const ds = yield* DataStore;
					const sessionId = yield* ds.writeSession({
						cc_session_id: "cc-tdd-empty",
						project: "p",
						cwd: "/tmp/p",
						agent_kind: "subagent",
						agent_type: "tdd-orchestrator",
						started_at: "2026-04-30T00:00:00Z",
					});
					return yield* formatWrapupEffect({ sessionId, kind: "tdd_handoff" });
				}),
			);
			expect(result).toBe("");
		});
	});
});
