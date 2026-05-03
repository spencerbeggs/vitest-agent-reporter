---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-04-30
last-synced: 2026-04-30
completeness: 95
related:
  - vitest-agent-reporter/architecture.md
  - vitest-agent-reporter/components.md
dependencies: []
---

# Data Structures & System Layout -- vitest-agent-reporter

File structure, data schemas, SQLite schema, output formats, error handling,
and data flow diagrams.

**Parent document:** [architecture.md](./architecture.md)

---

## File Structure

Source lives in four pnpm workspaces under `packages/` plus the
file-based `plugin/` directory and the `examples/` integration target.
This is a navigation overview only -- per-component descriptions
(interfaces, dependencies, file roles) live in
[components.md](./components.md).

```text
packages/
  shared/    -- vitest-agent-reporter-shared (no internal deps)
    src/
      index.ts
      formatters/  -- types.ts, markdown.ts, gfm.ts, json.ts, silent.ts
      services/    -- DataStore, DataReader, EnvironmentDetector,
                      ExecutorResolver, FormatSelector, DetailResolver,
                      OutputRenderer, ProjectDiscovery, HistoryTracker,
                      Config
      layers/      -- *Live.ts and *Test.ts for each service, plus
                      OutputPipelineLive, LoggerLive, ConfigLive,
                      PathResolutionLive
      errors/      -- DataStoreError, DiscoveryError, PathResolutionError
      schemas/     -- Common, AgentReport, CacheManifest, Coverage,
                      Thresholds, Baselines, Trends, History, Options,
                      Config, turns/ (UserPromptPayload, ToolCallPayload,
                      ToolResultPayload, FileEditPayload, HookFirePayload,
                      NotePayload, HypothesisPayload + TurnPayload union)
      migrations/  -- 0001_initial.ts (1.x 25-table schema),
                      0002_comprehensive.ts (drop-and-recreate
                      with 40 tables + notes_fts, WAL, FKs),
                      0003_idempotent_responses.ts (additive
                      +1 table -> 41 total),
                      0004_test_cases_created_turn_id.ts
                      (additive ALTER on test_cases adding
                      created_turn_id column + index;
                      tables count unchanged at 41),
                      0005_failure_signatures_last_seen_at.ts
                      (additive ALTER on failure_signatures
                      adding last_seen_at column + index;
                      tables count unchanged at 41)
      sql/         -- rows.ts (Schema.Struct row types), assemblers.ts
      utils/       -- compress-lines, safe-filename, ansi, detect-pm,
                      compute-trend, split-project, classify-test,
                      ensure-migrated, format-console, format-gfm,
                      format-fatal-error, build-report,
                      normalize-workspace-key, resolve-workspace-key,
                      resolve-data-path, function-boundary,
                      failure-signature, validate-phase-transition,
                      hyperlink (osc8)
      lib/         -- format-triage, format-wrapup
                      (pure markdown generators feeding both CLI
                      subcommands and MCP tools)
      formatters/  -- types, markdown, gfm, json, silent;
                      ci-annotations (auto-selected when
                      env=ci-github + executor=ci)

  reporter/  -- vitest-agent-reporter (depends on shared)
    src/
      index.ts, reporter.ts, plugin.ts
      services/    -- CoverageAnalyzer (only istanbul-aware service)
      layers/      -- CoverageAnalyzerLive, CoverageAnalyzerTest,
                      ReporterLive(dbPath, logLevel?, logFile?)
      utils/       -- capture-env, capture-settings, resolve-thresholds,
                      strip-console-reporters

  cli/       -- vitest-agent-reporter-cli (bin: vitest-agent-reporter)
    src/
      bin.ts, index.ts
      commands/    -- status, overview, coverage, history, trends,
                      cache (incl. prune), doctor (each
                      --format aware), record (with turn /
                      session-start / session-end /
                      tdd-artifact / run-workspace-changes
                      subcommands), triage, wrapup
      lib/         -- format-* (testable pure formatting logic);
                      record-turn, record-session,
                      record-tdd-artifact,
                      record-run-workspace-changes
      layers/      -- CliLive(dbPath, logLevel?, logFile?)

  mcp/       -- vitest-agent-reporter-mcp (bin: vitest-agent-reporter-mcp)
    src/
      bin.ts, index.ts, context.ts, router.ts, server.ts
      layers/      -- McpLive(dbPath, logLevel?, logFile?)
      middleware/  -- idempotency.ts (idempotentProcedure drop-in
                      for publicProcedure + idempotencyKeys
                      registry)
      tools/       -- 41 tool implementations: help, status,
                      overview, coverage, history, trends,
                      errors, test-for-file, test-get, test-list,
                      file-coverage, run-tests, cache-health,
                      configure, notes, project-list, module-list,
                      suite-list, settings-list, session-list,
                      session-get, turn-search,
                      failure-signature-get, tdd-session-get,
                      hypothesis-list, acceptance-metrics,
                      triage-brief, wrapup-prompt,
                      hypothesis-record, hypothesis-validate,
                      tdd-session-start, tdd-session-end,
                      tdd-session-resume,
                      decompose-goal-into-behaviors,
                      tdd-phase-transition-request,
                      commit-changes

examples/
  basic/     -- minimal example app (5th Vitest project)

plugin/      -- file-based Claude Code plugin (NOT a pnpm workspace)
  .claude-plugin/plugin.json   -- manifest with inline mcpServers config
  bin/mcp-server.mjs           -- zero-deps PM-detect + spawn loader.
                                  Forwards projectDir via
                                  VITEST_AGENT_REPORTER_PROJECT_DIR
  hooks/       -- hooks.json + lib/match-tdd-agent.sh (shared
                  helper sourced by all five orchestrator-scoped
                  hooks; matches `agent_type` against either
                  the agent's `name:` value `"TDD Orchestrator"`
                  or the legacy `"tdd-orchestrator"` slug — see
                  the agent_type clarification in components.md
                  Plugin section for why the slug is also
                  accepted) + session-start.sh (calls triage
                  CLI + writes sessions row) +
                  pre-tool-use-mcp.sh (auto-allows the 41 MCP
                  tools enumerated in lib/safe-mcp-vitest-agent-
                  reporter-ops.txt) + post-test-run.sh +
                  user-prompt-submit-record.sh,
                  pre-tool-use-record.sh, post-tool-use-record.sh,
                  session-end-record.sh, pre-compact-record.sh
                  (drive the `record` CLI subcommand; the
                  session-end, pre-compact, and
                  user-prompt-submit scripts also inject
                  interpretive nudges via the wrapup CLI) +
                  stop-record.sh (Stop hook; records hook_fire
                  turn + injects wrapup nudge) +
                  subagent-start-tdd.sh, subagent-stop-tdd.sh,
                  pre-tool-use-bash-tdd.sh,
                  post-tool-use-tdd-artifact.sh,
                  post-tool-use-test-quality.sh
                  (orchestrator-scoped) +
                  post-tool-use-git-commit.sh (repo-scoped).
                  hooks.json registers SubagentStart and
                  SubagentStop event types
  agents/      -- tdd-orchestrator.md (subagent definition with
                  iron-law system prompt, 8-state machine,
                  ~15-tool tools: array, 9 inline sub-skill
                  primitives)
  skills/      -- tdd, debugging, configuration,
                  coverage-improvement;
                  tdd-primitives/<9 dirs>/SKILL.md
                  (interpret-test-failure,
                  derive-test-name-from-behavior,
                  derive-test-shape-from-name,
                  verify-test-quality, run-and-classify,
                  record-hypothesis-before-fix, commit-cycle,
                  revert-on-extended-red,
                  decompose-goal-into-behaviors -- Decision D6
                  standalone reuse)
  commands/    -- setup.md, configure.md, tdd.md
                  (the /tdd <goal> slash command)
```

---

## Test Files

Test files are co-located with their sources under
`packages/<name>/src/**/*.test.ts`. See
[testing-strategy.md](./testing-strategy.md) for test counts per
project and testing patterns.

---

## Data Path Layout

The SQLite database lives at a deterministic XDG-derived location
keyed by the workspace's identity, not its filesystem path:

```text
$XDG_DATA_HOME/vitest-agent-reporter/<workspaceKey>/data.db
```

On systems without `XDG_DATA_HOME` set, this falls back to:

```text
~/.local/share/vitest-agent-reporter/<workspaceKey>/data.db
```

`<workspaceKey>` is derived from the root `package.json` `name` via
`normalizeWorkspaceKey`. Examples:

| Root `package.json` `name` | `<workspaceKey>` (path segment) |
| --- | --- |
| `my-app` | `my-app` |
| `@org/pkg` | `@org__pkg` |
| `weird name with spaces!` | `weird_name_with_spaces_` |

`AppDirs.ensureData` from `xdg-effect` creates the directory if
missing so better-sqlite3 can open the DB without separately mkdir'ing
the parent.

### Resolution precedence

`resolveDataPath(projectDir, options?)` in
`packages/shared/src/utils/resolve-data-path.ts` consults these
sources in order (highest-precedence first):

1. **`options.cacheDir`** (programmatic override). The plugin's
   `reporter.cacheDir` option flows through here. Returns
   `<cacheDir>/data.db` after `mkdirSync(<cacheDir>, { recursive:
   true })`. Skips the heavy XDG/workspace layer stack
2. **`cacheDir` from `vitest-agent-reporter.config.toml`**. Same
   shape: `<cacheDir>/data.db` after `mkdirSync`
3. **`projectKey` from the same config TOML**. Used as the
   `<workspaceKey>` segment under the XDG data root. Normalized via
   `normalizeWorkspaceKey`
4. **Workspace name from root `package.json`**. Resolved via
   `WorkspaceDiscovery` from `workspaces-effect`, then normalized
5. **Fail with `WorkspaceRootNotFoundError`** if no root workspace is
   discoverable. **No silent fallback to a path hash** -- silent
   fallbacks are the bug class 2.0 leaves behind

### Optional config file: `vitest-agent-reporter.config.toml`

If present, the file is loaded by `ConfigLive(projectDir)` via
`config-file-effect`'s `FirstMatch` strategy with this resolver chain:

1. `WorkspaceRoot` (looks for the file at the pnpm/npm/yarn workspace root)
2. `GitRoot` (looks at the git repo root)
3. `UpwardWalk` (walks upward from `projectDir`)

The first file found wins. Both fields are optional:

```toml
# vitest-agent-reporter.config.toml

# Override the entire data directory. Highest precedence after the
# programmatic `reporter.cacheDir` plugin option.
cacheDir = "/abs/path/to/cache"

# Override just the workspace key segment under the XDG data dir.
# Use this when two unrelated projects on the same machine share a
# package.json `name` (collision case) or when you want a stable
# key independent of `name` changes.
projectKey = "my-app"
```

### `splitProject()` examples (per-Vitest-sub-project keying inside the DB)

The DB itself is one-per-workspace; Vitest sub-projects (the
`projects` array inside `vitest.config.ts`) are differentiated within
that DB via the `(project, subProject)` columns and the
`splitProject()` utility (Decision 23):

- `"my-app:unit"` -> `{ project: "my-app", subProject: "unit" }`
- `"core"` -> `{ project: "core", subProject: null }`
- `""` or `undefined` -> `{ project: "default", subProject: null }`

### Package manager detection

The CLI overview and history commands need to output correct run
commands. Canonical detection logic lives in
`packages/shared/src/utils/detect-pm.ts` (`FileSystemAdapter`
interface for testability). The plugin's `bin/mcp-server.mjs` ships a
zero-deps inline copy with the same detection order:

1. Check `packageManager` field in root `package.json`
2. Fall back to lockfile detection (`pnpm-lock.yaml`, `bun.lock`,
   `bun.lockb`, `yarn.lock`, `package-lock.json`)
3. Default to `npx` (in the shared utility) or `npm` (in the loader)

---

## SQLite Database Schema

The canonical schema with column types, foreign keys, indexes, and the
`notes_fts` triggers lives in
`packages/shared/src/migrations/0002_comprehensive.ts`. The additive
`0003_idempotent_responses.ts` migration adds one new table on top,
`0004_test_cases_created_turn_id.ts` adds a column to `test_cases`,
and `0005_failure_signatures_last_seen_at.ts` adds a `last_seen_at`
column to `failure_signatures` (plus a supporting index). All are
managed via `@effect/sql-sqlite-node` SqliteMigrator with WAL journal
mode and foreign keys enabled. The list below is a navigation aid
only -- do not treat it as a column reference.

**Migration sequence:**
`0001_initial` (1.x 25-table schema) runs first; `0002_comprehensive`
then drops every 1.x table and recreates the layout with 15 additional
tables and column augmentations on `test_errors` and `stack_frames`.
Per Decision D9 this is the **last drop-and-recreate** migration;
subsequent migrations are ALTER-only. `0003_idempotent_responses` is
a single `CREATE TABLE` (no DROP), keeping D9 intact.
`0004_test_cases_created_turn_id` is a single `ALTER TABLE test_cases
ADD COLUMN created_turn_id INTEGER REFERENCES turns(id) ON DELETE SET
NULL` plus a supporting index. Tables count is unchanged at 41. The
new column is required by D2 binding rule 1 (the
`validatePhaseTransition` validator joins through it to resolve
`test_case_created_turn_at` and `test_case_authored_in_session`).
`0005_failure_signatures_last_seen_at` is a single `ALTER TABLE
failure_signatures ADD COLUMN last_seen_at TEXT` (nullable) plus a
supporting `idx_failure_signatures_last_seen ON
failure_signatures(last_seen_at DESC)` index. The new column
completes recurrence tracking: `DataStore.writeFailureSignature` sets
`last_seen_at = firstSeenAt` on insert and bumps it via
`ON CONFLICT(signature_hash) DO UPDATE` on recurrence alongside
`occurrence_count`, so consumers can sort/filter by recency. Tables
count unchanged at 41. D9 stays intact.

**Key relationships:** `test_runs` is the spine; each run owns one or
more `test_modules`, which own `test_suites` and `test_cases`. Errors
attach to runs/cases via `test_errors` with parsed `stack_frames`.
The `files` table is the shared FK target for any path-like column
(test modules, source maps, coverage rows, file edits, run-changed
files). `notes_fts` is an FTS5 virtual table over `notes` kept in
sync via insert/update/delete triggers (see "FTS5 trigger pattern"
below).

**41 tables:**

| # | Table | Purpose |
| - | ----- | ------- |
| 1 | `files` | Deduplicated file paths (shared FK target) |
| 2 | `settings` | Vitest config snapshots, keyed by hash |
| 3 | `settings_env_vars` | Environment variables per settings snapshot |
| 4 | `test_runs` | Per-project test run records with summary stats |
| 5 | `scoped_files` | Files included in scoped test runs |
| 6 | `test_modules` | Test modules (files) per run |
| 7 | `test_suites` | Test suites (describe blocks) per module |
| 8 | `test_cases` | Individual test cases per module; includes `created_turn_id REFERENCES turns(id) ON DELETE SET NULL` + index (used by D2 binding rule 1) |
| 9 | `test_errors` | Errors with diffs, expected/actual, stacks; includes `signature_hash` FK to `failure_signatures` |
| 10 | `stack_frames` | Parsed stack frames per error; includes `source_mapped_line` and `function_boundary_line` columns |
| 11 | `tags` | Deduplicated tag names |
| 12 | `test_case_tags` | Tag associations for test cases |
| 13 | `test_suite_tags` | Tag associations for test suites |
| 14 | `test_annotations` | Test annotations (notice/warning/error) |
| 15 | `test_artifacts` | Test artifacts |
| 16 | `attachments` | Binary attachments for artifacts/annotations |
| 17 | `import_durations` | Module import timing data |
| 18 | `task_metadata` | Key-value metadata for tasks |
| 19 | `console_logs` | Console output (stdout/stderr) per test |
| 20 | `test_history` | Per-test run history (sliding window) |
| 21 | `coverage_baselines` | Auto-ratcheting coverage high-water marks |
| 22 | `coverage_trends` | Per-project coverage trend entries |
| 23 | `file_coverage` | Per-file coverage data per run |
| 24 | `source_test_map` | Source file to test module mapping |
| 25 | `notes` | Scoped notes with threading and expiration |
| 26 | `sessions` | Claude Code conversations (`cc_session_id` unique, `agent_kind`, `parent_session_id` self-FK, `triage_was_non_empty`) |
| 27 | `turns` | Per-session turn log; `type` CHECK in `(user_prompt, tool_call, tool_result, file_edit, hook_fire, note, hypothesis)`; `payload` is JSON-stringified `TurnPayload` |
| 28 | `tool_invocations` | Per-turn tool call detail (tool_name, params_hash, duration_ms, success). Populated by `DataStore.writeTurn` for `tool_result` payloads -- one row per turn in the same SQL transaction as the `turns` insert. **Caveats:** (a) `params_hash` is intentionally NULL pending future cross-reference of the matching `tool_call` turn's `tool_input`; (b) rows derive from `tool_result` payloads only (`tool_call` payloads write to `turns` only and do **not** produce a `tool_invocations` row); consumers wanting strict request/response pairing should pair via `payload.tool_use_id`. `tool_invocations` is a flattened projection over the result side |
| 29 | `file_edits` | Per-turn file edits (write/edit/multi_edit, lines added/removed, diff). Populated by `DataStore.writeTurn` for `file_edit` payloads -- one row per turn in the same SQL transaction. `file_id` is resolved via `ensureFile(file_path)`; `edit_kind`, `lines_added`, `lines_removed`, and `diff` are carried verbatim from the payload. 1:1 with `file_edit` turns |
| 30 | `hypotheses` | Agent hypotheses with `cited_test_error_id`/`cited_stack_frame_id` evidence FKs and `validation_outcome` (`confirmed`/`refuted`/`abandoned` or NULL) |
| 31 | `commits` | Git commit metadata (sha, parent_sha, message, author, branch) |
| 32 | `run_changed_files` | Files changed for a given run (`added`/`modified`/`deleted`/`renamed`/`untracked-modified`). `run_id` is `NOT NULL`; the `record run-workspace-changes` CLI auto-resolves the latest run id when callers omit it |
| 33 | `run_triggers` | 1:1 with `test_runs`; `trigger` CHECK in `(cli, ide, ci, agent, pre-commit, watch)`; `agent_session_id` FK to `sessions` |
| 34 | `build_artifacts` | Captured tsc/biome/eslint output (tool_kind, exit_code, output, duration_ms) |
| 35 | `tdd_sessions` | TDD session goal + outcome (`succeeded`/`blocked`/`abandoned`). FK to `sessions(id)` is named `session_id` (NOT `agent_session_id`); `parent_tdd_session_id` self-FK; `summary_note_id` FK |
| 36 | `tdd_session_behaviors` | Ordered behaviors per TDD session. Live columns: `parent_tdd_session_id` FK, `ordinal` (1-based ordering position, NOT `position`), `behavior` (the behavior text, NOT `name`), `suggested_test_name` (NOT `description`), `depends_on_behavior_ids` (nullable text), `status` (`pending`/`in_progress`/`done`/`abandoned`), `child_tdd_session_id` for delegation |
| 37 | `tdd_phases` | TDD phase transitions; 8-value `phase` CHECK (`spike`, `red`, `red.triangulate`, `green`, `green.fake-it`, `refactor`, `extended-red`, `green-without-red`); `parent_phase_id` self-FK |
| 38 | `tdd_artifacts` | Evidence artifacts per phase; `artifact_kind` CHECK in `(test_written, test_failed_run, code_written, test_passed_run, refactor, test_weakened)`; `test_first_failure_run_id` for D2 binding rule 3. FK to `tdd_phases(id)` is named `phase_id` (NOT `tdd_phase_id`) |
| 39 | `failure_signatures` | `signature_hash` PK (16-char sha256 from `computeFailureSignature`); `first_seen_run_id`, `first_seen_at`, `occurrence_count`, `last_seen_at` (nullable). On insert, `writeFailureSignature` sets `last_seen_at = first_seen_at` and `occurrence_count = 1`. On recurrence, the `ON CONFLICT(signature_hash) DO UPDATE` clause increments `occurrence_count` AND refreshes `last_seen_at` |
| 40 | `hook_executions` | Vitest hook lifecycle; `hook_kind` CHECK in `(beforeAll, beforeEach, afterEach, afterAll)`; CHECK constraint ensures at most one of test_module_id / test_suite_id / test_case_id is set |
| 41 | `mcp_idempotent_responses` | Cached MCP mutation results keyed by `(procedure_path, key)` composite PK. Carries `result_json` and `created_at`. Index on `(procedure_path, created_at DESC)` for future TTL pruning. Backed by `DataStore.recordIdempotentResponse` (`INSERT ... ON CONFLICT DO NOTHING`) and `DataReader.findIdempotentResponse`. Powers the tRPC idempotency middleware -- duplicate calls replay the cached response with `_idempotentReplay: true` |

**Plus:** `notes_fts` FTS5 virtual table with sync triggers for
full-text search across note content.

**FTS5 trigger pattern:** `notes_ai` (AFTER INSERT) and
`notes_ad` (AFTER DELETE) are unchanged. The UPDATE pair uses
`notes_bu` (**BEFORE UPDATE**, captures `OLD.id`/`OLD.content` for
the FTS delete) plus `notes_au` (AFTER UPDATE, inserts NEW values).
Using AFTER UPDATE for both delete and insert steps would read the
already-updated row and accumulate stale tokens in the FTS5 index.

For the full DDL, see
`packages/shared/src/migrations/0002_comprehensive.ts`,
`packages/shared/src/migrations/0003_idempotent_responses.ts`,
`packages/shared/src/migrations/0004_test_cases_created_turn_id.ts`,
and `packages/shared/src/migrations/0005_failure_signatures_last_seen_at.ts`.

---

## Data Structures

All types are defined as Effect Schema definitions in `packages/shared/src/schemas/`
with TypeScript types derived via `typeof Schema.Type`.

### JSON Report (`AgentReport`)

```typescript
interface AgentReport {
  timestamp: string;                              // ISO 8601
  project?: string;                               // project name (monorepo)
  reason: "passed" | "failed" | "interrupted";
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;                             // ms wall-clock
  };
  failed: ModuleReport[];                         // only modules with failures
  unhandledErrors: ReportError[];
  failedFiles: string[];                          // quick index of rel paths
  coverage?: CoverageReport;                      // present when coverage enabled
}

interface ModuleReport {
  file: string;                                   // project-relative path
  state: "passed" | "failed" | "skipped" | "pending";
  duration?: number;
  errors?: ReportError[];                         // module-level errors
  tests: TestReport[];
}

interface TestReport {
  name: string;
  fullName: string;                               // "Suite > nested > test"
  state: "passed" | "failed" | "skipped" | "pending";
  duration?: number;
  flaky?: boolean;                                // passed after retry
  slow?: boolean;                                 // above slowTestThreshold
  errors?: ReportError[];
  classification?: TestClassification;
}

type TestClassification =
  | "stable"
  | "new-failure"
  | "persistent"
  | "flaky"
  | "recovered";

interface ReportError {
  message: string;
  stack?: string;
  diff?: string;
}
```

### Coverage Report

```typescript
interface CoverageReport {
  totals: CoverageTotals;
  thresholds: {
    global: MetricThresholds;
    patterns?: PatternThresholds[];
  };
  targets?: {
    global: MetricThresholds;
    patterns?: PatternThresholds[];
  };
  baselines?: {
    global: MetricThresholds;
    patterns?: PatternThresholds[];
  };
  scoped?: boolean;
  scopedFiles?: string[];
  lowCoverage: FileCoverageReport[];
  lowCoverageFiles: string[];
}

interface CoverageTotals {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

interface MetricThresholds {
  lines?: number;
  functions?: number;
  branches?: number;
  statements?: number;
}

type PatternThresholds = [string, MetricThresholds];

interface FileCoverageReport {
  file: string;
  summary: CoverageTotals;
  uncoveredLines: string;                         // e.g. "42-50,99,120-135"
}
```

### Coverage Thresholds (`ResolvedThresholds`)

```typescript
interface ResolvedThresholds {
  global: MetricThresholds;
  perFile?: boolean;
  patterns?: PatternThresholds[];
}
```

### Coverage Baselines (`CoverageBaselines`)

```typescript
interface CoverageBaselines {
  updatedAt: string;                              // ISO 8601
  global: MetricThresholds;
  patterns?: PatternThresholds[];
}
```

### Coverage Trends (`TrendRecord`)

```typescript
interface TrendEntry {
  timestamp: string;
  coverage: CoverageTotals;
  delta: CoverageTotals;
  direction: "improving" | "regressing" | "stable";
  targetsHash?: string;
}

interface TrendRecord {
  entries: TrendEntry[];                          // sliding window, max 50
}
```

### Cache Manifest

```typescript
interface CacheManifest {
  updatedAt: string;
  cacheDir: string;
  projects: CacheManifestEntry[];
}

interface CacheManifestEntry {
  project: string;
  reportFile: string;
  historyFile?: string;
  lastRun: string | null;
  lastResult: "passed" | "failed" | "interrupted" | null;
}
```

**Note:** The manifest is now assembled on-the-fly by
`DataReader.getManifest()` from the `test_runs` table rather than being
stored as a separate file.

### Failure History (`HistoryRecord`)

```typescript
interface TestRun {
  timestamp: string;
  state: "passed" | "failed" | "skipped" | "pending";
}

interface TestHistory {
  runs: TestRun[];                                // sliding window, max 10
}

type HistoryRecord = Record<string, TestHistory>; // keyed by test fullName
```

### Service Input/Output Types

Input and output types (`TestRunInput`, `ModuleInput`, `TestCaseInput`,
`ProjectIdentity`, `ProjectRunSummary`, `FlakyTest`, `PersistentFailure`,
`TestListEntry`, `ModuleListEntry`, `SuiteListEntry`, `SettingsListEntry`,
`NoteRow`, `SettingsRow`, `TestError`) live in
`packages/shared/src/services/DataStore.ts` and
`packages/shared/src/services/DataReader.ts`. Also in DataStore:
`SessionInput`, `TurnInput`, `StackFrameInput`, `FailureSignatureWriteInput`,
optional `signatureHash` and `frames` fields on `TestErrorInput`
(with `TurnInput.turnNo` auto-assigned when omitted),
`IdempotentResponseInput`, `HypothesisInput`, `ValidateHypothesisInput`,
`TddSessionInput`, `EndTddSessionInput`, `TddBehaviorInput`,
`WriteTddBehaviorsInput`, `TddBehaviorOutput`, `WriteTddPhaseInput`,
`WriteTddPhaseOutput`, `WriteTddArtifactInput`, `WriteCommitInput`,
`RunChangedFile`, `WriteRunChangedFilesInput`, plus re-exported literal
types `Phase`, `ArtifactKind`, and `ChangeKind` so callers don't dip
into `schemas/` directly.

Also in DataReader: `SessionDetail`, `TurnSummary`, `TurnSearchOptions`,
`AcceptanceMetrics`, `SessionSummary`, `FailureSignatureDetail`,
`TddSessionDetail`, `TddPhaseDetail`, `TddArtifactDetail`,
`HypothesisSummary`, `HypothesisDetail`, `ListSessionsOptions`,
`ListHypothesesOptions`, `CurrentTddPhase`, `CitedArtifactRow`,
`CommitChangesEntry`, `TddSessionSummary`.

The Common schema literals (`Environment`, `Executor`, `OutputFormat`,
`DetailLevel`) live in `packages/shared/src/schemas/Common.ts`.
`OutputFormat` has 5 values including `"ci-annotations"` for the
GitHub Actions formatter. Effect Schema is the source of truth --
TypeScript types derive via `typeof Schema.Type`.

**Naming note:** there are two `FailureSignature*Input` types
that look similar but live in different layers and serve different
purposes:

- `FailureSignatureInput` (in
  `packages/shared/src/utils/failure-signature.ts`) is the
  **compute-time** input to `computeFailureSignature` -- the
  un-hashed `error_name`, `assertion_message`,
  `top_frame_function_name`, `top_frame_function_boundary_line`,
  and optional `top_frame_raw_line` that get hashed *into* the
  signature
- `FailureSignatureWriteInput` (in
  `packages/shared/src/services/DataStore.ts`) is the
  **persistence-time** input to `DataStore.writeFailureSignature`
  -- the already-computed `signatureHash` plus the metadata to
  store alongside it (`firstSeenRunId`, `firstSeenAt`)

The `*WriteInput` suffix mirrors the naming convention used for
the other DataStore inputs (`TestRunInput`, `ModuleInput`,
`TestCaseInput`, etc.) and disambiguates the two "FailureSignature"
inputs cleanly without overloading either name.

The MCP server's tRPC `McpContext` (carrying a `ManagedRuntime` over
`DataReader | DataStore | ProjectDiscovery | OutputRenderer`) is
defined in `packages/mcp/src/context.ts`. Formatter types
(`Formatter`, `FormatterContext`, `RenderedOutput`) live in
`packages/shared/src/formatters/types.ts`.

### Turn Payload Schemas

`packages/shared/src/schemas/turns/` defines a discriminated
`TurnPayload` union over seven `Schema.Struct` payload types, each
keyed by a `type` literal that mirrors the `turns.type` CHECK
constraint. The union is the source of truth the `record` CLI uses
to validate the JSON-stringified payload before `DataStore.writeTurn`
persists it.

```typescript
// UserPromptPayload
{ type: "user_prompt", prompt: string, cc_message_id?: string }

// ToolCallPayload
{ type: "tool_call", tool_name: string, tool_input: unknown,
  tool_use_id?: string }

// ToolResultPayload
{ type: "tool_result", tool_name: string, tool_use_id?: string,
  result_summary?: string, success: boolean, duration_ms?: number }

// FileEditPayload
{ type: "file_edit", file_path: string,
  edit_kind: "write" | "edit" | "multi_edit",
  lines_added?: number, lines_removed?: number, diff?: string }

// HookFirePayload
{ type: "hook_fire",
  hook_kind: "SessionStart" | "SessionEnd" | "Stop" | "StopFailure"
           | "SubagentStart" | "SubagentStop" | "PreCompact"
           | "PostCompact" | "PreToolUse" | "PostToolUse"
           | "PostToolUseFailure" | "UserPromptSubmit" | "FileChanged",
  cc_session_id?: string,
  previous_record_failures?: ReadonlyArray<string> }

// NotePayload
{ type: "note", scope: string, title?: string, content: string }

// HypothesisPayload
{ type: "hypothesis", content: string,
  cited_test_error_id?: number, cited_stack_frame_id?: number }

// TurnPayload
type TurnPayload =
  | UserPromptPayload | ToolCallPayload | ToolResultPayload
  | FileEditPayload | HookFirePayload | NotePayload | HypothesisPayload;
```

### Phase Transition Validation Types

`packages/shared/src/utils/validate-phase-transition.ts` exports the
TDD evidence-binding contract:

```typescript
type Phase =
  | "spike" | "red" | "red.triangulate" | "green" | "green.fake-it"
  | "refactor" | "extended-red" | "green-without-red";

type ArtifactKind =
  | "test_written" | "test_failed_run" | "code_written"
  | "test_passed_run" | "refactor" | "test_weakened";

interface CitedArtifact {
  id: number;
  artifact_kind: ArtifactKind;
  test_case_id: number | null;
  test_case_created_turn_at: string | null;
  test_case_authored_in_session: boolean;
  test_run_id: number | null;
  test_first_failure_run_id: number | null;
  behavior_id: number | null;
}

type DenialReason =
  | "missing_artifact_evidence" | "wrong_source_phase"
  | "unknown_session" | "session_already_ended" | "goal_not_started"
  | "refactor_without_passing_run" | "evidence_not_in_phase_window"
  | "evidence_not_for_behavior"
  | "evidence_test_was_already_failing";

type PhaseTransitionResult =
  | { accepted: true; phase: Phase }
  | { accepted: false; phase: Phase; denialReason: DenialReason;
      remediation: { suggestedTool: string;
                     suggestedArgs: Record<string, unknown>;
                     humanHint: string } };
```

### Failure Signature Input

`packages/shared/src/utils/failure-signature.ts`:

```typescript
interface FailureSignatureInput {
  error_name: string;
  assertion_message: string;
  top_frame_function_name: string;
  top_frame_function_boundary_line: number | null;
  top_frame_raw_line?: number;
}

// computeFailureSignature -> 16-char sha256 hex
// Hashes: "<error_name>|<normalized shape>|<fn name>|<line coord>"
//   line coord: "fb:<boundary>" if known,
//               else "raw:<floor(line/10)*10>" 10-line bucket,
//               else "raw:?"
```

### DataStore Input Types

`packages/shared/src/services/DataStore.ts`:

```typescript
interface StackFrameInput {
  function_name: string;
  file_path: string;
  raw_line: number;
  raw_column?: number;
  source_mapped_line?: number;
  function_boundary_line?: number;
}

interface FailureSignatureWriteInput {
  signatureHash: string;       // 16-char sha256 from
                               // computeFailureSignature
  firstSeenRunId: number;
  firstSeenAt: string;         // ISO 8601
}

// TestErrorInput (extended fields)
interface TestErrorInput {
  // ...existing fields...
  signatureHash?: string;      // FK target on test_errors
  frames?: ReadonlyArray<StackFrameInput>; // per-frame rows
}

// TurnInput (extended fields)
interface TurnInput {
  sessionId: number;
  type: TurnType;
  payload: string;             // pre-stringified TurnPayload JSON
  turnNo?: number;             // optional; auto-assigned via
                               // MAX(turn_no)+1 per session if
                               // omitted
  // ...existing fields...
}
```

### DataReader Output Types

`packages/shared/src/services/DataReader.ts`:

```typescript
interface SessionSummary {
  id: number;
  cc_session_id: string;
  agent_kind: "main" | "subagent";
  parent_session_id: number | null;
  project: string;
  sub_project: string | null;
  cwd: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
}

interface ListSessionsOptions {
  project?: string;
  agentKind?: "main" | "subagent";
  limit?: number;              // default 50
}

// `last_seen_at` is nullable (no backfill for rows written before the
// column was added). Recurrences bump `occurrence_count` AND refresh
// `last_seen_at` via the ON CONFLICT clause in `writeFailureSignature`.
interface FailureSignatureDetail {
  signature_hash: string;
  first_seen_run_id: number;
  first_seen_at: string;
  occurrence_count: number;
  lastSeenAt: string | null;
  recent_errors: ReadonlyArray<TestError>; // up to 10 most recent
}

interface TddSessionDetail {
  // tdd_sessions row...
  phases: ReadonlyArray<TddPhaseDetail>;
}

interface TddPhaseDetail {
  // tdd_phases row...
  artifacts: ReadonlyArray<TddArtifactDetail>;
}

interface TddArtifactDetail {
  // tdd_artifacts row, with the FK columns flattened
}

interface HypothesisSummary {
  id: number;
  session_id: number;
  content: string;
  cited_test_error_id: number | null;
  cited_stack_frame_id: number | null;
  validation_outcome: "confirmed" | "refuted" | "abandoned" | null;
  created_at: string;
}

interface HypothesisDetail extends HypothesisSummary {
  // resolves the cited references for display
  cited_test_error?: TestError;
}

interface ListHypothesesOptions {
  sessionId?: number;
  outcome?: "confirmed" | "refuted" | "abandoned" | "open";
                               // "open" matches IS NULL
  limit?: number;              // default 50
}
```

### Reporter Failure-Processing Output

`packages/reporter/src/utils/process-failure.ts`:

```typescript
interface ProcessFailureResult {
  frames: ReadonlyArray<StackFrameInput>;
  signatureHash: string;
}

// processFailure(error, options) -> Promise<ProcessFailureResult>
// Walks Vitest stack frames, source-maps the top non-framework
// frame, runs findFunctionBoundary on the resolved source, calls
// computeFailureSignature with the parsed pieces.
```

### Idempotency and Hypothesis Input Types

`packages/shared/src/services/DataStore.ts`:

```typescript
// Backs DataStore.recordIdempotentResponse and the tRPC
// idempotency middleware. Persisted to mcp_idempotent_responses
// via INSERT ... ON CONFLICT DO NOTHING on the (procedure_path,
// key) composite PK.
interface IdempotentResponseInput {
  procedurePath: string;       // e.g. "hypothesis_record"
  key: string;                  // input-derived idempotency key
  resultJson: string;           // serialized procedure response
  createdAt: string;            // ISO 8601
}

// Backs DataStore.writeHypothesis. The created_at column is set by
// SQLite via a DEFAULT clause; the input shape does not carry it.
interface HypothesisInput {
  sessionId: number;            // FK to sessions.id
  content: string;
  citedTestErrorId?: number;
  citedStackFrameId?: number;
  createdTurnId?: number;
}

// Backs DataStore.validateHypothesis.
interface ValidateHypothesisInput {
  id: number;                   // hypotheses.id (must exist;
                                // raises DataStoreError otherwise)
  outcome: "confirmed" | "refuted" | "abandoned";
  validatedAt: string;          // ISO 8601
  validatedTurnId?: number;
}
```

### Idempotency DataReader Output Types

`packages/shared/src/services/DataReader.ts`:

```typescript
// Backs the tRPC idempotency middleware's cache check. Returns
// Option.none() when no cached response exists; otherwise the
// stored result_json from mcp_idempotent_responses.
type FindIdempotentResponse =
  (procedurePath: string, key: string) =>
    Effect.Effect<Option.Option<string>, DataStoreError>;
```

### TDD Lifecycle and Workspace Input Types

`packages/shared/src/services/DataStore.ts`:

```typescript
// Re-exported literal types -- callers reference these instead of
// dipping into schemas/ directly.
type Phase =
  | "spike" | "red" | "red.triangulate" | "green"
  | "green.fake-it" | "refactor" | "extended-red"
  | "green-without-red";
type ArtifactKind =
  | "test_written" | "test_failed_run" | "code_written"
  | "test_passed_run" | "refactor" | "test_weakened";
type ChangeKind =
  | "added" | "modified" | "deleted" | "renamed"
  | "untracked-modified";

// Backs DataStore.writeTddSession. Opens a TDD session row.
// Note: the `agentSessionId` input field maps to the
// `tdd_sessions.session_id` column (NOT `agent_session_id` —
// no such column exists in the live schema). The input name is
// kept for callsite clarity.
interface TddSessionInput {
  goal: string;
  agentSessionId: number;          // FK to sessions.id
                                   // (column: tdd_sessions.session_id)
  parentTddSessionId?: number;     // self-FK for delegation
  startedAt: string;               // ISO 8601
}

// Backs DataStore.endTddSession.
interface EndTddSessionInput {
  tddSessionId: number;
  outcome: "succeeded" | "blocked" | "abandoned";
  endedAt: string;
  summaryNoteId?: number;
}

// Single behavior input under WriteTddBehaviorsInput.
// Live `tdd_session_behaviors` columns are `behavior` (the
// behavior text), `suggested_test_name`, `ordinal` (1-based
// position), `depends_on_behavior_ids`, and `status`. The
// input field names below map to those columns directly.
interface TddBehaviorInput {
  behavior: string;                // -> tdd_session_behaviors.behavior
  suggestedTestName: string;       // -> suggested_test_name
  ordinal: number;                 // -> ordinal (1-based position)
  dependsOnBehaviorIds?: string;   // -> depends_on_behavior_ids
}

// Backs DataStore.writeTddSessionBehaviors.
interface WriteTddBehaviorsInput {
  tddSessionId: number;            // -> parent_tdd_session_id
  behaviors: ReadonlyArray<TddBehaviorInput>;
}

// Output for each row inserted by writeTddSessionBehaviors.
interface TddBehaviorOutput {
  id: number;
  behavior: string;
  ordinal: number;
}

// Backs DataStore.writeTddPhase. Opens a new phase AND closes the
// prior open phase in the same SQL transaction.
interface WriteTddPhaseInput {
  tddSessionId: number;
  phase: Phase;
  startedAt: string;
  citedArtifactId?: number;        // the artifact justifying the
                                   // transition (per Decision D11)
  behaviorId?: number;
}

// Output for the open/close pair.
interface WriteTddPhaseOutput {
  newPhaseId: number;
  closedPhaseId: number | null;    // null on the very first phase
}

// Backs DataStore.writeTddArtifact. Per Decision D7, the only
// caller is the `record tdd-artifact` CLI subcommand, driven by
// the post-tool-use TDD hooks -- never the agent directly.
// Note: the `tddPhaseId` input field maps to the
// `tdd_artifacts.phase_id` column (NOT `tdd_phase_id` — no such
// column exists in the live schema). The input name is kept for
// callsite clarity.
interface WriteTddArtifactInput {
  tddPhaseId: number;              // -> tdd_artifacts.phase_id
  artifactKind: ArtifactKind;
  filePath?: string;
  testCaseId?: number;
  testRunId?: number;
  testFirstFailureRunId?: number;  // for D2 binding rule 3
                                   // (red→green: test wasn't already
                                   //  failing on main)
  diffExcerpt?: string;
  recordedAt: string;
}

// Backs DataStore.writeCommit. Idempotent on `sha`.
interface WriteCommitInput {
  sha: string;
  parentSha?: string;
  message?: string;
  author?: string;
  committedAt?: string;
  branch?: string;
}

// Single changed-file input under WriteRunChangedFilesInput.
interface RunChangedFile {
  filePath: string;
  changeKind: ChangeKind;
}

// Backs DataStore.writeRunChangedFiles.
// Note: `run_changed_files.run_id` is `NOT NULL` in the live
// schema. The `record run-workspace-changes` CLI auto-resolves
// the latest run id when `testRunId` is omitted, which is why
// the input field is functionally optional at the CLI surface
// even though the underlying column is required.
interface WriteRunChangedFilesInput {
  testRunId?: number;              // optional at the CLI: auto-
                                   // resolved to the latest run id
                                   // when omitted. Underlying
                                   // run_changed_files.run_id is
                                   // NOT NULL.
  commitSha: string;               // FK target on commits(sha)
  files: ReadonlyArray<RunChangedFile>;
}
```

### TDD Lifecycle DataReader Output Types

`packages/shared/src/services/DataReader.ts`:

```typescript
// Backs DataReader.getCurrentTddPhase. Returns the most-recent
// OPEN phase (ended_at IS NULL) for a TDD session.
interface CurrentTddPhase {
  id: number;
  tddSessionId: number;
  phase: Phase;
  startedAt: string;
  citedArtifactId: number | null;
  behaviorId: number | null;
}

// Backs DataReader.getTddArtifactWithContext. The tdd_artifacts
// row joined with test_cases, turns, tdd_phases, and sessions so
// the D2 evidence-binding context is reconstructed in one read.
// Consumed verbatim as the `CitedArtifact` input to the pure
// validatePhaseTransition function.
interface CitedArtifactRow {
  id: number;
  artifactKind: ArtifactKind;
  testCaseId: number | null;
  testCaseCreatedTurnAt: string | null;
  testCaseAuthoredInSession: boolean;
  testRunId: number | null;
  testFirstFailureRunId: number | null;
  behaviorId: number | null;
  // ...plus phase + session metadata as needed by the validator
}

// Backs DataReader.getCommitChanges. Returns commit metadata
// joined with run_changed_files for either a single sha (when
// provided) or the 20 most-recent commits (when omitted).
interface CommitChangesEntry {
  sha: string;
  parentSha: string | null;
  message: string | null;
  author: string | null;
  committedAt: string | null;
  branch: string | null;
  files: ReadonlyArray<RunChangedFile>;
}

// Backs DataReader.listTddSessionsForSession. TDD sessions whose
// agent_session_id FK points at the given Claude Code session id.
// Used by tdd_session_resume to find a suitable open TDD session.
interface TddSessionSummary {
  id: number;
  agentSessionId: number;
  goal: string;
  outcome: "succeeded" | "blocked" | "abandoned" | null;
  startedAt: string;
  endedAt: string | null;
  parentTddSessionId: number | null;
}
```

---

## Console Output Format

Printed to `process.stdout` via the markdown formatter. Uses `ansi()`
helper that no-ops when `NO_COLOR` is set.

Three modes controlled by `consoleOutput` option:

- `"failures"` (default) -- tiered output based on run health
- `"full"` -- same tiered format, includes passing test details
- `"silent"` -- no console output, database only

Console output uses three tiers based on run health:

- **Green** (all pass, targets met): minimal one-line summary
- **Yellow** (pass but below targets): improvements needed + CLI hint
- **Red** (failures/threshold violations/regressions): full detail +
  CLI hints

Examples may drift; the formatter source is canonical at
`packages/shared/src/formatters/markdown.ts`.

**Green tier (all passing, targets met):**

```markdown
## [checkmark] Vitest -- 10 passed (120ms)
```

**Red tier (failures, threshold violations, or regressions):**

```markdown
## X Vitest -- 2 failed, 8 passed (340ms)

### X `src/utils.test.ts`

- X **compressLines > handles empty array** [new-failure]
  Expected [] to equal [""]

### Coverage gaps

- `src/coverage.ts` -- Lines: 45% -- uncovered: 42-50,99,120-135

### Next steps

- 1 new failure since last run
- Re-run: `pnpm vitest run src/utils.test.ts`
- Run `pnpm vitest-agent-reporter coverage` for gap analysis
```

---

## Error Handling Strategy

- **Database write failures:** DataStoreError tagged error with `operation`,
  `table`, and `reason` fields. The `reason` is extracted via
  `extractSqlReason(e)` to surface the underlying SQLite message
  (e.g. `"SQLITE_BUSY: database is locked"`,
  `"UNIQUE constraint failed: ..."`) rather than the generic
  `"Failed to execute statement"` SqlError wrapper. The error's
  `message` property is set to `[operation table] reason` so
  `Cause.pretty()` produces useful output. Logged to stderr; doesn't
  crash the test run
- **Database read failures:** DataReaderLive wraps SQL queries in
  `Effect.try`, catching failures as typed `DataStoreError` with
  `extractSqlReason`-derived reason. History reads return empty records
  for missing data
- **Database migration failures:** Migrations run via `ensureMigrated`
  before the main reporter Effect. If the migration promise rejects,
  AgentReporter prints `formatFatalError(err)` to stderr and returns
  early without writing data. DataStoreError uses `operation: "migrate"`
- **Coverage duck-type mismatch:** CoverageAnalyzer returns `Option.none()`,
  coverage section silently skipped
- **Missing `GITHUB_STEP_SUMMARY`:** Skip GFM output (no warning)
- **Project discovery failures:** DiscoveryError tagged error (with the
  same derived `[operation path] reason` message format as
  DataStoreError); CLI reports the issue and continues with available
  data

---

## Data Flow

### Flow 1: AgentReporter Lifecycle

```text
async onInit(vitest)
  +-- store vitest instance as this._vitest
  +-- await ensureDbPath()
  |     +-- if this.dbPath already set: return it (memoized)
  |     +-- if options.cacheDir set:
  |     |     mkdirSync(options.cacheDir, recursive: true)
  |     |     this.dbPath = `${options.cacheDir}/data.db`
  |     |     return this.dbPath
  |     +-- else:
  |           projectDir = process.cwd()
  |           this.dbPath = await Effect.runPromise(
  |             resolveDataPath(projectDir).pipe(
  |               Effect.provide(PathResolutionLive(projectDir)),
  |               Effect.provide(NodeContext.layer)))
  |           return this.dbPath
  +-- (settings + envVars are captured later inside onTestRunEnd's
      Effect program, not in onInit)

onCoverage(coverage)
  +-- stash as this.coverage

async onTestRunEnd(testModules, unhandledErrors, reason)
  |
  +-- dbPath = await ensureDbPath() (defensive for tests that bypass onInit)
  |     +-- on rejection: stderr.write(formatFatalError(err)) and return
  |
  +-- mkdirSync(dirname(dbPath), recursive: true) (defensive no-op)
  |
  +-- await ensureMigrated(dbPath, logLevel, logFile)
  |     +-- on rejection: stderr.write(formatFatalError(err))
  |     |   and return early
  |     +-- otherwise: migration cached on globalThis Symbol;
  |         concurrent reporter instances share the same promise
  |
  +-- Filter testModules by projectFilter (if set)
  |
  +-- Build Effect program:
  |     +-- yield* DataStore
  |     +-- yield* DataReader
  |     +-- yield* CoverageAnalyzer
  |     +-- yield* HistoryTracker
  |     +-- yield* OutputRenderer
  |     +-- captureSettings(vitestConfig, vitestVersion) -> settings
  |     +-- hashSettings(settings) -> settingsHash
  |     +-- captureEnvVars(process.env) -> envVars
  |     +-- DataStore.writeSettings(hash, settings, envVars)
  |         (idempotent INSERT OR IGNORE)
  |
  +-- Group testModules by testModule.project.name
  |     +-- Map<string, VitestTestModule[]>
  |
  +-- CoverageAnalyzer.process/processScoped(coverage, options)
  |     +-- Returns Option<CoverageReport>
  |
  +-- DataReader.getBaselines(project, subProject)
  |     +-- Returns Option<CoverageBaselines>
  |
  +-- For each project group:
  |     +-- splitProject(name) -> { project, subProject }
  |     +-- buildAgentReport(modules, errors, reason, options, name)
  |     +-- Attach unhandledErrors to ALL project reports
  |     +-- Attach coverageReport if present
  |     +-- Extract TestOutcome[] from VitestTestModule objects
  |     +-- HistoryTracker.classify(project, subProject, outcomes, timestamp)
  |     |     +-- Returns { history, classifications }
  |     +-- Attach classifications to TestReport.classification fields
  |     +-- DataStore.writeRun(runInput) -> runId
  |     +-- DataStore.writeModules(runId, modules) -> moduleIds
  |     +-- DataStore.writeSuites(moduleId, suites)
  |     +-- DataStore.writeTestCases(moduleId, tests) -> testCaseIds
  |     +-- For each error in the report:
  |     |       processFailure(error, options) ->
  |     |         { frames: StackFrameInput[], signatureHash }
  |     |       DataStore.writeFailureSignature(
  |     |         { signatureHash, firstSeenRunId: runId,
  |     |           firstSeenAt: now })
  |     +-- DataStore.writeErrors(runId, errors)
  |         (errors carry signatureHash + frames -> live layer
  |          writes test_errors.signature_hash and per-frame
  |          stack_frames.source_mapped_line/function_boundary_line)
  |     +-- DataStore.writeCoverage(runId, coverage)
  |     +-- DataStore.writeHistory(...) per test
  |     +-- DataStore.writeSourceMap() per module (convention-based)
  |     +-- computeTrend() on full (non-scoped) runs
  |     |     +-- DataReader.getTrends(project, subProject)
  |     |     +-- DataStore.writeTrends(project, subProject, runId, entry)
  |
  +-- Compute updated baselines (ratchet up, capped at targets)
  +-- DataStore.writeBaselines(baselines)
  |
  +-- DataReader.getTrends() -> build trendSummary for formatter context
  |
  +-- OutputRenderer.render(reports, format, context)
  |     +-- Returns RenderedOutput[] (target + content)
  |     +-- Emit to stdout / GITHUB_STEP_SUMMARY as appropriate
  |
  +-- Effect.runPromise(program.pipe(Effect.provide(ReporterLive(dbPath))))
```

### Flow 2: AgentPlugin (async `configureVitest`)

- `Effect.runPromise(EnvironmentDetector.detect())` -> environment;
  `ExecutorResolver.resolve(env, mode)` -> executor role.
- Resolve `cacheDir` from `options.reporter.cacheDir` ??
  `outputFile["vitest-agent-reporter"]` (otherwise `undefined`, leaving
  XDG resolution to `AgentReporter.ensureDbPath`).
- Resolve coverage thresholds + targets; disable Vitest's native
  `autoUpdate` if targets are set.
- In agent/own mode, set `coverage.reporter = []` to suppress Vitest's
  text table.
- Push a new `AgentReporter` (with `projectFilter: project.name`) into
  `vitest.config.reporters`.

### Flow 3: CLI Commands (`packages/cli/src/bin.ts`)

- Resolve `dbPath` via `resolveDataPath(process.cwd())` under
  `PathResolutionLive(projectDir) + NodeContext.layer`.
- Provide `CliLive(dbPath, logLevel, logFile)` to the `@effect/cli`
  `Command.run` effect; execute via `NodeRuntime.runMain`.
- Each read-side subcommand (`status`, `overview`, `coverage`,
  `history`, `trends`, `cache`, `doctor`) is a thin wrapper over a
  `lib/format-*` function: query `DataReader` (and
  `ProjectDiscovery` for `overview`), render via `OutputRenderer`,
  write to stdout.
- `cache path` prints the deterministic XDG path. `cache clean`
  removes the data directory.
- **`record` subcommand:**
  - `record turn --cc-session-id <id> <payload-json>`:
    `parseAndValidateTurnPayload` (in `lib/record-turn.ts`)
    decodes the payload via `Schema.decodeUnknown(TurnPayload)`,
    `recordTurnEffect` resolves the session via
    `DataReader.getSessionByCcId`, then writes the turn via
    `DataStore.writeTurn` (omitting `turnNo` for auto-assignment)
  - `record session-start`: invokes
    `recordSessionStart(input)` -> `DataStore.writeSession`
  - `record session-end`: invokes
    `recordSessionEnd(input)` -> `DataStore.endSession`
  - All three use `CliLive` (which includes `DataStoreLive`
    in addition to `DataReaderLive`).

### Flow 4: MCP Server (`packages/mcp/src/bin.ts`)

- Resolve `projectDir` from `VITEST_AGENT_REPORTER_PROJECT_DIR` (set by
  the plugin loader) ?? `CLAUDE_PROJECT_DIR` ?? `process.cwd()`.
- Resolve `dbPath` via `resolveDataPath(projectDir)` under
  `PathResolutionLive(projectDir) + NodeContext.layer`.
- Create `ManagedRuntime.make(McpLive(dbPath, logLevel, logFile))`,
  call `startMcpServer({ runtime, cwd: projectDir })`.
- `StdioServerTransport` connects; tool invocations route through tRPC
  via `createCallerFactory(appRouter)`. Each procedure calls
  `ctx.runtime.runPromise(effect)` against `DataReader`, `DataStore`,
  `ProjectDiscovery`, or `OutputRenderer`.
- `run_tests` uses `spawnSync("npx vitest run", ...)` with timeout.

### Flow 5: Plugin -> MCP Server spawn

- `plugin/bin/mcp-server.mjs` (zero-deps) reads
  `process.env.CLAUDE_PROJECT_DIR ?? process.cwd()`.
- Detect PM: `packageManager` field in `package.json`, else lockfile
  (`pnpm-lock.yaml`, `bun.lock(b)`, `yarn.lock`,
  `package-lock.json`), else default `npm`.
- Spawn `<pm-exec> vitest-agent-reporter-mcp` (`pnpm exec`,
  `npx --no-install`, `yarn run`, or `bun x`) with `stdio: "inherit"`,
  `cwd: projectDir`, and
  `env.VITEST_AGENT_REPORTER_PROJECT_DIR = projectDir` so the spawned
  bin sees the right project root (Flow 4).
- Forward exit code; re-raise termination signals; print PM-specific
  install instructions on non-zero exit.

### Flow 6: Plugin record hooks -> CLI -> DataStore

The `*-record.sh` hook scripts each call the user's installed
`vitest-agent-reporter` bin (the CLI) via the same PM detection
pattern as the MCP loader (Flow 5).

- **SessionStart -> `session-start.sh`:** reads the Claude Code
  SessionStart envelope from stdin, extracts `cc_session_id` /
  project / cwd, calls `triage` CLI to gather orientation context,
  then calls `<pm-exec> vitest-agent-reporter record session-start
  --cc-session-id ... --project ... --cwd ...
  --triage-was-non-empty <bool>`. The CLI runs
  `recordSessionStart` -> `DataStore.writeSession`. Finally
  emits `hookSpecificOutput.additionalContext` with the
  triage markdown.
- **UserPromptSubmit -> `user-prompt-submit-record.sh`:** builds
  a `UserPromptPayload` JSON, calls
  `<pm-exec> vitest-agent-reporter record turn --cc-session-id
  ... <payload>`. The CLI validates the payload against
  `TurnPayload` (Effect Schema decode), resolves the session via
  `getSessionByCcId`, then writes the turn (auto-assigning
  `turn_no` in the live layer).
- **PreToolUse -> `pre-tool-use-record.sh`:** parallel matcher
  to `pre-tool-use-mcp.sh` (the existing MCP allowlist hook).
  Builds a `ToolCallPayload` and calls `record turn`.
- **PostToolUse -> `post-tool-use-record.sh`:** runs on every
  tool result. Builds a `ToolResultPayload` and calls `record
  turn`. For `Edit`/`Write`/`MultiEdit` tools it additionally
  builds a second `FileEditPayload` (with diff and added/removed
  line counts) and calls `record turn` again.
- **SessionEnd -> `session-end-record.sh`:** calls
  `<pm-exec> vitest-agent-reporter record session-end
  --cc-session-id ... [--end-reason ...]`. The CLI runs
  `recordSessionEnd` -> `DataStore.endSession`.
- **PreCompact -> `pre-compact-record.sh`:** builds a
  `HookFirePayload` (carrying `hook_kind: "PreCompact"`) and
  calls `record turn`, then calls `wrapup --kind=pre_compact`
  and emits the result as a top-level `systemMessage` field.

### Flow 7: tRPC idempotency middleware

When a mutation tool wired with `idempotentProcedure`
(currently `hypothesis_record` and `hypothesis_validate`)
receives an MCP request, the middleware sits between the tRPC
input parser and the procedure body.

- Derive idempotency `key` from `input` via the per-procedure
  function in `idempotencyKeys` (e.g.
  `${input.sessionId}:${input.content}` for
  `hypothesis_record`).
- `DataReader.findIdempotentResponse(procedurePath, key)`:
  - On `Option.some(resultJson)`: `JSON.parse` the cached
    response, attach `_idempotentReplay: true`, and return
    without calling `next()`. The downstream DataStore write
    does NOT run.
  - On `Option.none()`: call `next()` (the inner procedure
    body, which runs `DataStore.writeHypothesis` or
    `DataStore.validateHypothesis`).
- After `next()` resolves successfully:
  - `DataStore.recordIdempotentResponse({ procedurePath, key,
    resultJson: JSON.stringify(result), createdAt: now })`.
  - Errors in this step are **swallowed** (best-effort
    persistence). A transient DB failure here is not surfaced
    to the agent; the worst case is a re-run on the next call,
    which is itself idempotent.

The `INSERT ... ON CONFLICT DO NOTHING` semantics on the
composite PK `(procedure_path, key)` mean a parallel insert
race resolves to a no-op, which is the correct behavior --
both branches "see" the same cached value.

---

## Integration Points

### Integration 1: Vitest Reporter API (>= 4.1.0)

**Hooks used:**

- `onInit(vitest: Vitest)` -- store instance, capture settings
- `onCoverage(coverage: unknown)` -- receives istanbul CoverageMap
- `onTestRunEnd(testModules, unhandledErrors, reason)` -- final results

**Key types from Vitest (duck-typed in `utils/build-report.ts`):**

- `VitestTestModule.project.name` -- project grouping
- `VitestTestModule.children.allTests()` -- generator over test cases
- `VitestTestModule.state()` -- module-level state
- `VitestTestModule.diagnostic()` -- duration
- `VitestTestModule.errors()` -- module-level errors
- `VitestTestCase.result()` -- `{ state, errors? }`
- `VitestTestCase.diagnostic()` -- `{ duration, flaky, slow }`
- `VitestTestCase.fullName` -- ` > ` separated hierarchical name

### Integration 2: Vitest Plugin API (`configureVitest`)

**Hook:** `configureVitest({ vitest, project })`

- Uses `VitestPluginContext` from `vitest/node` for type safety
- Uses `as unknown as` casts where Vitest types are too strict
- Runs before reporters are instantiated
- Now async (Vitest awaits plugin hooks)
- Mutate `vitest.config.reporters` to inject `AgentReporter`
- Access `vitest.config.outputFile` for cache directory resolution
  (XDG-based default; no `vitest.vite.config.cacheDir` fallback)
- Access `vitest.config.coverage.thresholds` for coverage threshold
- Pass `project.name` as `projectFilter` for multi-project isolation

### Integration 3: GitHub Actions

**Detection:** `process.env.GITHUB_ACTIONS === "true"` or `=== "1"`,
now detected as `ci-github` environment by EnvironmentDetector.

**Output target:** `process.env.GITHUB_STEP_SUMMARY` -- a file path.
GFM content is appended (not overwritten) to support multiple steps.

### Integration 4: Consumer LLM Agents

**MCP pattern (preferred):** Agents connect via MCP stdio transport and
use the 41 tools for structured data access: read-only queries
(`test_status`, `test_overview`, `test_coverage`, etc.), discovery tools,
session/turn/TDD/hypothesis reads, triage and wrapup reads,
hypothesis writes (`hypothesis_record`, `hypothesis_validate` -- via the
tRPC idempotency middleware), TDD lifecycle reads/writes
(`tdd_session_start`, `tdd_session_end`, `tdd_session_resume`,
`decompose_goal_into_behaviors`, `tdd_phase_transition_request`),
and the workspace history tool (`commit_changes`).

**CLI pattern:** Run `vitest-agent-reporter status` for quick overview,
`vitest-agent-reporter overview` for test landscape, or
`vitest-agent-reporter coverage` for gap analysis. All commands support
`--format` flag.

**Direct database access:** Agents can query `data.db` directly with
SQLite tools if needed.

### Integration 5: Effect Ecosystem

**Runtime dependencies (distributed across the four packages):**

In `vitest-agent-reporter-shared`:

- `effect` -- core runtime, Schema, Context, Layer, Data
- `@effect/platform` -- FileSystem, Path abstractions
- `@effect/platform-node` -- Node.js live implementations
- `@effect/sql` + `@effect/sql-sqlite-node` -- SQLite client and migrator
- `std-env` -- agent and CI runtime detection
- `xdg-effect ^1.0.1` -- XDG path resolution
- `config-file-effect ^0.2.0` -- TOML config loading
- `workspaces-effect ^0.5.1` -- workspace name discovery
- `acorn ^8.16.0` -- AST parser for `findFunctionBoundary`
- `acorn-typescript ^1.4.13` -- TypeScript plugin for acorn

In `vitest-agent-reporter`: shared + the Effect/SQL stack
(transitively via shared) + Vitest peer.

In `vitest-agent-reporter-cli`: shared + `@effect/cli` + Effect/SQL.

In `vitest-agent-reporter-mcp`: shared, `@modelcontextprotocol/sdk`,
`@trpc/server`, `zod`, and the Effect/SQL deps.

- `@effect/sql-sqlite-node` -- SQLite database layer (in shared)
- `@modelcontextprotocol/sdk` -- MCP server (in mcp)
- `@trpc/server` -- tRPC router for MCP tool procedures (in mcp)
- `zod` -- MCP tool input validation, required by tRPC (in mcp)

### Integration 6: Model Context Protocol

**Transport:** stdio (standard input/output)

**Server:** `@modelcontextprotocol/sdk` McpServer with StdioServerTransport

**Router:** tRPC with `createCallerFactory` for testing

**Context:** `McpContext` carrying a `ManagedRuntime` with DataReader,
DataStore, ProjectDiscovery, and OutputRenderer services

**Registration:** Via the inline `mcpServers` config in
`plugin/.claude-plugin/plugin.json`. The plugin's
`bin/mcp-server.mjs` loader spawns `vitest-agent-reporter-mcp`
through the user's package manager (Flow 5). See Decision 30 for the
loader design.

### Integration 7: Claude Code Plugin

**Plugin format:** File-based plugin at `plugin/` directory

**Discovery:** Claude Code discovers the plugin via `.claude-plugin/plugin.json`

**MCP registration:** Inline `mcpServers` config in `plugin.json`
points at `${CLAUDE_PLUGIN_ROOT}/bin/mcp-server.mjs`. The loader
detects the user's package manager and spawns
`vitest-agent-reporter-mcp` through it (`pnpm exec`,
`npx --no-install`, `yarn run`, or `bun x`). See Decision 30 for
details.

**Hooks:**

- `SessionStart` -> `hooks/session-start.sh` -- calls the `triage`
  CLI and emits `hookSpecificOutput.additionalContext` with the
  triage markdown (or generic context fallback); additionally writes
  the `sessions` row via `record session-start
  --triage-was-non-empty <bool>`
- `UserPromptSubmit` -> `hooks/user-prompt-submit-record.sh` --
  invokes `record turn` with a `UserPromptPayload`, then calls
  `wrapup --kind=user_prompt_nudge --user-prompt-hint <prompt>` and
  emits the result as `hookSpecificOutput.additionalContext`. The
  text-match logic for "is this a failure prompt?" lives in
  `format-wrapup`, not the hook
- `PreToolUse` matching `mcp__vitest-agent-reporter__.*` ->
  `hooks/pre-tool-use-mcp.sh` -- auto-allows 41 MCP tools whose
  operation suffix is enumerated in
  `hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt`; unknown ops
  fall through to the standard permission prompt. Parallel
  `hooks/pre-tool-use-record.sh` invokes `record turn` with a
  `ToolCallPayload` (record-only; fires too often for prompt
  injection). `hooks/pre-tool-use-bash-tdd.sh` matches the `Bash`
  tool for the orchestrator (via `lib/match-tdd-agent.sh`) and
  blocks anti-pattern flags (`--update`, `-u`, `--reporter=silent`,
  `--bail`, `-t`, `--testNamePattern`, snapshot edits, edits to
  `coverage.exclude` / `setupFiles` / `globalSetup` in vitest
  config); returns `permissionDecision: "deny"` JSON on match
- `PostToolUse` on `Bash` -> `hooks/post-test-run.sh` (test
  detection). Parallel `hooks/post-tool-use-record.sh` runs on
  every tool result and invokes `record turn` with a
  `ToolResultPayload` (plus a second `record turn` with a
  `FileEditPayload` for `Edit`/`Write`/`MultiEdit`)
- `Stop` -> `hooks/stop-record.sh` -- records a `hook_fire` turn
  AND invokes `wrapup --kind=stop`, emitting the result as a
  top-level `systemMessage` field. Claude Code's hook output schema
  only permits `hookSpecificOutput.additionalContext` on
  `PreToolUse`, `UserPromptSubmit`, `PostToolUse`, and
  `PostToolBatch`; `Stop` / `SessionEnd` / `PreCompact` must use
  top-level fields like `systemMessage` instead
- `SessionEnd` -> `hooks/session-end-record.sh` -- invokes
  `record session-end` to update `sessions.ended_at` /
  `sessions.end_reason`, then calls `wrapup --kind=session_end` and
  emits the result as a top-level `systemMessage` field
- `PreCompact` -> `hooks/pre-compact-record.sh` -- invokes
  `record turn` with a `HookFirePayload`, then calls
  `wrapup --kind=pre_compact` and emits the result as a
  top-level `systemMessage` field
- `SubagentStart` -> `hooks/subagent-start-tdd.sh` -- scoped via
  `lib/match-tdd-agent.sh` (matches the orchestrator under either
  `"TDD Orchestrator"` or the `"tdd-orchestrator"` slug; Claude
  Code silently ignores the custom `agent_type:` frontmatter field,
  but the helper accepts both forms for resilience). Writes the
  `sessions` row with `agent_kind='subagent'`,
  `agent_type='tdd-orchestrator'`, and `parent_session_id` set to
  the parent main-session id
- `SubagentStop` -> `hooks/subagent-stop-tdd.sh` -- scoped via
  `lib/match-tdd-agent.sh`. Calls `record session-end` with
  `end_reason="subagent_stop"`, generates a
  `wrapup --kind=tdd_handoff` note, and records that note as a turn
  on the parent session
- `PostToolUse` (orchestrator-scoped) ->
  `hooks/post-tool-use-tdd-artifact.sh` (records
  test_failed_run / test_passed_run from Bash test runs and
  test_written / code_written from Edit/Write outcomes via
  `record tdd-artifact`) and
  `hooks/post-tool-use-test-quality.sh` (scans test-file
  edits for escape-hatch tokens and records `test_weakened` artifacts)
- `PostToolUse` (repo-scoped) ->
  `hooks/post-tool-use-git-commit.sh` -- fires for all agents on
  every successful `git commit` / `git push` Bash invocation.
  Parses git metadata and shells to `record run-workspace-changes`,
  which writes `commits` (idempotent on `sha`) and
  `run_changed_files`. Backs the `commit_changes` MCP tool

**Agents:** `tdd-orchestrator.md` (subagent definition, iron-law
system prompt, 8-state state machine, 9 inline sub-skill
primitives). Frontmatter `agent_type: tdd-orchestrator` is custom
plugin metadata that Claude Code silently ignores. Claude Code's hook
envelope `agent_type` field equals the agent's `name:` value (so
`"TDD Orchestrator"`). The W2 hooks match via `lib/match-tdd-agent.sh`,
which accepts both the human name and the legacy slug

**Skills:** TDD, debugging, configuration, coverage-improvement
(markdown files); `tdd-primitives/<9 dirs>/SKILL.md` --
9 standalone sub-skill primitives reusable outside the TDD
orchestrator (Decision D6)

**Commands:** setup.md, configure.md, tdd.md
(the `/tdd <goal>` slash command that hands off to the
`tdd-orchestrator` subagent)

---

**Last updated:** 2026-04-30
