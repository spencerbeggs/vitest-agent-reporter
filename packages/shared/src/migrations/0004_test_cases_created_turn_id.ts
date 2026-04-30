import { SqlClient } from "@effect/sql/SqlClient";
import { Effect } from "effect";

/**
 * Migration 0004: test_cases.created_turn_id
 *
 * Adds a nullable `created_turn_id` column to `test_cases`, FK to
 * `turns(id)` ON DELETE SET NULL. Required by D2 binding rule 1
 * ("test was authored in the current phase window AND in the current
 * session"): the TDD phase-transition validator joins through this
 * column to resolve `test_case_created_turn_at` and
 * `test_case_authored_in_session`.
 *
 * Per Decision D9: this migration is purely additive (ALTER only;
 * no DROP). 2.0.x remains ALTER/CREATE-only.
 */
const migration = Effect.gen(function* () {
	const sql = yield* SqlClient;

	yield* sql`
		ALTER TABLE test_cases ADD COLUMN created_turn_id INTEGER REFERENCES turns(id) ON DELETE SET NULL
	`;
	yield* sql`CREATE INDEX idx_test_cases_created_turn ON test_cases(created_turn_id)`;
});

export default migration;
