import { SqlClient } from "@effect/sql/SqlClient";
import { Effect } from "effect";

/**
 * Migration 0003: mcp_idempotent_responses
 *
 * Adds a memoization table for the tRPC idempotency middleware. Mutation
 * tools (e.g. hypothesis_record, hypothesis_validate, future TDD lifecycle
 * tools) compute a stable key from their inputs and look up
 * `(procedure_path, key)` here before executing. On a hit, the cached
 * response is returned with `_idempotentReplay: true`; on a miss, the
 * mutation runs and the result is recorded.
 *
 * Per Decision D9: this migration is purely additive (no DROP). 2.0.x
 * remains ALTER/CREATE-only.
 */
const migration = Effect.gen(function* () {
	const sql = yield* SqlClient;

	yield* sql`
    CREATE TABLE mcp_idempotent_responses (
      procedure_path TEXT NOT NULL,
      key TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (procedure_path, key)
    )
  `;
	yield* sql`CREATE INDEX idx_mcp_idempotent_responses_path ON mcp_idempotent_responses(procedure_path, created_at DESC)`;
});

export default migration;
