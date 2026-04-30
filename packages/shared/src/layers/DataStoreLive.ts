import { SqlClient } from "@effect/sql/SqlClient";
import { Effect, Layer } from "effect";
import { DataStoreError, extractSqlReason } from "../errors/DataStoreError.js";
import type { CoverageBaselines } from "../schemas/Baselines.js";
import type { TrendEntry } from "../schemas/Trends.js";
import type {
	FailureSignatureWriteInput,
	FileCoverageInput,
	ModuleInput,
	NoteInput,
	SessionInput,
	SettingsInput,
	SuiteInput,
	TestCaseInput,
	TestErrorInput,
	TestRunInput,
	TurnInput,
} from "../services/DataStore.js";
import { DataStore } from "../services/DataStore.js";

const boolToInt = (v: boolean | undefined): number | null => (v === undefined ? null : v ? 1 : 0);

export const DataStoreLive: Layer.Layer<DataStore, never, SqlClient> = Layer.effect(
	DataStore,
	Effect.gen(function* () {
		const sql = yield* SqlClient;

		// Ensure FK enforcement on every connection (PRAGMA is per-connection, not persistent)
		yield* sql`PRAGMA foreign_keys=ON`.pipe(Effect.catchAll(() => Effect.void));

		const ensureFile = (filePath: string): Effect.Effect<number, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("ensureFile").pipe(Effect.annotateLogs({ filePath }));
				yield* sql`INSERT OR IGNORE INTO files (path) VALUES (${filePath})`;
				const rows = yield* sql<{ id: number }>`SELECT id FROM files WHERE path = ${filePath}`;
				return rows[0].id;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError((e) => new DataStoreError({ operation: "write", table: "files", reason: extractSqlReason(e) })),
			);

		const writeSettings = (
			hash: string,
			settings: SettingsInput,
			envVars: Record<string, string>,
		): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeSettings").pipe(Effect.annotateLogs({ hash }));
				yield* sql`INSERT OR IGNORE INTO settings (hash, vitest_version, pool, environment, test_timeout, hook_timeout, slow_test_threshold, max_concurrency, max_workers, isolate, bail, globals, file_parallelism, sequence_seed, coverage_provider) VALUES (${hash}, ${settings.vitest_version}, ${settings.pool ?? null}, ${settings.environment ?? null}, ${settings.test_timeout ?? null}, ${settings.hook_timeout ?? null}, ${settings.slow_test_threshold ?? null}, ${settings.max_concurrency ?? null}, ${settings.max_workers ?? null}, ${boolToInt(settings.isolate)}, ${settings.bail ?? null}, ${boolToInt(settings.globals)}, ${boolToInt(settings.file_parallelism)}, ${settings.sequence_seed ?? null}, ${settings.coverage_provider ?? null})`;

				for (const [key, value] of Object.entries(envVars)) {
					yield* sql`INSERT OR IGNORE INTO settings_env_vars (settings_hash, key, value) VALUES (${hash}, ${key}, ${value})`;
				}
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "settings", reason: extractSqlReason(e) }),
				),
			);

		const writeRun = (input: TestRunInput): Effect.Effect<number, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeRun").pipe(
					Effect.annotateLogs({ project: input.project, invocationId: input.invocationId }),
				);
				yield* sql`INSERT INTO test_runs (invocation_id, project, sub_project, settings_hash, timestamp, commit_sha, branch, reason, duration, total, passed, failed, skipped, scoped, snapshot_added, snapshot_matched, snapshot_unmatched, snapshot_updated, snapshot_unchecked, snapshot_total, snapshot_failure, snapshot_did_update, snapshot_files_added, snapshot_files_removed, snapshot_files_unmatched, snapshot_files_updated) VALUES (${input.invocationId}, ${input.project}, ${input.subProject}, ${input.settingsHash}, ${input.timestamp}, ${input.commitSha ?? null}, ${input.branch ?? null}, ${input.reason}, ${input.duration}, ${input.total}, ${input.passed}, ${input.failed}, ${input.skipped}, ${input.scoped ? 1 : 0}, ${input.snapshotAdded ?? 0}, ${input.snapshotMatched ?? 0}, ${input.snapshotUnmatched ?? 0}, ${input.snapshotUpdated ?? 0}, ${input.snapshotUnchecked ?? 0}, ${input.snapshotTotal ?? 0}, ${boolToInt(input.snapshotFailure) ?? 0}, ${boolToInt(input.snapshotDidUpdate) ?? 0}, ${input.snapshotFilesAdded ?? 0}, ${input.snapshotFilesRemoved ?? 0}, ${input.snapshotFilesUnmatched ?? 0}, ${input.snapshotFilesUpdated ?? 0})`;
				const rows = yield* sql<{ id: number }>`SELECT last_insert_rowid() as id`;
				return rows[0].id;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "test_runs", reason: extractSqlReason(e) }),
				),
			);

		const writeModules = (
			runId: number,
			modules: ReadonlyArray<ModuleInput>,
		): Effect.Effect<ReadonlyArray<number>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeModules").pipe(Effect.annotateLogs({ runId, count: modules.length }));
				const ids: number[] = [];
				for (const mod of modules) {
					yield* sql`INSERT INTO test_modules (run_id, file_id, relative_module_id, state, duration, environment_setup_duration, prepare_duration, collect_duration, setup_duration, heap) VALUES (${runId}, ${mod.fileId}, ${mod.relativeModuleId}, ${mod.state}, ${mod.duration ?? null}, ${mod.environmentSetupDuration ?? null}, ${mod.prepareDuration ?? null}, ${mod.collectDuration ?? null}, ${mod.setupDuration ?? null}, ${mod.heap ?? null})`;
					const rows = yield* sql<{ id: number }>`SELECT last_insert_rowid() as id`;
					ids.push(rows[0].id);
				}
				return ids;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "test_modules", reason: extractSqlReason(e) }),
				),
			);

		const writeSuites = (
			moduleId: number,
			suites: ReadonlyArray<SuiteInput>,
		): Effect.Effect<ReadonlyArray<number>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeSuites").pipe(Effect.annotateLogs({ moduleId, count: suites.length }));
				const ids: number[] = [];
				for (const suite of suites) {
					yield* sql`INSERT INTO test_suites (module_id, parent_suite_id, name, full_name, state, mode, concurrent, shuffle, retry, repeats, location_line, location_column) VALUES (${moduleId}, ${suite.parentSuiteId ?? null}, ${suite.name}, ${suite.fullName}, ${suite.state}, ${suite.mode ?? null}, ${boolToInt(suite.concurrent)}, ${boolToInt(suite.shuffle)}, ${suite.retry ?? null}, ${suite.repeats ?? null}, ${suite.locationLine ?? null}, ${suite.locationColumn ?? null})`;
					const rows = yield* sql<{ id: number }>`SELECT last_insert_rowid() as id`;
					ids.push(rows[0].id);
				}
				return ids;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "test_suites", reason: extractSqlReason(e) }),
				),
			);

		const writeTestCases = (
			moduleId: number,
			tests: ReadonlyArray<TestCaseInput>,
		): Effect.Effect<ReadonlyArray<number>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeTestCases").pipe(Effect.annotateLogs({ moduleId, count: tests.length }));
				const ids: number[] = [];
				for (const tc of tests) {
					yield* sql`INSERT INTO test_cases (module_id, suite_id, vitest_id, name, full_name, state, classification, duration, start_time, flaky, slow, retry_count, repeat_count, heap, mode, each, fails, concurrent, shuffle, timeout, skip_note, location_line, location_column) VALUES (${moduleId}, ${tc.suiteId ?? null}, ${tc.vitestId ?? null}, ${tc.name}, ${tc.fullName}, ${tc.state}, ${tc.classification ?? null}, ${tc.duration ?? null}, ${tc.startTime ?? null}, ${boolToInt(tc.flaky)}, ${boolToInt(tc.slow)}, ${tc.retryCount ?? 0}, ${tc.repeatCount ?? 0}, ${tc.heap ?? null}, ${tc.mode ?? null}, ${boolToInt(tc.each)}, ${boolToInt(tc.fails)}, ${boolToInt(tc.concurrent)}, ${boolToInt(tc.shuffle)}, ${tc.timeout ?? null}, ${tc.skipNote ?? null}, ${tc.locationLine ?? null}, ${tc.locationColumn ?? null})`;
					const rows = yield* sql<{ id: number }>`SELECT last_insert_rowid() as id`;
					const testCaseId = rows[0].id;
					ids.push(testCaseId);

					// Write tags for this test case
					if (tc.tags && tc.tags.length > 0) {
						for (const tag of tc.tags) {
							yield* sql`INSERT OR IGNORE INTO tags (name) VALUES (${tag})`;
							const tagRows = yield* sql<{ id: number }>`SELECT id FROM tags WHERE name = ${tag}`;
							if (tagRows.length > 0) {
								yield* sql`INSERT OR IGNORE INTO test_case_tags (test_case_id, tag_id) VALUES (${testCaseId}, ${tagRows[0].id})`;
							}
						}
					}
				}
				return ids;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "test_cases", reason: extractSqlReason(e) }),
				),
			);

		const writeErrors = (runId: number, errors: ReadonlyArray<TestErrorInput>): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeErrors").pipe(Effect.annotateLogs({ runId, count: errors.length }));
				for (const err of errors) {
					yield* sql`INSERT INTO test_errors (run_id, test_case_id, test_suite_id, module_id, scope, name, message, diff, actual, expected, stack, cause_error_id, signature_hash, ordinal) VALUES (${runId}, ${err.testCaseId ?? null}, ${err.testSuiteId ?? null}, ${err.moduleId ?? null}, ${err.scope}, ${err.name ?? null}, ${err.message}, ${err.diff ?? null}, ${err.actual ?? null}, ${err.expected ?? null}, ${err.stack ?? null}, ${err.causeErrorId ?? null}, ${err.signatureHash ?? null}, ${err.ordinal ?? 0})`;

					// Persist structured frames. Prefer caller-provided frames (with
					// source-map and function-boundary annotations) over regex parsing.
					if (err.frames && err.frames.length > 0) {
						const errorIdRows = yield* sql<{ id: number }>`SELECT last_insert_rowid() as id`;
						const errorId = errorIdRows[0].id;
						for (const frame of err.frames) {
							const fileId = yield* ensureFile(frame.filePath);
							yield* sql`INSERT INTO stack_frames (error_id, ordinal, method, file_id, line, col, source_mapped_line, function_boundary_line) VALUES (${errorId}, ${frame.ordinal}, ${frame.method}, ${fileId}, ${frame.line}, ${frame.col}, ${frame.sourceMappedLine ?? null}, ${frame.functionBoundaryLine ?? null})`;
						}
					} else if (err.stack) {
						const errorIdRows = yield* sql<{ id: number }>`SELECT last_insert_rowid() as id`;
						const errorId = errorIdRows[0].id;
						const framePattern = /at\s+(?:(.+?)\s+)?\(?(.+?):(\d+):(\d+)\)?/g;
						const frames = [...err.stack.matchAll(framePattern)];
						for (let frameOrdinal = 0; frameOrdinal < frames.length; frameOrdinal++) {
							const m = frames[frameOrdinal];
							const method = m[1] ?? null;
							const filePath = m[2];
							const line = Number.parseInt(m[3], 10);
							const col = Number.parseInt(m[4], 10);
							const fileId = yield* ensureFile(filePath);
							yield* sql`INSERT INTO stack_frames (error_id, ordinal, method, file_id, line, col, source_mapped_line, function_boundary_line) VALUES (${errorId}, ${frameOrdinal}, ${method}, ${fileId}, ${line}, ${col}, NULL, NULL)`;
						}
					}
				}
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "test_errors", reason: extractSqlReason(e) }),
				),
			);

		const writeCoverage = (
			runId: number,
			coverage: ReadonlyArray<FileCoverageInput>,
		): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeCoverage").pipe(Effect.annotateLogs({ runId, count: coverage.length }));
				for (const cov of coverage) {
					yield* sql`INSERT INTO file_coverage (run_id, file_id, statements, branches, functions, lines, uncovered_lines) VALUES (${runId}, ${cov.fileId}, ${cov.statements}, ${cov.branches}, ${cov.functions}, ${cov.lines}, ${cov.uncoveredLines ?? null})`;
				}
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "file_coverage", reason: extractSqlReason(e) }),
				),
			);

		const writeHistory = (
			project: string,
			subProject: string | null,
			fullName: string,
			runId: number,
			timestamp: string,
			state: string,
			duration: number | null,
			flaky: boolean,
			retryCount: number,
			errorMessage: string | null,
		): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeHistory").pipe(Effect.annotateLogs({ project, subProject, runId }));
				yield* sql`INSERT INTO test_history (run_id, project, sub_project, full_name, timestamp, state, duration, flaky, retry_count, error_message) VALUES (${runId}, ${project}, ${subProject}, ${fullName}, ${timestamp}, ${state}, ${duration}, ${flaky ? 1 : 0}, ${retryCount}, ${errorMessage})`;

				// Delete oldest entries beyond 10-entry window per (project, subProject, fullName)
				yield* sql`DELETE FROM test_history WHERE id NOT IN (SELECT id FROM test_history WHERE project = ${project} AND sub_project IS ${subProject} AND full_name = ${fullName} ORDER BY timestamp DESC LIMIT 10) AND project = ${project} AND sub_project IS ${subProject} AND full_name = ${fullName}`;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "test_history", reason: extractSqlReason(e) }),
				),
			);

		const writeBaselines = (baselines: CoverageBaselines): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeBaselines").pipe(Effect.annotateLogs({ updatedAt: baselines.updatedAt }));
				const { updatedAt, global: g, patterns = [] } = baselines;

				// Baselines are stored globally (project='__global__'), not per-project.
				// The coverage_baselines table supports per-project rows but the
				// CoverageBaselines schema is a single global object. Per-project
				// baselines would require a DataStore.writeBaselines signature change.
				const metrics = ["lines", "functions", "branches", "statements"] as const;
				for (const metric of metrics) {
					const value = g[metric];
					if (value !== undefined) {
						yield* sql`INSERT INTO coverage_baselines (project, sub_project, metric, value, pattern, updated_at) VALUES ('__global__', NULL, ${metric}, ${value}, NULL, ${updatedAt}) ON CONFLICT (project, sub_project, metric, pattern) DO UPDATE SET value = ${value}, updated_at = ${updatedAt}`;
					}
				}

				// Upsert pattern metrics
				for (const [pattern, thresholds] of patterns) {
					for (const metric of metrics) {
						const value = thresholds[metric];
						if (value !== undefined) {
							yield* sql`INSERT INTO coverage_baselines (project, sub_project, metric, value, pattern, updated_at) VALUES ('__global__', NULL, ${metric}, ${value}, ${pattern}, ${updatedAt}) ON CONFLICT (project, sub_project, metric, pattern) DO UPDATE SET value = ${value}, updated_at = ${updatedAt}`;
						}
					}
				}
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "coverage_baselines", reason: extractSqlReason(e) }),
				),
			);

		const writeTrends = (
			project: string,
			subProject: string | null,
			runId: number,
			entry: TrendEntry,
		): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeTrends").pipe(Effect.annotateLogs({ project, subProject, runId }));
				yield* sql`INSERT INTO coverage_trends (run_id, project, sub_project, timestamp, lines, functions, branches, statements, direction, targets_hash) VALUES (${runId}, ${project}, ${subProject}, ${entry.timestamp}, ${entry.coverage.lines}, ${entry.coverage.functions}, ${entry.coverage.branches}, ${entry.coverage.statements}, ${entry.direction}, ${entry.targetsHash ?? null})`;

				// Delete oldest entries beyond 50-entry window per (project, subProject)
				yield* sql`DELETE FROM coverage_trends WHERE id NOT IN (SELECT id FROM coverage_trends WHERE project = ${project} AND sub_project IS ${subProject} ORDER BY timestamp DESC LIMIT 50) AND project = ${project} AND sub_project IS ${subProject}`;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "coverage_trends", reason: extractSqlReason(e) }),
				),
			);

		const writeSourceMap = (
			sourceFilePath: string,
			testModuleId: number,
			mappingType: string,
		): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeSourceMap").pipe(
					Effect.annotateLogs({ sourceFilePath, testModuleId, mappingType }),
				);
				const sourceFileId = yield* ensureFile(sourceFilePath);
				yield* sql`INSERT OR IGNORE INTO source_test_map (source_file_id, test_module_id, mapping_type) VALUES (${sourceFileId}, ${testModuleId}, ${mappingType})`;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "source_test_map", reason: extractSqlReason(e) }),
				),
			);

		const writeNote = (note: NoteInput): Effect.Effect<number, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeNote").pipe(
					Effect.annotateLogs({ scope: note.scope, project: note.project ?? null }),
				);
				yield* sql`INSERT INTO notes (title, content, scope, project, sub_project, test_full_name, module_path, parent_note_id, created_by, expires_at, pinned) VALUES (${note.title}, ${note.content}, ${note.scope}, ${note.project ?? null}, ${note.subProject ?? null}, ${note.testFullName ?? null}, ${note.modulePath ?? null}, ${note.parentNoteId ?? null}, ${note.createdBy ?? null}, ${note.expiresAt ?? null}, ${note.pinned ? 1 : 0})`;
				const rows = yield* sql<{ id: number }>`SELECT last_insert_rowid() as id`;
				return rows[0].id;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError((e) => new DataStoreError({ operation: "write", table: "notes", reason: extractSqlReason(e) })),
			);

		const updateNote = (id: number, fields: Partial<NoteInput>): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("updateNote").pipe(Effect.annotateLogs({ id }));
				// Build SET clauses for non-undefined fields
				const setClauses: string[] = [];
				const values: unknown[] = [];

				if (fields.title !== undefined) {
					setClauses.push("title = ?");
					values.push(fields.title);
				}
				if (fields.content !== undefined) {
					setClauses.push("content = ?");
					values.push(fields.content);
				}
				if (fields.scope !== undefined) {
					setClauses.push("scope = ?");
					values.push(fields.scope);
				}
				if (fields.project !== undefined) {
					setClauses.push("project = ?");
					values.push(fields.project);
				}
				if (fields.subProject !== undefined) {
					setClauses.push("sub_project = ?");
					values.push(fields.subProject);
				}
				if (fields.testFullName !== undefined) {
					setClauses.push("test_full_name = ?");
					values.push(fields.testFullName);
				}
				if (fields.modulePath !== undefined) {
					setClauses.push("module_path = ?");
					values.push(fields.modulePath);
				}
				if (fields.parentNoteId !== undefined) {
					setClauses.push("parent_note_id = ?");
					values.push(fields.parentNoteId);
				}
				if (fields.createdBy !== undefined) {
					setClauses.push("created_by = ?");
					values.push(fields.createdBy);
				}
				if (fields.expiresAt !== undefined) {
					setClauses.push("expires_at = ?");
					values.push(fields.expiresAt);
				}
				if (fields.pinned !== undefined) {
					setClauses.push("pinned = ?");
					values.push(fields.pinned ? 1 : 0);
				}

				if (setClauses.length === 0) return;

				// Always update updated_at
				setClauses.push("updated_at = datetime('now')");

				// sql.unsafe is required here because the SET clause is dynamic
				// (only columns with provided values are included). Column names
				// are from source code, not user input, so this is safe.
				yield* sql.unsafe(`UPDATE notes SET ${setClauses.join(", ")} WHERE id = ?`, [...values, id]);
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError((e) => new DataStoreError({ operation: "write", table: "notes", reason: extractSqlReason(e) })),
			);

		const deleteNote = (id: number): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("deleteNote").pipe(Effect.annotateLogs({ id }));
				yield* sql`DELETE FROM notes WHERE id = ${id}`;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError((e) => new DataStoreError({ operation: "write", table: "notes", reason: extractSqlReason(e) })),
			);

		const writeSession = (input: SessionInput): Effect.Effect<number, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeSession").pipe(Effect.annotateLogs({ cc_session_id: input.cc_session_id }));
				yield* sql`INSERT INTO sessions (cc_session_id, project, sub_project, cwd, agent_kind, agent_type, parent_session_id, triage_was_non_empty, started_at) VALUES (${input.cc_session_id}, ${input.project}, ${input.sub_project ?? null}, ${input.cwd}, ${input.agent_kind}, ${input.agent_type ?? null}, ${input.parent_session_id ?? null}, ${boolToInt(input.triage_was_non_empty) ?? 0}, ${input.started_at})`;
				const rows = yield* sql<{ id: number }>`SELECT id FROM sessions WHERE cc_session_id = ${input.cc_session_id}`;
				return rows[0].id;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "sessions", reason: extractSqlReason(e) }),
				),
			);

		const writeTurn = (input: TurnInput): Effect.Effect<number, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeTurn").pipe(
					Effect.annotateLogs({ session_id: input.session_id, turn_no: input.turn_no, type: input.type }),
				);
				yield* sql`INSERT INTO turns (session_id, turn_no, type, payload, occurred_at) VALUES (${input.session_id}, ${input.turn_no}, ${input.type}, ${input.payload}, ${input.occurred_at})`;
				const rows = yield* sql<{
					id: number;
				}>`SELECT id FROM turns WHERE session_id = ${input.session_id} AND turn_no = ${input.turn_no}`;
				return rows[0].id;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError((e) => new DataStoreError({ operation: "write", table: "turns", reason: extractSqlReason(e) })),
			);

		const writeFailureSignature = (input: FailureSignatureWriteInput): Effect.Effect<void, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("writeFailureSignature").pipe(
					Effect.annotateLogs({ signatureHash: input.signatureHash, runId: input.runId }),
				);
				yield* sql`INSERT INTO failure_signatures (signature_hash, first_seen_run_id, first_seen_at, occurrence_count) VALUES (${input.signatureHash}, ${input.runId}, ${input.seenAt}, 1) ON CONFLICT(signature_hash) DO UPDATE SET occurrence_count = occurrence_count + 1`;
			}).pipe(
				Effect.annotateLogs("service", "DataStore"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "write", table: "failure_signatures", reason: extractSqlReason(e) }),
				),
			);

		return {
			ensureFile,
			writeSettings,
			writeRun,
			writeModules,
			writeSuites,
			writeTestCases,
			writeErrors,
			writeCoverage,
			writeHistory,
			writeBaselines,
			writeTrends,
			writeSourceMap,
			writeNote,
			updateNote,
			deleteNote,
			writeSession,
			writeTurn,
			writeFailureSignature,
		};
	}),
);
