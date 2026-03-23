import { SqlClient } from "@effect/sql/SqlClient";
import { Effect, Layer, Option } from "effect";
import { DataStoreError } from "../errors/DataStoreError.js";
import type { AgentReport } from "../schemas/AgentReport.js";
import type { CoverageBaselines } from "../schemas/Baselines.js";
import type { CacheManifest } from "../schemas/CacheManifest.js";
import type { FileCoverageReport } from "../schemas/Coverage.js";
import type { HistoryRecord } from "../schemas/History.js";
import type { TrendRecord } from "../schemas/Trends.js";
import type {
	FlakyTest,
	NoteRow,
	PersistentFailure,
	ProjectRunSummary,
	SettingsRow,
	TestError,
} from "../services/DataReader.js";
import { DataReader } from "../services/DataReader.js";

export const DataReaderLive: Layer.Layer<DataReader, never, SqlClient> = Layer.effect(
	DataReader,
	Effect.gen(function* () {
		const sql = yield* SqlClient;

		const getLatestRun = (
			project: string,
			subProject: string | null,
		): Effect.Effect<Option.Option<AgentReport>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getLatestRun").pipe(Effect.annotateLogs({ project, subProject }));
				// Get the latest run for this project/subProject
				const runs = yield* sql<{
					id: number;
					timestamp: string;
					reason: string;
					duration: number;
					total: number;
					passed: number;
					failed: number;
					skipped: number;
					project: string;
					sub_project: string | null;
				}>`SELECT id, timestamp, reason, duration, total, passed, failed, skipped, project, sub_project
					FROM test_runs
					WHERE project = ${project} AND sub_project IS ${subProject}
					ORDER BY timestamp DESC LIMIT 1`;

				if (runs.length === 0) return Option.none();
				const run = runs[0];

				// Get failed modules with their test cases
				const failedModules = yield* sql<{
					file_path: string;
					module_state: string;
					module_duration: number | null;
					module_id: number;
				}>`SELECT f.path as file_path, tm.state as module_state, tm.duration as module_duration, tm.id as module_id
					FROM test_modules tm
					JOIN files f ON f.id = tm.file_id
					WHERE tm.run_id = ${run.id} AND tm.state = 'failed'`;

				// Bulk-fetch test cases and errors for all failed modules (3 queries instead of O(M×N))
				const moduleIds = failedModules.map((m) => m.module_id);

				const allTestCases =
					moduleIds.length > 0
						? yield* sql<{
								module_id: number;
								test_case_id: number;
								name: string;
								full_name: string;
								state: string;
								duration: number | null;
								flaky: number | null;
								slow: number | null;
								classification: string | null;
							}>`SELECT tc.module_id, tc.id as test_case_id, tc.name, tc.full_name, tc.state, tc.duration, tc.flaky, tc.slow, tc.classification
							FROM test_cases tc WHERE tc.module_id IN ${sql.in(moduleIds)}`
						: [];

				const allErrors =
					moduleIds.length > 0
						? yield* sql<{
								test_case_id: number | null;
								module_id: number | null;
								scope: string;
								message: string;
								stack: string | null;
								diff: string | null;
							}>`SELECT te.test_case_id, te.module_id, te.scope, te.message, te.stack, te.diff
							FROM test_errors te
							WHERE te.run_id = ${run.id}
							  AND te.module_id IN ${sql.in(moduleIds)}`
						: [];

				// Group in TypeScript
				const testsByModule = new Map<number, typeof allTestCases>();
				for (const tc of allTestCases) {
					const arr = testsByModule.get(tc.module_id);
					if (arr) arr.push(tc);
					else testsByModule.set(tc.module_id, [tc]);
				}
				const errorsByTestCase = new Map<number, typeof allErrors>();
				const errorsByModule = new Map<number, typeof allErrors>();
				for (const e of allErrors) {
					if (e.scope === "test" && e.test_case_id != null) {
						const arr = errorsByTestCase.get(e.test_case_id);
						if (arr) arr.push(e);
						else errorsByTestCase.set(e.test_case_id, [e]);
					} else if (e.scope === "module" && e.module_id != null) {
						const arr = errorsByModule.get(e.module_id);
						if (arr) arr.push(e);
						else errorsByModule.set(e.module_id, [e]);
					}
				}

				const failedModuleReports = failedModules.map((mod) => {
					const tests = testsByModule.get(mod.module_id) ?? [];
					const modErrors = errorsByModule.get(mod.module_id) ?? [];

					const testReports = tests.map((tc) => {
						const tcErrors = errorsByTestCase.get(tc.test_case_id) ?? [];
						return {
							name: tc.name,
							fullName: tc.full_name,
							state: tc.state as "passed" | "failed" | "skipped" | "pending",
							...(tc.duration != null ? { duration: tc.duration } : {}),
							...(tc.flaky === 1 ? { flaky: true } : {}),
							...(tc.slow === 1 ? { slow: true } : {}),
							...(tcErrors.length > 0
								? {
										errors: tcErrors.map((e) => ({
											message: e.message,
											...(e.stack != null ? { stack: e.stack } : {}),
											...(e.diff != null ? { diff: e.diff } : {}),
										})),
									}
								: {}),
							...(tc.classification != null
								? {
										classification: tc.classification as
											| "stable"
											| "new-failure"
											| "persistent"
											| "flaky"
											| "recovered",
									}
								: {}),
						};
					});

					return {
						file: mod.file_path,
						state: mod.module_state as "passed" | "failed" | "skipped" | "pending",
						...(mod.module_duration != null ? { duration: mod.module_duration } : {}),
						...(modErrors.length > 0
							? {
									errors: modErrors.map((e) => ({
										message: e.message,
										...(e.stack != null ? { stack: e.stack } : {}),
										...(e.diff != null ? { diff: e.diff } : {}),
									})),
								}
							: {}),
						tests: testReports,
					};
				});

				// Get unhandled errors
				const unhandledErrors = yield* sql<{
					message: string;
					stack: string | null;
					diff: string | null;
				}>`SELECT message, stack, diff FROM test_errors
					WHERE run_id = ${run.id} AND scope = 'unhandled'`;

				// Get failed file paths
				const failedFiles = failedModules.map((m) => m.file_path);

				const projectName = run.sub_project ? `${run.project}:${run.sub_project}` : run.project;

				const report: AgentReport = {
					timestamp: run.timestamp,
					project: projectName,
					reason: run.reason as "passed" | "failed" | "interrupted",
					summary: {
						total: run.total,
						passed: run.passed,
						failed: run.failed,
						skipped: run.skipped,
						duration: run.duration,
					},
					failed: failedModuleReports,
					unhandledErrors: unhandledErrors.map((e) => ({
						message: e.message,
						...(e.stack != null ? { stack: e.stack } : {}),
						...(e.diff != null ? { diff: e.diff } : {}),
					})),
					failedFiles,
				};

				return Option.some(report);
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "test_runs", reason: String(e) })),
			);

		const getRunsByProject = (): Effect.Effect<ReadonlyArray<ProjectRunSummary>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getRunsByProject");
				const rows = yield* sql<{
					project: string;
					sub_project: string | null;
					last_run: string | null;
					last_result: string | null;
					total: number;
					passed: number;
					failed: number;
					skipped: number;
				}>`SELECT
						t1.project,
						t1.sub_project,
						t1.timestamp as last_run,
						t1.reason as last_result,
						t1.total,
						t1.passed,
						t1.failed,
						t1.skipped
					FROM test_runs t1
					INNER JOIN (
						SELECT project, sub_project, MAX(timestamp) as max_ts
						FROM test_runs
						GROUP BY project, sub_project
					) t2 ON t1.project = t2.project
						AND t1.sub_project IS t2.sub_project
						AND t1.timestamp = t2.max_ts`;

				return rows.map((r) => ({
					project: r.project,
					subProject: r.sub_project,
					lastRun: r.last_run,
					lastResult: r.last_result as "passed" | "failed" | "interrupted" | null,
					total: r.total,
					passed: r.passed,
					failed: r.failed,
					skipped: r.skipped,
				}));
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "test_runs", reason: String(e) })),
			);

		const getHistory = (project: string, subProject: string | null): Effect.Effect<HistoryRecord, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getHistory").pipe(Effect.annotateLogs({ project, subProject }));
				const rows = yield* sql<{
					full_name: string;
					timestamp: string;
					state: string;
				}>`SELECT full_name, timestamp, state
					FROM test_history
					WHERE project = ${project} AND sub_project IS ${subProject}
					ORDER BY full_name, timestamp DESC`;

				// Group by full_name
				const testsMap = new Map<string, Array<{ timestamp: string; state: "passed" | "failed" }>>();
				for (const row of rows) {
					// Only include passed/failed states per HistoryRecord schema
					if (row.state !== "passed" && row.state !== "failed") continue;
					const existing = testsMap.get(row.full_name);
					if (existing) {
						existing.push({ timestamp: row.timestamp, state: row.state });
					} else {
						testsMap.set(row.full_name, [{ timestamp: row.timestamp, state: row.state }]);
					}
				}

				const tests = Array.from(testsMap.entries()).map(([fullName, runs]) => ({
					fullName,
					runs,
				}));

				// Use the latest timestamp across all tests, not just the first test
				const latestTimestamp = tests.reduce((latest, t) => {
					const ts = t.runs[0]?.timestamp ?? "";
					return ts > latest ? ts : latest;
				}, "");

				const record: HistoryRecord = {
					project,
					updatedAt: latestTimestamp || new Date().toISOString(),
					tests,
				};

				return record;
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "test_history", reason: String(e) })),
			);

		const getBaselines = (
			project: string,
			subProject: string | null,
		): Effect.Effect<Option.Option<CoverageBaselines>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getBaselines").pipe(Effect.annotateLogs({ project, subProject }));
				// Baselines are stored with project='__global__' currently per DataStoreLive
				const rows = yield* sql<{
					metric: string;
					value: number;
					pattern: string | null;
					updated_at: string;
				}>`SELECT metric, value, pattern, updated_at
					FROM coverage_baselines
					WHERE project = ${project} AND sub_project IS ${subProject}
					ORDER BY pattern, metric`;

				if (rows.length === 0) return Option.none();

				const global: Record<string, number> = {};
				const patternsMap = new Map<string, Record<string, number>>();
				let updatedAt = rows[0].updated_at;

				for (const row of rows) {
					if (row.updated_at > updatedAt) updatedAt = row.updated_at;
					if (row.pattern == null) {
						global[row.metric] = row.value;
					} else {
						const existing = patternsMap.get(row.pattern);
						if (existing) {
							existing[row.metric] = row.value;
						} else {
							patternsMap.set(row.pattern, { [row.metric]: row.value });
						}
					}
				}

				const patterns: Array<[string, Record<string, number>]> = Array.from(patternsMap.entries());

				const baselines: CoverageBaselines = {
					updatedAt,
					global,
					patterns,
				};

				return Option.some(baselines);
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError(
					(e) => new DataStoreError({ operation: "read", table: "coverage_baselines", reason: String(e) }),
				),
			);

		const getTrends = (
			project: string,
			subProject: string | null,
			limit?: number,
		): Effect.Effect<Option.Option<TrendRecord>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getTrends").pipe(Effect.annotateLogs({ project, subProject, limit: limit ?? 50 }));
				const effectiveLimit = limit ?? 50;
				const rows = yield* sql<{
					timestamp: string;
					lines: number;
					functions: number;
					branches: number;
					statements: number;
					direction: string;
					targets_hash: string | null;
				}>`SELECT timestamp, lines, functions, branches, statements, direction, targets_hash
					FROM coverage_trends
					WHERE project = ${project} AND sub_project IS ${subProject}
					ORDER BY timestamp DESC
					LIMIT ${effectiveLimit}`;

				if (rows.length === 0) return Option.none();

				// Compute deltas (rows are newest-first, reverse for chronological order)
				const chronological = [...rows].reverse();
				const entries = chronological.map((row, i) => {
					const prev = i > 0 ? chronological[i - 1] : null;
					return {
						timestamp: row.timestamp,
						coverage: {
							lines: row.lines,
							functions: row.functions,
							branches: row.branches,
							statements: row.statements,
						},
						delta: prev
							? {
									lines: row.lines - prev.lines,
									functions: row.functions - prev.functions,
									branches: row.branches - prev.branches,
									statements: row.statements - prev.statements,
								}
							: { lines: 0, functions: 0, branches: 0, statements: 0 },
						direction: row.direction as "improving" | "regressing" | "stable",
						...(row.targets_hash != null ? { targetsHash: row.targets_hash } : {}),
					};
				});

				const record: TrendRecord = { entries };
				return Option.some(record);
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "coverage_trends", reason: String(e) })),
			);

		const getFlaky = (
			project: string,
			subProject: string | null,
		): Effect.Effect<ReadonlyArray<FlakyTest>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getFlaky").pipe(Effect.annotateLogs({ project, subProject }));
				const rows = yield* sql<{
					full_name: string;
					project: string;
					sub_project: string | null;
					pass_count: number;
					fail_count: number;
					last_state: string;
					last_timestamp: string;
				}>`SELECT
						th1.full_name,
						th1.project,
						th1.sub_project,
						SUM(CASE WHEN th1.state = 'passed' THEN 1 ELSE 0 END) as pass_count,
						SUM(CASE WHEN th1.state = 'failed' THEN 1 ELSE 0 END) as fail_count,
						(SELECT state FROM test_history th2
						 WHERE th2.full_name = th1.full_name
						   AND th2.project = th1.project
						   AND th2.sub_project IS th1.sub_project
						 ORDER BY timestamp DESC LIMIT 1) as last_state,
						MAX(th1.timestamp) as last_timestamp
					FROM test_history th1
					WHERE th1.project = ${project} AND th1.sub_project IS ${subProject}
					GROUP BY th1.full_name, th1.project, th1.sub_project
					HAVING pass_count > 0 AND fail_count > 0`;

				return rows.map((r) => ({
					fullName: r.full_name,
					project: r.project,
					subProject: r.sub_project,
					passCount: r.pass_count,
					failCount: r.fail_count,
					lastState: r.last_state as "passed" | "failed",
					lastTimestamp: r.last_timestamp,
				}));
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "test_history", reason: String(e) })),
			);

		const getPersistentFailures = (
			project: string,
			subProject: string | null,
		): Effect.Effect<ReadonlyArray<PersistentFailure>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getPersistentFailures").pipe(Effect.annotateLogs({ project, subProject }));
				// Single query with window functions to find tests with 2+ consecutive
				// trailing failures (replaces previous N+1 pattern)
				const rows = yield* sql<{
					full_name: string;
					project: string;
					sub_project: string | null;
					consecutive_failures: number;
					first_failed_at: string;
					last_failed_at: string;
					last_error_message: string | null;
				}>`WITH ranked AS (
					SELECT full_name, project, sub_project, state, timestamp, error_message,
						ROW_NUMBER() OVER (
							PARTITION BY project, sub_project, full_name
							ORDER BY timestamp DESC
						) as rn
					FROM test_history
					WHERE project = ${project} AND sub_project IS ${subProject}
				),
				streak AS (
					SELECT full_name, project, sub_project, state, timestamp, error_message, rn,
						MIN(CASE WHEN state != 'failed' THEN rn END) OVER (
							PARTITION BY project, sub_project, full_name
						) as first_pass_rn
					FROM ranked
				)
				SELECT
					full_name, project, sub_project,
					COUNT(*) as consecutive_failures,
					MIN(timestamp) as first_failed_at,
					MAX(timestamp) as last_failed_at,
					(SELECT error_message FROM streak s2
					 WHERE s2.full_name = streak.full_name
					   AND s2.project = streak.project
					   AND s2.sub_project IS streak.sub_project
					   AND s2.rn = 1) as last_error_message
				FROM streak
				WHERE state = 'failed'
					AND (first_pass_rn IS NULL OR rn < first_pass_rn)
				GROUP BY full_name, project, sub_project
				HAVING consecutive_failures >= 2`;

				return rows.map((row) => ({
					fullName: row.full_name,
					project: row.project,
					subProject: row.sub_project,
					consecutiveFailures: row.consecutive_failures,
					firstFailedAt: row.first_failed_at,
					lastFailedAt: row.last_failed_at,
					lastErrorMessage: row.last_error_message,
				}));
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "test_history", reason: String(e) })),
			);

		const getFileCoverage = (runId: number): Effect.Effect<ReadonlyArray<FileCoverageReport>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getFileCoverage").pipe(Effect.annotateLogs({ runId }));
				const rows = yield* sql<{
					file_path: string;
					statements: number;
					branches: number;
					functions: number;
					lines: number;
					uncovered_lines: string | null;
				}>`SELECT f.path as file_path, fc.statements, fc.branches, fc.functions, fc.lines, fc.uncovered_lines
					FROM file_coverage fc
					JOIN files f ON f.id = fc.file_id
					WHERE fc.run_id = ${runId}`;

				return rows.map((r) => ({
					file: r.file_path,
					summary: {
						statements: r.statements,
						branches: r.branches,
						functions: r.functions,
						lines: r.lines,
					},
					uncoveredLines: r.uncovered_lines ?? "",
				}));
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "file_coverage", reason: String(e) })),
			);

		const getTestsForFile = (filePath: string): Effect.Effect<ReadonlyArray<string>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getTestsForFile").pipe(Effect.annotateLogs({ filePath }));
				const rows = yield* sql<{
					path: string;
				}>`SELECT f.path
					FROM source_test_map stm
					JOIN files sf ON sf.id = stm.source_file_id
					JOIN test_modules tm ON tm.id = stm.test_module_id
					JOIN files f ON f.id = tm.file_id
					WHERE sf.path = ${filePath}`;

				return rows.map((r) => r.path);
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "source_test_map", reason: String(e) })),
			);

		const getErrors = (
			project: string,
			subProject: string | null,
			errorName?: string,
		): Effect.Effect<ReadonlyArray<TestError>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getErrors").pipe(
					Effect.annotateLogs({ project, subProject, errorName: errorName ?? null }),
				);
				// Get the latest run for this project
				const runs = yield* sql<{
					id: number;
				}>`SELECT id FROM test_runs
					WHERE project = ${project} AND sub_project IS ${subProject}
					ORDER BY timestamp DESC LIMIT 1`;

				if (runs.length === 0) return [];

				const runId = runs[0].id;

				const baseQuery = errorName
					? sql<{
							name: string | null;
							message: string;
							diff: string | null;
							actual: string | null;
							expected: string | null;
							stack: string | null;
							scope: string;
							test_full_name: string | null;
							module_file: string | null;
						}>`SELECT te.name, te.message, te.diff, te.actual, te.expected, te.stack, te.scope,
							tc.full_name as test_full_name,
							f.path as module_file
						FROM test_errors te
						LEFT JOIN test_cases tc ON tc.id = te.test_case_id
						LEFT JOIN test_modules tm ON tm.id = te.module_id
						LEFT JOIN files f ON f.id = tm.file_id
						WHERE te.run_id = ${runId} AND te.name = ${errorName}`
					: sql<{
							name: string | null;
							message: string;
							diff: string | null;
							actual: string | null;
							expected: string | null;
							stack: string | null;
							scope: string;
							test_full_name: string | null;
							module_file: string | null;
						}>`SELECT te.name, te.message, te.diff, te.actual, te.expected, te.stack, te.scope,
							tc.full_name as test_full_name,
							f.path as module_file
						FROM test_errors te
						LEFT JOIN test_cases tc ON tc.id = te.test_case_id
						LEFT JOIN test_modules tm ON tm.id = te.module_id
						LEFT JOIN files f ON f.id = tm.file_id
						WHERE te.run_id = ${runId}`;

				const rows = yield* baseQuery;

				return rows.map((r) => ({
					name: r.name,
					message: r.message,
					diff: r.diff,
					actual: r.actual,
					expected: r.expected,
					stack: r.stack,
					scope: r.scope as "test" | "suite" | "module" | "unhandled",
					testFullName: r.test_full_name,
					moduleFile: r.module_file,
				}));
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "test_errors", reason: String(e) })),
			);

		const getNotes = (
			scope?: string,
			project?: string,
			testFullName?: string,
		): Effect.Effect<ReadonlyArray<NoteRow>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getNotes").pipe(
					Effect.annotateLogs({ scope: scope ?? null, project: project ?? null }),
				);
				// Build dynamic query based on provided filters
				if (scope && project && testFullName) {
					const rows = yield* sql<NoteDbRow>`SELECT * FROM notes
						WHERE scope = ${scope} AND project = ${project} AND test_full_name = ${testFullName}
						ORDER BY created_at DESC`;
					return rows.map(mapNoteRow);
				}
				if (scope && project) {
					const rows = yield* sql<NoteDbRow>`SELECT * FROM notes
						WHERE scope = ${scope} AND project = ${project}
						ORDER BY created_at DESC`;
					return rows.map(mapNoteRow);
				}
				if (scope) {
					const rows = yield* sql<NoteDbRow>`SELECT * FROM notes
						WHERE scope = ${scope}
						ORDER BY created_at DESC`;
					return rows.map(mapNoteRow);
				}
				if (project) {
					const rows = yield* sql<NoteDbRow>`SELECT * FROM notes
						WHERE project = ${project}
						ORDER BY created_at DESC`;
					return rows.map(mapNoteRow);
				}
				const rows = yield* sql<NoteDbRow>`SELECT * FROM notes ORDER BY created_at DESC`;
				return rows.map(mapNoteRow);
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "notes", reason: String(e) })),
			);

		const getNoteById = (id: number): Effect.Effect<Option.Option<NoteRow>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getNoteById").pipe(Effect.annotateLogs({ id }));
				const rows = yield* sql<NoteDbRow>`SELECT * FROM notes WHERE id = ${id}`;
				if (rows.length === 0) return Option.none();
				return Option.some(mapNoteRow(rows[0]));
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "notes", reason: String(e) })),
			);

		const searchNotes = (query: string): Effect.Effect<ReadonlyArray<NoteRow>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("searchNotes").pipe(Effect.annotateLogs({ query }));
				const rows = yield* sql<NoteDbRow>`SELECT n.*
					FROM notes n
					JOIN notes_fts ON n.id = notes_fts.rowid
					WHERE notes_fts MATCH ${query}
					ORDER BY rank`;
				return rows.map(mapNoteRow);
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "notes", reason: String(e) })),
			);

		const getManifest = (): Effect.Effect<Option.Option<CacheManifest>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getManifest");
				const rows = yield* sql<{
					project: string;
					sub_project: string | null;
					last_run: string | null;
					last_result: string | null;
				}>`SELECT
						t1.project,
						t1.sub_project,
						t1.timestamp as last_run,
						t1.reason as last_result
					FROM test_runs t1
					INNER JOIN (
						SELECT project, sub_project, MAX(timestamp) as max_ts
						FROM test_runs
						GROUP BY project, sub_project
					) t2 ON t1.project = t2.project
						AND t1.sub_project IS t2.sub_project
						AND t1.timestamp = t2.max_ts`;

				if (rows.length === 0) return Option.none();

				const projects = rows.map((r) => {
					const name = r.sub_project ? `${r.project}:${r.sub_project}` : r.project;
					return {
						project: name,
						reportFile: `sql:${name}`,
						historyFile: `sql:${name}`,
						lastRun: r.last_run,
						lastResult: r.last_result as "passed" | "failed" | "interrupted" | null,
					};
				});

				const latestRun = rows.reduce<string | null>((latest, r) => {
					if (!r.last_run) return latest;
					if (!latest) return r.last_run;
					return r.last_run > latest ? r.last_run : latest;
				}, null);

				const manifest: CacheManifest = {
					updatedAt: latestRun ?? new Date().toISOString(),
					cacheDir: "sql:",
					projects,
				};

				return Option.some(manifest);
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "test_runs", reason: String(e) })),
			);

		const getSettings = (hash: string): Effect.Effect<Option.Option<SettingsRow>, DataStoreError> =>
			Effect.gen(function* () {
				yield* Effect.logDebug("getSettings").pipe(Effect.annotateLogs({ hash }));
				const rows = yield* sql<{
					hash: string;
					vitest_version: string;
					pool: string | null;
					environment: string | null;
					coverage_provider: string | null;
					created_at: string;
				}>`SELECT hash, vitest_version, pool, environment, coverage_provider, created_at
					FROM settings WHERE hash = ${hash}`;

				if (rows.length === 0) return Option.none();
				const row = rows[0];

				// Get env vars
				const envRows = yield* sql<{
					key: string;
					value: string;
				}>`SELECT key, value FROM settings_env_vars WHERE settings_hash = ${hash}`;

				const envVars: Record<string, string> = {};
				for (const ev of envRows) {
					envVars[ev.key] = ev.value;
				}

				const settings: SettingsRow = {
					hash: row.hash,
					reporters: null,
					coverageEnabled: row.coverage_provider != null,
					coverageProvider: row.coverage_provider,
					coverageThresholds: null,
					coverageTargets: null,
					pool: row.pool,
					shard: null,
					project: null,
					environment: row.environment,
					envVars,
					capturedAt: row.created_at,
				};

				return Option.some(settings);
			}).pipe(
				Effect.annotateLogs("service", "DataReader"),
				Effect.mapError((e) => new DataStoreError({ operation: "read", table: "settings", reason: String(e) })),
			);

		return {
			getLatestRun,
			getRunsByProject,
			getHistory,
			getBaselines,
			getTrends,
			getFlaky,
			getPersistentFailures,
			getFileCoverage,
			getTestsForFile,
			getErrors,
			getNotes,
			getNoteById,
			searchNotes,
			getManifest,
			getSettings,
		};
	}),
);

// Internal DB row shape for notes table
interface NoteDbRow {
	readonly id: number;
	readonly title: string;
	readonly content: string;
	readonly scope: string;
	readonly project: string | null;
	readonly sub_project: string | null;
	readonly test_full_name: string | null;
	readonly module_path: string | null;
	readonly parent_note_id: number | null;
	readonly created_by: string | null;
	readonly expires_at: string | null;
	readonly pinned: number;
	readonly created_at: string;
	readonly updated_at: string;
}

function mapNoteRow(row: NoteDbRow): NoteRow {
	return {
		id: row.id,
		title: row.title,
		content: row.content,
		scope: row.scope as NoteRow["scope"],
		project: row.project,
		subProject: row.sub_project,
		testFullName: row.test_full_name,
		modulePath: row.module_path,
		parentNoteId: row.parent_note_id,
		createdBy: row.created_by,
		expiresAt: row.expires_at,
		pinned: row.pinned === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
