import * as NodeContext from "@effect/platform-node/NodeContext";
import { SqlClient } from "@effect/sql/SqlClient";
import { layer as sqliteClientLayer } from "@effect/sql-sqlite-node/SqliteClient";
import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import migration0001 from "./0001_initial.js";
import migration0002 from "./0002_comprehensive.js";
import migration0003 from "./0003_idempotent_responses.js";
import migration0004 from "./0004_test_cases_created_turn_id.js";
import migration0005 from "./0005_failure_signatures_last_seen_at.js";

const SqliteLayer = sqliteClientLayer({ filename: ":memory:" });
const PlatformLayer = NodeContext.layer;

const MigratorLayer = SqliteMigrator.layer({
	loader: SqliteMigrator.fromRecord({
		"0001_initial": migration0001,
		"0002_comprehensive": migration0002,
		"0003_idempotent_responses": migration0003,
		"0004_test_cases_created_turn_id": migration0004,
		"0005_failure_signatures_last_seen_at": migration0005,
	}),
}).pipe(Layer.provide(Layer.merge(SqliteLayer, PlatformLayer)));

const TestLayer = Layer.mergeAll(MigratorLayer, SqliteLayer, PlatformLayer);

const run = <A, E>(effect: Effect.Effect<A, E, SqlClient>) => Effect.runPromise(Effect.provide(effect, TestLayer));

describe("0005_failure_signatures_last_seen_at migration", () => {
	it("should add last_seen_at column to failure_signatures with NULL default", async () => {
		const columns = await run(
			Effect.gen(function* () {
				const sql = yield* SqlClient;
				const rows = yield* sql<{
					name: string;
					type: string;
					notnull: number;
					dflt_value: string | null;
				}>`PRAGMA table_info(failure_signatures)`;
				return rows;
			}),
		);

		const lastSeenAt = columns.find((c) => c.name === "last_seen_at");
		expect(lastSeenAt).toBeDefined();
		expect(lastSeenAt?.type).toBe("TEXT");
		expect(lastSeenAt?.notnull).toBe(0);
		expect(lastSeenAt?.dflt_value).toBeNull();
	});

	it("should create idx_failure_signatures_last_seen index", async () => {
		const indexes = await run(
			Effect.gen(function* () {
				const sql = yield* SqlClient;
				const rows = yield* sql<{ name: string }>`
					SELECT name FROM sqlite_master
					WHERE type = 'index' AND tbl_name = 'failure_signatures'
				`;
				return rows.map((r) => r.name);
			}),
		);

		expect(indexes).toContain("idx_failure_signatures_last_seen");
	});
});
