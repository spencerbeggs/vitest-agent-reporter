import { SqlClient } from "@effect/sql/SqlClient";
import { Effect } from "effect";

/**
 * Migration 0005: failure_signatures.last_seen_at
 *
 * Adds a nullable `last_seen_at` column to `failure_signatures` so the
 * timestamp of the most recent occurrence is tracked alongside
 * `first_seen_at`. Without this column, `occurrence_count` records that
 * a signature has been seen N times but loses *when* the most recent
 * occurrence happened.
 *
 * The new column is nullable for backward compatibility -- existing
 * rows (if any) get NULL until the next occurrence updates them via
 * `writeFailureSignature`'s ON CONFLICT path.
 *
 * A descending index on `last_seen_at` supports queries like
 * "signatures recently active" without a full table scan.
 *
 * Per Decision D9: this migration is purely additive (ALTER only;
 * no DROP). 2.0.x remains ALTER/CREATE-only.
 */
const migration = Effect.gen(function* () {
	const sql = yield* SqlClient;

	yield* sql`ALTER TABLE failure_signatures ADD COLUMN last_seen_at TEXT`;
	yield* sql`CREATE INDEX idx_failure_signatures_last_seen ON failure_signatures(last_seen_at DESC)`;
});

export default migration;
