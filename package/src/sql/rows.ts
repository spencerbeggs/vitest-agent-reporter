import { Schema } from "effect";

// Internal row schemas for SQL result sets.
// These map 1:1 to table columns and are used by DataReaderLive
// for typed SQL queries via SqlSchema.findAll and SqlSchema.findOne.
// NOT part of the public API.

export const FileRow = Schema.Struct({
	id: Schema.Number,
	path: Schema.String,
});

export const SettingsRow = Schema.Struct({
	hash: Schema.String,
	vitest_version: Schema.String,
	pool: Schema.NullOr(Schema.String),
	environment: Schema.NullOr(Schema.String),
	test_timeout: Schema.NullOr(Schema.Number),
	hook_timeout: Schema.NullOr(Schema.Number),
	slow_test_threshold: Schema.NullOr(Schema.Number),
	max_concurrency: Schema.NullOr(Schema.Number),
	max_workers: Schema.NullOr(Schema.Number),
	isolate: Schema.NullOr(Schema.Number),
	bail: Schema.NullOr(Schema.Number),
	globals: Schema.NullOr(Schema.Number),
	file_parallelism: Schema.NullOr(Schema.Number),
	sequence_seed: Schema.NullOr(Schema.Number),
	coverage_provider: Schema.NullOr(Schema.String),
	created_at: Schema.String,
});

export const TestRunRow = Schema.Struct({
	id: Schema.Number,
	invocation_id: Schema.String,
	project: Schema.String,
	sub_project: Schema.NullOr(Schema.String),
	settings_hash: Schema.String,
	timestamp: Schema.String,
	commit_sha: Schema.NullOr(Schema.String),
	branch: Schema.NullOr(Schema.String),
	reason: Schema.String,
	duration: Schema.Number,
	total: Schema.Number,
	passed: Schema.Number,
	failed: Schema.Number,
	skipped: Schema.Number,
	scoped: Schema.Number,
	snapshot_added: Schema.Number,
	snapshot_matched: Schema.Number,
	snapshot_unmatched: Schema.Number,
	snapshot_updated: Schema.Number,
	snapshot_unchecked: Schema.Number,
	snapshot_total: Schema.Number,
	snapshot_failure: Schema.Number,
	snapshot_did_update: Schema.Number,
	snapshot_files_added: Schema.Number,
	snapshot_files_removed: Schema.Number,
	snapshot_files_unmatched: Schema.Number,
	snapshot_files_updated: Schema.Number,
	created_at: Schema.String,
});

export const TestModuleRow = Schema.Struct({
	id: Schema.Number,
	run_id: Schema.Number,
	file_id: Schema.Number,
	relative_module_id: Schema.String,
	state: Schema.String,
	duration: Schema.NullOr(Schema.Number),
	environment_setup_duration: Schema.NullOr(Schema.Number),
	prepare_duration: Schema.NullOr(Schema.Number),
	collect_duration: Schema.NullOr(Schema.Number),
	setup_duration: Schema.NullOr(Schema.Number),
	heap: Schema.NullOr(Schema.Number),
});

export const TestSuiteRow = Schema.Struct({
	id: Schema.Number,
	module_id: Schema.Number,
	parent_suite_id: Schema.NullOr(Schema.Number),
	name: Schema.String,
	full_name: Schema.String,
	state: Schema.String,
	mode: Schema.NullOr(Schema.String),
	concurrent: Schema.NullOr(Schema.Number),
	shuffle: Schema.NullOr(Schema.Number),
	retry: Schema.NullOr(Schema.Number),
	repeats: Schema.NullOr(Schema.Number),
	location_line: Schema.NullOr(Schema.Number),
	location_column: Schema.NullOr(Schema.Number),
});

export const TestCaseRow = Schema.Struct({
	id: Schema.Number,
	module_id: Schema.Number,
	suite_id: Schema.NullOr(Schema.Number),
	vitest_id: Schema.NullOr(Schema.String),
	name: Schema.String,
	full_name: Schema.String,
	state: Schema.String,
	classification: Schema.NullOr(Schema.String),
	duration: Schema.NullOr(Schema.Number),
	start_time: Schema.NullOr(Schema.Number),
	flaky: Schema.NullOr(Schema.Number),
	slow: Schema.NullOr(Schema.Number),
	retry_count: Schema.Number,
	repeat_count: Schema.Number,
	heap: Schema.NullOr(Schema.Number),
	mode: Schema.NullOr(Schema.String),
	each: Schema.NullOr(Schema.Number),
	fails: Schema.NullOr(Schema.Number),
	concurrent: Schema.NullOr(Schema.Number),
	shuffle: Schema.NullOr(Schema.Number),
	timeout: Schema.NullOr(Schema.Number),
	skip_note: Schema.NullOr(Schema.String),
	location_line: Schema.NullOr(Schema.Number),
	location_column: Schema.NullOr(Schema.Number),
});

export const TestErrorRow = Schema.Struct({
	id: Schema.Number,
	run_id: Schema.Number,
	test_case_id: Schema.NullOr(Schema.Number),
	test_suite_id: Schema.NullOr(Schema.Number),
	module_id: Schema.NullOr(Schema.Number),
	scope: Schema.String,
	name: Schema.NullOr(Schema.String),
	message: Schema.String,
	diff: Schema.NullOr(Schema.String),
	actual: Schema.NullOr(Schema.String),
	expected: Schema.NullOr(Schema.String),
	stack: Schema.NullOr(Schema.String),
	cause_error_id: Schema.NullOr(Schema.Number),
	ordinal: Schema.Number,
});

export const StackFrameRow = Schema.Struct({
	id: Schema.Number,
	error_id: Schema.Number,
	ordinal: Schema.Number,
	method: Schema.NullOr(Schema.String),
	file_id: Schema.NullOr(Schema.Number),
	line: Schema.NullOr(Schema.Number),
	col: Schema.NullOr(Schema.Number),
});

export const TestHistoryRow = Schema.Struct({
	id: Schema.Number,
	run_id: Schema.Number,
	project: Schema.String,
	sub_project: Schema.NullOr(Schema.String),
	full_name: Schema.String,
	timestamp: Schema.String,
	state: Schema.String,
	duration: Schema.NullOr(Schema.Number),
	flaky: Schema.NullOr(Schema.Number),
	retry_count: Schema.Number,
	error_message: Schema.NullOr(Schema.String),
});

export const CoverageBaselineRow = Schema.Struct({
	id: Schema.Number,
	project: Schema.String,
	sub_project: Schema.NullOr(Schema.String),
	metric: Schema.String,
	value: Schema.Number,
	pattern: Schema.NullOr(Schema.String),
	updated_at: Schema.String,
});

export const CoverageTrendRow = Schema.Struct({
	id: Schema.Number,
	run_id: Schema.Number,
	project: Schema.String,
	sub_project: Schema.NullOr(Schema.String),
	timestamp: Schema.String,
	lines: Schema.Number,
	functions: Schema.Number,
	branches: Schema.Number,
	statements: Schema.Number,
	direction: Schema.String,
	targets_hash: Schema.NullOr(Schema.String),
});

export const FileCoverageRow = Schema.Struct({
	id: Schema.Number,
	run_id: Schema.Number,
	file_id: Schema.Number,
	statements: Schema.Number,
	branches: Schema.Number,
	functions: Schema.Number,
	lines: Schema.Number,
	uncovered_lines: Schema.NullOr(Schema.String),
});

export const NoteRow = Schema.Struct({
	id: Schema.Number,
	title: Schema.String,
	content: Schema.String,
	scope: Schema.String,
	project: Schema.NullOr(Schema.String),
	sub_project: Schema.NullOr(Schema.String),
	test_full_name: Schema.NullOr(Schema.String),
	module_path: Schema.NullOr(Schema.String),
	parent_note_id: Schema.NullOr(Schema.Number),
	created_by: Schema.NullOr(Schema.String),
	created_at: Schema.String,
	updated_at: Schema.String,
	expires_at: Schema.NullOr(Schema.String),
	pinned: Schema.Number,
});

export const SourceTestMapRow = Schema.Struct({
	id: Schema.Number,
	source_file_id: Schema.Number,
	test_module_id: Schema.Number,
	mapping_type: Schema.String,
});
