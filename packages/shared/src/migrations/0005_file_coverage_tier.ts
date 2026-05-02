import { SqlClient } from "@effect/sql/SqlClient";
import { Effect } from "effect";

/**
 * Migration 0005: file_coverage.tier
 *
 * Adds a `tier` column to `file_coverage` so the reporter can persist
 * BOTH the build-failing files (below the minimum threshold) AND the
 * warning files (above threshold but below the aspirational target).
 * Without the column, the reporter could only safely write one tier
 * per row, so the CLI's `coverage` command had nothing to surface
 * when thresholds were met but targets were not.
 *
 * Existing rows default to `'below_threshold'` — the only tier that
 * was ever written before this migration.
 *
 * Per Decision D9: ALTER-only, no DROP. Tables count is unchanged.
 */
const migration = Effect.gen(function* () {
	const sql = yield* SqlClient;

	yield* sql`
		ALTER TABLE file_coverage
			ADD COLUMN tier TEXT NOT NULL DEFAULT 'below_threshold'
			CHECK (tier IN ('below_threshold', 'below_target'))
	`;
	yield* sql`CREATE INDEX idx_file_coverage_run_tier ON file_coverage(run_id, tier)`;
});

export default migration;
