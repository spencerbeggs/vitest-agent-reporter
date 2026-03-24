import { SqlClient } from "@effect/sql/SqlClient";
import { Effect } from "effect";

const migration = Effect.gen(function* () {
	const sql = yield* SqlClient;

	// Pragmas
	yield* sql`PRAGMA journal_mode=WAL`;
	yield* sql`PRAGMA foreign_keys=ON`;

	// 1. files
	yield* sql`
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE
    )
  `;

	// 2. settings
	yield* sql`
    CREATE TABLE settings (
      hash TEXT PRIMARY KEY,
      vitest_version TEXT NOT NULL,
      pool TEXT,
      environment TEXT,
      test_timeout INTEGER,
      hook_timeout INTEGER,
      slow_test_threshold INTEGER,
      max_concurrency INTEGER,
      max_workers INTEGER,
      isolate INTEGER CHECK (isolate IN (0, 1)),
      bail INTEGER,
      globals INTEGER CHECK (globals IN (0, 1)),
      file_parallelism INTEGER CHECK (file_parallelism IN (0, 1)),
      sequence_seed INTEGER,
      coverage_provider TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;

	// 3. settings_env_vars
	yield* sql`
    CREATE TABLE settings_env_vars (
      settings_hash TEXT NOT NULL REFERENCES settings(hash) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (settings_hash, key)
    )
  `;

	// 4. test_runs
	yield* sql`
    CREATE TABLE test_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invocation_id TEXT NOT NULL,
      project TEXT NOT NULL,
      sub_project TEXT,
      settings_hash TEXT NOT NULL REFERENCES settings(hash),
      timestamp TEXT NOT NULL,
      commit_sha TEXT,
      branch TEXT,
      reason TEXT NOT NULL CHECK (reason IN ('passed', 'failed', 'interrupted')),
      duration INTEGER NOT NULL,
      total INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      skipped INTEGER NOT NULL,
      scoped INTEGER NOT NULL DEFAULT 0 CHECK (scoped IN (0, 1)),
      snapshot_added INTEGER DEFAULT 0,
      snapshot_matched INTEGER DEFAULT 0,
      snapshot_unmatched INTEGER DEFAULT 0,
      snapshot_updated INTEGER DEFAULT 0,
      snapshot_unchecked INTEGER DEFAULT 0,
      snapshot_total INTEGER DEFAULT 0,
      snapshot_failure INTEGER DEFAULT 0 CHECK (snapshot_failure IN (0, 1)),
      snapshot_did_update INTEGER DEFAULT 0 CHECK (snapshot_did_update IN (0, 1)),
      snapshot_files_added INTEGER DEFAULT 0,
      snapshot_files_removed INTEGER DEFAULT 0,
      snapshot_files_unmatched INTEGER DEFAULT 0,
      snapshot_files_updated INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `;
	yield* sql`CREATE INDEX idx_test_runs_project ON test_runs(project, sub_project)`;
	yield* sql`CREATE INDEX idx_test_runs_timestamp ON test_runs(timestamp)`;
	yield* sql`CREATE INDEX idx_test_runs_invocation ON test_runs(invocation_id)`;
	yield* sql`CREATE INDEX idx_test_runs_settings ON test_runs(settings_hash, project)`;

	// 5. scoped_files
	yield* sql`
    CREATE TABLE scoped_files (
      run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      file_id INTEGER NOT NULL REFERENCES files(id),
      PRIMARY KEY (run_id, file_id)
    )
  `;

	// 6. test_modules
	yield* sql`
    CREATE TABLE test_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      file_id INTEGER NOT NULL REFERENCES files(id),
      relative_module_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN (
        'queued', 'pending', 'passed', 'failed', 'skipped'
      )),
      duration INTEGER,
      environment_setup_duration INTEGER,
      prepare_duration INTEGER,
      collect_duration INTEGER,
      setup_duration INTEGER,
      heap INTEGER,
      UNIQUE(run_id, file_id)
    )
  `;
	yield* sql`CREATE INDEX idx_test_modules_run ON test_modules(run_id)`;

	// 7. test_suites
	yield* sql`
    CREATE TABLE test_suites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES test_modules(id) ON DELETE CASCADE,
      parent_suite_id INTEGER REFERENCES test_suites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'passed', 'failed', 'skipped')),
      mode TEXT CHECK (mode IN ('run', 'only', 'skip', 'todo')),
      concurrent INTEGER CHECK (concurrent IN (0, 1)),
      shuffle INTEGER CHECK (shuffle IN (0, 1)),
      retry INTEGER,
      repeats INTEGER,
      location_line INTEGER,
      location_column INTEGER
    )
  `;
	yield* sql`CREATE INDEX idx_test_suites_module ON test_suites(module_id)`;

	// 8. test_cases
	yield* sql`
    CREATE TABLE test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES test_modules(id) ON DELETE CASCADE,
      suite_id INTEGER REFERENCES test_suites(id) ON DELETE CASCADE,
      vitest_id TEXT,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('passed', 'failed', 'skipped', 'pending')),
      classification TEXT CHECK (classification IN (
        'stable', 'new-failure', 'persistent', 'flaky', 'recovered'
      )),
      duration INTEGER,
      start_time INTEGER,
      flaky INTEGER CHECK (flaky IN (0, 1)),
      slow INTEGER CHECK (slow IN (0, 1)),
      retry_count INTEGER DEFAULT 0,
      repeat_count INTEGER DEFAULT 0,
      heap INTEGER,
      mode TEXT CHECK (mode IN ('run', 'only', 'skip', 'todo')),
      each INTEGER CHECK (each IN (0, 1)),
      fails INTEGER CHECK (fails IN (0, 1)),
      concurrent INTEGER CHECK (concurrent IN (0, 1)),
      shuffle INTEGER CHECK (shuffle IN (0, 1)),
      timeout INTEGER,
      skip_note TEXT,
      location_line INTEGER,
      location_column INTEGER
    )
  `;
	yield* sql`CREATE INDEX idx_test_cases_module ON test_cases(module_id)`;
	yield* sql`CREATE INDEX idx_test_cases_suite ON test_cases(suite_id)`;
	yield* sql`CREATE INDEX idx_test_cases_full_name ON test_cases(full_name)`;
	yield* sql`CREATE INDEX idx_test_cases_state ON test_cases(state)`;
	yield* sql`CREATE INDEX idx_test_cases_module_state ON test_cases(module_id, state)`;

	// 9. test_errors
	yield* sql`
    CREATE TABLE test_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      test_case_id INTEGER REFERENCES test_cases(id) ON DELETE CASCADE,
      test_suite_id INTEGER REFERENCES test_suites(id) ON DELETE CASCADE,
      module_id INTEGER REFERENCES test_modules(id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK (scope IN ('test', 'suite', 'module', 'unhandled')),
      name TEXT,
      message TEXT NOT NULL,
      diff TEXT,
      actual TEXT,
      expected TEXT,
      stack TEXT,
      cause_error_id INTEGER REFERENCES test_errors(id),
      ordinal INTEGER NOT NULL DEFAULT 0
    )
  `;
	yield* sql`CREATE INDEX idx_test_errors_run ON test_errors(run_id)`;
	yield* sql`CREATE INDEX idx_test_errors_case ON test_errors(test_case_id)`;
	yield* sql`CREATE INDEX idx_test_errors_name ON test_errors(name)`;
	yield* sql`CREATE INDEX idx_test_errors_scope ON test_errors(run_id, scope)`;

	// 10. stack_frames
	yield* sql`
    CREATE TABLE stack_frames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_id INTEGER NOT NULL REFERENCES test_errors(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      method TEXT,
      file_id INTEGER REFERENCES files(id),
      line INTEGER,
      col INTEGER
    )
  `;
	yield* sql`CREATE INDEX idx_stack_frames_error ON stack_frames(error_id)`;

	// 11. tags
	yield* sql`
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `;

	// 12. test_case_tags
	yield* sql`
    CREATE TABLE test_case_tags (
      test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (test_case_id, tag_id)
    )
  `;

	// 13. test_suite_tags
	yield* sql`
    CREATE TABLE test_suite_tags (
      test_suite_id INTEGER NOT NULL REFERENCES test_suites(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (test_suite_id, tag_id)
    )
  `;

	// 14. test_annotations
	yield* sql`
    CREATE TABLE test_annotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('notice', 'warning', 'error')),
      message TEXT NOT NULL,
      location_file_id INTEGER REFERENCES files(id),
      location_line INTEGER,
      location_column INTEGER,
      attachment_content_type TEXT,
      attachment_path TEXT,
      attachment_body TEXT
    )
  `;
	yield* sql`CREATE INDEX idx_test_annotations_case ON test_annotations(test_case_id)`;
	yield* sql`CREATE INDEX idx_test_annotations_type ON test_annotations(type)`;

	// 15. test_artifacts
	yield* sql`
    CREATE TABLE test_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT,
      location_file_id INTEGER REFERENCES files(id),
      location_line INTEGER,
      location_column INTEGER
    )
  `;
	yield* sql`CREATE INDEX idx_test_artifacts_case ON test_artifacts(test_case_id)`;

	// 16. attachments
	yield* sql`
    CREATE TABLE attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_id INTEGER REFERENCES test_artifacts(id) ON DELETE CASCADE,
      annotation_id INTEGER REFERENCES test_annotations(id) ON DELETE CASCADE,
      content_type TEXT,
      path TEXT,
      body BLOB,
      CHECK ((artifact_id IS NOT NULL) != (annotation_id IS NOT NULL))
    )
  `;

	// 17. import_durations
	yield* sql`
    CREATE TABLE import_durations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES test_modules(id) ON DELETE CASCADE,
      file_id INTEGER NOT NULL REFERENCES files(id),
      self_time REAL NOT NULL,
      total_time REAL NOT NULL,
      external INTEGER CHECK (external IN (0, 1)),
      importer_file_id INTEGER REFERENCES files(id)
    )
  `;
	yield* sql`CREATE INDEX idx_import_durations_module ON import_durations(module_id)`;
	yield* sql`CREATE INDEX idx_import_durations_time ON import_durations(total_time)`;
	yield* sql`CREATE INDEX idx_import_durations_importer ON import_durations(importer_file_id)`;

	// 18. task_metadata
	yield* sql`
    CREATE TABLE task_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER REFERENCES test_cases(id) ON DELETE CASCADE,
      test_suite_id INTEGER REFERENCES test_suites(id) ON DELETE CASCADE,
      module_id INTEGER REFERENCES test_modules(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      CHECK (
        (test_case_id IS NOT NULL) + (test_suite_id IS NOT NULL)
        + (module_id IS NOT NULL) = 1
      )
    )
  `;
	yield* sql`CREATE INDEX idx_task_metadata_key ON task_metadata(key)`;

	// 19. console_logs
	yield* sql`
    CREATE TABLE console_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      test_case_id INTEGER REFERENCES test_cases(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('stdout', 'stderr')),
      timestamp INTEGER NOT NULL,
      origin TEXT
    )
  `;
	yield* sql`CREATE INDEX idx_console_logs_test ON console_logs(test_case_id)`;
	yield* sql`CREATE INDEX idx_console_logs_run ON console_logs(run_id)`;

	// 20. test_history
	yield* sql`
    CREATE TABLE test_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      project TEXT NOT NULL,
      sub_project TEXT,
      full_name TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('passed', 'failed', 'skipped', 'pending')),
      duration INTEGER,
      flaky INTEGER CHECK (flaky IN (0, 1)),
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      UNIQUE(project, sub_project, full_name, timestamp)
    )
  `;
	yield* sql`CREATE INDEX idx_test_history_lookup ON test_history(project, sub_project, full_name)`;
	yield* sql`CREATE INDEX idx_test_history_full_name ON test_history(full_name, timestamp)`;
	yield* sql`CREATE INDEX idx_test_history_run ON test_history(run_id)`;

	// 21. coverage_baselines
	yield* sql`
    CREATE TABLE coverage_baselines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      sub_project TEXT,
      metric TEXT NOT NULL CHECK (metric IN (
        'lines', 'functions', 'branches', 'statements'
      )),
      value REAL NOT NULL,
      pattern TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(project, sub_project, metric, pattern)
    )
  `;

	// 22. coverage_trends
	yield* sql`
    CREATE TABLE coverage_trends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      project TEXT NOT NULL,
      sub_project TEXT,
      timestamp TEXT NOT NULL,
      lines REAL NOT NULL,
      functions REAL NOT NULL,
      branches REAL NOT NULL,
      statements REAL NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN (
        'improving', 'regressing', 'stable'
      )),
      targets_hash TEXT,
      UNIQUE(project, sub_project, timestamp)
    )
  `;
	yield* sql`CREATE INDEX idx_coverage_trends_lookup ON coverage_trends(project, sub_project)`;
	yield* sql`CREATE INDEX idx_coverage_trends_run ON coverage_trends(run_id)`;

	// 23. file_coverage
	yield* sql`
    CREATE TABLE file_coverage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
      file_id INTEGER NOT NULL REFERENCES files(id),
      statements REAL NOT NULL,
      branches REAL NOT NULL,
      functions REAL NOT NULL,
      lines REAL NOT NULL,
      uncovered_lines TEXT
    )
  `;
	yield* sql`CREATE INDEX idx_file_coverage_run ON file_coverage(run_id)`;
	yield* sql`CREATE INDEX idx_file_coverage_file ON file_coverage(file_id)`;

	// 24. source_test_map
	yield* sql`
    CREATE TABLE source_test_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_file_id INTEGER NOT NULL REFERENCES files(id),
      test_module_id INTEGER NOT NULL REFERENCES test_modules(id) ON DELETE CASCADE,
      mapping_type TEXT NOT NULL CHECK (mapping_type IN (
        'convention', 'import_analysis', 'coverage_correlation'
      )),
      UNIQUE(source_file_id, test_module_id, mapping_type)
    )
  `;
	yield* sql`CREATE INDEX idx_source_test_map_source ON source_test_map(source_file_id)`;
	yield* sql`CREATE INDEX idx_source_test_map_module ON source_test_map(test_module_id)`;

	// 25. notes
	yield* sql`
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN (
        'global', 'project', 'module', 'suite', 'test', 'note'
      )),
      project TEXT,
      sub_project TEXT,
      test_full_name TEXT,
      module_path TEXT,
      parent_note_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1))
    )
  `;
	yield* sql`CREATE INDEX idx_notes_scope ON notes(scope)`;
	yield* sql`CREATE INDEX idx_notes_project ON notes(project, sub_project)`;
	yield* sql`CREATE INDEX idx_notes_test ON notes(test_full_name)`;
	yield* sql`CREATE INDEX idx_notes_module ON notes(module_path)`;
	yield* sql`CREATE INDEX idx_notes_parent ON notes(parent_note_id)`;
	yield* sql`CREATE INDEX idx_notes_created_by ON notes(created_by)`;

	// FTS5 virtual table for notes
	yield* sql`
    CREATE VIRTUAL TABLE notes_fts USING fts5(
      title, content,
      content='notes',
      content_rowid='id'
    )
  `;

	// Triggers to keep notes_fts in sync
	yield* sql`
    CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END
  `;
	yield* sql`
    CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
    END
  `;
	yield* sql`
    CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
      INSERT INTO notes_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
    END
  `;
});

export default migration;
