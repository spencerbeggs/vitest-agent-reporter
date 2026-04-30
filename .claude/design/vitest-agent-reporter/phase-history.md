---
status: current
module: vitest-agent-reporter
category: history
created: 2026-04-29
updated: 2026-04-29
last-synced: 2026-04-29
completeness: 90
related:
  - vitest-agent-reporter/architecture.md
  - vitest-agent-reporter/decisions.md
  - vitest-agent-reporter/testing-strategy.md
dependencies: []
---

# Phase History -- vitest-agent-reporter

Chronological record of implementation phases. Each phase entry is
intentionally summary-only: rationale lives in
[decisions.md](./decisions.md), file-level structure lives in
[components.md](./components.md), and current testing patterns
live in [testing-strategy.md](./testing-strategy.md).

**Parent document:** [architecture.md](./architecture.md)

---

## Phase 1: Core Reporter and Plugin -- COMPLETE

Initial release. Shipped `AgentReporter` (Vitest Reporter) and
`AgentPlugin` (Vitest plugin) with three-environment detection,
console markdown output, JSON report builder, GFM output for
GitHub Actions, and istanbul-duck-typed coverage processing. Used
Zod 4 for schemas. The directory structure was a single
`package/src/` tree.

**Breaking changes from prior:** none (initial release).

**Dependencies added:** Zod 4, `vitest`.

See [decisions.md](./decisions.md) for rationale (Decisions 1, 2,
4, 10, 11, 12).

---

## Phase 2: Effect Services, CLI Bin, Hybrid Mode -- COMPLETE

Migrated to Effect-based service architecture. Five Effect
services (AgentDetection, CacheWriter, CacheReader,
CoverageAnalyzer, ProjectDiscovery) replaced ad-hoc utility
functions. Added the `vitest-agent-reporter` CLI bin with
`status`, `overview`, and `coverage` commands. Introduced the
`consoleStrategy` option (`"complement"` default) so the plugin
no longer rips out Vitest 4.1's built-in `agent` reporter by
default.

**Breaking changes from Phase 1:**

- Zod replaced by Effect Schema (all schema exports changed)
- Default `consoleStrategy` changed from implicit `"own"` to
  `"complement"`
- `detectEnvironment()` and `isGitHubActions()` utilities removed
  (replaced by AgentDetection service)

**Dependencies added:** `effect`, `@effect/cli`,
`@effect/platform`, `@effect/platform-node`, `std-env`.
**Dependencies removed:** `zod`.

See [decisions.md](./decisions.md) for rationale (Decisions 3, 5,
6, 7, 8, 9).

---

## Phase 3: Suggested Actions and Failure History -- COMPLETE

Added per-test failure persistence and classification across
runs. New `HistoryTracker` service classifies each test as
`new-failure`, `persistent`, `flaky`, `recovered`, or `stable`
against a 10-entry sliding window. Console output gained
`[new-failure]` labels and prioritized "Next steps" suggestions.
Added the CLI `history` command surfacing flaky and persistent
failures with P/F run visualization.

**Breaking changes from Phase 2:** none.

**Dependencies added:** none.

See [decisions.md](./decisions.md) for rationale (Decision 13).

---

## Phase 4: Coverage Thresholds, Baselines, and Trends -- COMPLETE

Replaced the single `coverageThreshold: number` with Vitest-native
threshold format (per-metric, per-glob, negative values, `100`
shorthand, `perFile` mode). Added aspirational `coverageTargets`,
auto-ratcheting baselines that advance toward targets, and
per-project coverage trend tracking with a 50-entry sliding
window and target-change detection via hash comparison. Tiered
console output (green / yellow / red) replaced the previous
single-format output. New CLI commands: `cache path`, `cache
clean`, `doctor`, `trends`. Repository restructured into a pnpm
monorepo with `package/` and `examples/*` workspaces.

**Breaking changes from Phase 3:**

- `coverageThreshold: number` replaced by
  `coverageThresholds: Record<string, unknown>`
- `CoverageReport.threshold` (number) replaced by
  `CoverageReport.thresholds` (object with `global` and `patterns`)
- `extractCoverageThreshold()` function removed
- Console output format changed to tiered model

**Dependencies added:** none.

See [decisions.md](./decisions.md) for rationale (Decisions 14,
15, 16, 17).

---

## Phase 5: SQLite, Output Pipeline, MCP, Plugin -- COMPLETE

Largest phase. Four sub-phases:

**5a -- SQLite data layer:** replaced the JSON file cache with a
25-table normalized SQLite database (`data.db`) via
`@effect/sql-sqlite-node`. `CacheWriter` / `CacheReader` services
became `DataStore` / `DataReader`. `CacheError` became
`DataStoreError`. `ReporterLive` and `CliLive` are now functions
of `dbPath`. Migration-based schema management.

**5b -- Output pipeline:** five new chained Effect services
(`EnvironmentDetector`, `ExecutorResolver`, `FormatSelector`,
`DetailResolver`, `OutputRenderer`) form a pluggable pipeline.
Four-environment detection (`agent-shell`, `terminal`,
`ci-github`, `ci-generic`) replaced the three-environment model.
Four built-in formatters (`markdown`, `gfm`, `json`, `silent`).
`--format` flag on every CLI command.

**5c -- MCP server:** tRPC router with `@modelcontextprotocol/sdk`
stdio transport. 24 MCP tools across meta, read-only query,
discovery, mutation, and note CRUD categories. New `McpLive`
composition layer.

**5d -- Claude Code plugin:** file-based plugin at `plugin/` with
`.claude-plugin/plugin.json` manifest, `.mcp.json` for MCP
auto-registration, SessionStart and PostToolUse hooks, four
skills (TDD, debugging, configuration, coverage-improvement),
and two commands (setup, configure).

**Breaking changes from Phase 4:**

- `CacheWriter` / `CacheReader` services removed (replaced by
  `DataStore` / `DataReader`)
- `CacheError` removed (replaced by `DataStoreError`)
- `CacheWriterLive` / `CacheReaderLive` removed (replaced by
  `DataStoreLive` / `DataReaderLive`)
- `ReporterLive` and `CliLive` changed from static layers to
  functions of `dbPath: string`
- JSON cache files no longer produced
- `AgentDetection` service replaced by `EnvironmentDetector`
- Three-environment model replaced by four-environment model

**Dependencies added:** `@effect/sql-sqlite-node`,
`@modelcontextprotocol/sdk`, `@trpc/server`, `zod` (for tRPC
input schemas).

See [decisions.md](./decisions.md) for rationale (Decisions 18,
19, 20, 21, 22, 23).

---

## Post-Phase-5 Refinements -- COMPLETE

Incremental fixes after Phase 5 stabilized.

- `projectFilter` option on `AgentReporter` plus per-project
  reporter instances via `AgentPlugin`. Coverage dedup: only the
  first project alphabetically processes global coverage
- Plugin uses `VitestPluginContext` from `vitest/node` for
  `configureVitest` typing
- `mcp` boolean option suggests MCP tools instead of CLI commands
  in console "Next steps"
- `consoleStrategy` renamed to `strategy`
- `debug: boolean` replaced by structured `logLevel`/`logFile`
  via new `LoggerLive` layer (NDJSON via
  `Logger.structuredLogger`, optional file via `Logger.zip`,
  env var fallback `VITEST_REPORTER_LOG_LEVEL` /
  `VITEST_REPORTER_LOG_FILE`). `Effect.logDebug` calls on every
  `DataStore` / `DataReader` method
- Plugin sets `coverage.reporter = []` in agent/own mode to
  suppress Vitest's native coverage text table
- Trend summary wired into formatter context so console output
  shows "trending improving over N runs"
- `vitest.config.ts` switched to plain `defineConfig` from
  `vitest/config` with `extends: true`

**Breaking changes:** `consoleStrategy` -> `strategy` rename;
`debug` removed.

See [decisions.md](./decisions.md) for rationale (Decisions 24,
25, 26, 27).

---

## Pre-2.0 stability fixes -- COMPLETE

Two targeted fixes for SQLITE_BUSY races and plugin MCP startup
failures, shipped before the 2.0 restructure.

- **Process-level migration coordinator** (`ensureMigrated`):
  serializes SQLite migrations across reporter instances in the
  same process via a `globalThis`-keyed promise cache
  (`Symbol.for("vitest-agent-reporter/migration-promises")`).
  Required for multi-project Vitest configs sharing one
  `data.db`, where concurrent migration attempts on a fresh
  database hit `SQLITE_BUSY`. `AgentReporter.onTestRunEnd`
  awaits this before its main `Effect.runPromise`
- **`extractSqlReason(e)` helper** on `DataStoreError` extracts
  the underlying `SqlError.cause.message` (real SQLite text like
  `"SQLITE_BUSY: database is locked"`) instead of the generic
  `"Failed to execute statement"` wrapper. Every `Effect.mapError`
  call site in `DataStoreLive` and `DataReaderLive` uses it.
  `DataStoreError` and `DiscoveryError` constructors set
  `this.message` to a derived `[operation table-or-path] reason`
  format so `Cause.pretty()` produces useful output
- **Plugin MCP loader (1.x)**: the previous `npx
  vitest-agent-reporter-mcp` registration could fall back to a
  registry download and exceed Claude Code's MCP startup window.
  Replaced with a `file://` dynamic-import loader at
  `plugin/bin/mcp-server.mjs` that walked the user's
  `node_modules`. This loader was retired in 2.0 in favor of
  PM-detect-and-spawn (Decision 30)

**Breaking changes:** none.

See [decisions.md](./decisions.md) for rationale (Decision 28;
Decision 29 is retired but documented for historical context).

---

## Phase 6: 2.0 Architectural Restructure -- COMPLETE

The 2.0 release closes [issue #39][issue-39] and reshapes the
package layout.

[issue-39]: https://github.com/spencerbeggs/vitest-agent-reporter/issues/39

- **Four-package split**: monolith split into
  `vitest-agent-reporter-shared` (no internal deps),
  `vitest-agent-reporter` (reporter + plugin),
  `vitest-agent-reporter-cli`, and `vitest-agent-reporter-mcp`.
  All four release in lockstep; reporter declares CLI and MCP as
  required `peerDependencies`
- **Deterministic XDG-based data path**: replaced the
  artifact-probing `resolveDbPath` (which walked
  `node_modules/.vite/vitest/<hash>/...`) with
  `resolveDataPath`, which derives
  `$XDG_DATA_HOME/vitest-agent-reporter/<workspaceKey>/data.db`
  from the root `package.json` `name`. Optional
  `vitest-agent-reporter.config.toml` overrides via `cacheDir`
  or `projectKey`. Fail-loud with `WorkspaceRootNotFoundError`
  when no workspace identity is available -- no silent path-hash
  fallback
- **Async `AgentReporter.onInit`**: needed to resolve the XDG
  path. Memoized via `private dbPath` and `ensureDbPath()`
- **Plugin MCP loader rewritten** as zero-deps PM-detect +
  spawn. Detects `pnpm`/`npm`/`yarn`/`bun` via `packageManager`
  field or lockfile, spawns
  `<pm exec> vitest-agent-reporter-mcp` with stdio inheritance,
  forwards `CLAUDE_PROJECT_DIR` via new
  `VITEST_AGENT_REPORTER_PROJECT_DIR` env var (Claude Code does
  not reliably propagate `CLAUDE_PROJECT_DIR` to MCP
  subprocesses)
- **`SqliteState.Live` investigation closed**: kept the existing
  `SqliteClient` + `SqliteMigrator` + `ensureMigrated` triplet.
  `SqliteState.Live` re-runs migrations on each Layer
  construction without process-level coordination, which would
  reintroduce the SQLITE_BUSY race (Decision 28's neighbor)

**Breaking changes from Phase 5:**

- 1.x `node_modules/.vite/.../data.db` location is gone; no
  migration code -- existing 1.x users have history reset on
  first 2.0 run (documented in changeset/changelog)
- Direct schema imports must change from
  `vitest-agent-reporter` to `vitest-agent-reporter-shared`
- `AgentReporter.onInit` is now async (only breaks consumers
  manually instantiating `AgentReporter` and synchronously
  calling `onInit` -- `AgentPlugin` users are unaffected)
- The reporter package's `./mcp` subpath export is gone; the
  MCP server is now its own bin

**Dependencies added (in shared only):** `xdg-effect ^1.0.1`,
`config-file-effect ^0.2.0`, `workspaces-effect ^0.5.1`.

See [decisions.md](./decisions.md) for full rationale (Decisions
30, 31, 32, 33). The 2.0 plan reference is
`.claude/plans/2026-04-29-2.0.0-xdg-paths-and-package-split.md`.

---

## Phase 7: 2.0.0-α Comprehensive Schema -- COMPLETE

The 2.0.0-α release lays the foundation for orientation triage,
TDD evidence-based phase transitions, and anti-pattern detection
by introducing a comprehensive new SQLite schema. Hook scripts,
the `record` CLI, MCP tools for the new tables, and the TDD
orchestrator subagent are out of scope on this branch -- they
land in subsequent 2.0 release phases.

- **`0002_comprehensive` migration**: drops every 1.x table and
  recreates the layout with 15 new tables (40 total +
  `notes_fts`). New tables fall into five clusters:
  - **Session/turn logging** -- `sessions` (Claude Code
    conversations with `cc_session_id`, `agent_kind`,
    `parent_session_id` self-FK), `turns` (per-session log with a
    7-value `type` CHECK and JSON-stringified payload),
    `tool_invocations`, `file_edits`
  - **Hypotheses** -- `hypotheses` table with
    `cited_test_error_id` and `cited_stack_frame_id` evidence FKs
    plus a `validation_outcome` CHECK
    (`confirmed`/`refuted`/`abandoned`)
  - **Code-change context** -- `commits`, `run_changed_files`,
    `run_triggers` (1:1 with `test_runs`, 6-value `trigger`
    CHECK), `build_artifacts`
  - **TDD lifecycle** -- `tdd_sessions`, `tdd_session_behaviors`,
    `tdd_phases` (8-value `phase` CHECK), `tdd_artifacts`
    (6-value `artifact_kind` CHECK)
  - **Failure deduplication and hooks** -- `failure_signatures`
    (PK is the 16-char `computeFailureSignature` hash),
    `hook_executions` (Vitest hook lifecycle)

  Plus: `test_errors` augmented with a `signature_hash` FK,
  `stack_frames` augmented with `source_mapped_line` and
  `function_boundary_line`. `notes_fts` recreated with the
  corrected `BEFORE/AFTER UPDATE` trigger pattern (Bug Fix below)
- **Turn payload schemas**: discriminated `TurnPayload` Effect
  Schema union over seven payload types (`UserPromptPayload`,
  `ToolCallPayload`, `ToolResultPayload`, `FileEditPayload`,
  `HookFirePayload`, `NotePayload`, `HypothesisPayload`) at
  `packages/shared/src/schemas/turns/`. The forthcoming `record`
  CLI uses these to validate the JSON-stringified `turns.payload`
  before `DataStore.writeTurn`
- **Stable failure-signature hashing**:
  `computeFailureSignature` produces a 16-char `sha256` over
  `(error_name | normalized assertion shape | top non-framework
  function name | function-boundary line)`.
  `findFunctionBoundary` parses the source via `acorn` and walks
  the AST for the smallest enclosing function whose `loc` range
  contains the failing line. `normalizeAssertionShape` strips
  matcher arguments to type tags so unrelated literal changes
  don't perturb the signature. Falls back to a 10-line raw-line
  bucket when the function boundary is unknown
- **Phase-transition evidence binding**: pure
  `validatePhaseTransition` function encoding the three D2
  binding rules (cited test in phase window AND session,
  behavior_id match, test wasn't already failing). Returns a
  discriminated `PhaseTransitionResult` with typed `DenialReason`
  - `Remediation` containing `suggestedTool`, `suggestedArgs`,
  and `humanHint`
- **New `DataStore` methods**: `writeSession(SessionInput)` and
  `writeTurn(TurnInput)`. Inputs declared in
  `packages/shared/src/services/DataStore.ts`
- **New `DataReader` methods**: `getSessionById(id)` returning
  `Option<SessionDetail>`, `searchTurns(options)` returning
  `TurnSummary[]` (filtered by sessionId/type/since/limit), and
  `computeAcceptanceMetrics()` returning the four spec Annex A
  metrics (phase-evidence integrity, compliance-hook
  responsiveness, orientation usefulness, anti-pattern detection
  rate)
- **New SQL row schemas**: `SessionRow`, `TurnRow`,
  `ToolInvocationRow`, `FileEditRow`, `HypothesisRow`,
  `CommitRow`, `RunChangedFileRow`, `RunTriggerRow`,
  `BuildArtifactRow`, `TddSessionRow`, `TddSessionBehaviorRow`,
  `TddPhaseRow`, `TddArtifactRow`, `FailureSignatureRow`,
  `HookExecutionRow` -- all `Schema.Struct` (matching the
  existing rows.ts convention rather than raw interfaces)
- **`ensureMigrated` registration**: registers
  `0002_comprehensive` alongside `0001_initial` so reporter, CLI,
  and MCP all pick up the new schema on startup

**Bug fix:** the 1.x `notes_fts` UPDATE triggers used `AFTER
UPDATE` for both delete and insert steps. The delete step ran
after the row was rewritten, so it read the *new* content as
`OLD.content` and accumulated stale tokens in the FTS5 index over
time. Fixed by splitting into `notes_bu` (BEFORE UPDATE, captures
true OLD values for the FTS delete) and `notes_au` (AFTER UPDATE,
inserts NEW values). Migration recreates the triggers; existing
indexes get a fresh start as part of the drop-and-recreate.

**Breaking changes from Phase 6:**

- All 1.x tables are dropped and recreated. Test history,
  coverage trends, baselines, and notes are not preserved. Per
  Decision D9, this is the **last** drop-and-recreate migration;
  future schema changes (2.0+) will be ALTER-only with one-shot
  export/import paths reserved for major bumps that ALTER cannot
  express
- `DataReader.getCoverage` and `getFileCoverage` semantics
  unchanged at the API level; consumers should run `pnpm
  vitest-agent-reporter doctor` after upgrading to verify the
  migration succeeded

**Out of scope on this branch (later 2.0 release phases):** hook
scripts that capture session/turn data into the new tables, the
`record` CLI that validates `TurnPayload` and writes turns, MCP
tools surfacing the new tables (sessions/turns/TDD/hypotheses/
metrics), the TDD orchestrator subagent that consumes
`validatePhaseTransition`.

**Dependencies added (in shared only):** `acorn ^8.16.0`,
`@types/acorn ^6.0.4` (devDep).

See [decisions.md](./decisions.md) for full rationale (Decisions
D9 last drop-and-recreate, D10 stable failure signatures via AST
function boundary, D11 TDD phase-transition evidence binding).

---

**Document Status:** Current. Covers Phase 1 through Phase 7
(2.0.0-α). Implementation complete on this branch; subsequent
phases (hooks, record CLI, MCP tool surface, TDD orchestrator
subagent) will be appended here as they ship.
