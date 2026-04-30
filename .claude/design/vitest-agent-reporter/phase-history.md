---
status: current
module: vitest-agent-reporter
category: history
created: 2026-04-29
updated: 2026-04-30
last-synced: 2026-04-30
post-final-sync: 2026-04-30
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

## Phase 8: 2.0.0-β Substrate Wiring -- COMPLETE

The 2.0.0-β release activates the schema substrate landed in α
by wiring the reporter, the new `record` CLI, plugin hook scripts,
and read-only MCP tools onto the 15 new tables. β is purely
**substrate-wiring**: it consumes α's primitives (failure
signatures, turn payload schemas, evidence-binding validator) and
makes them observable via real I/O. No new architectural
decisions are introduced -- the choices are downstream of α's
D9/D10/D11.

- **TypeScript-aware function boundary**:
  `findFunctionBoundary` now parses TypeScript via the
  `acorn-typescript` plugin (`tsPlugin` named import) so reporter
  callers source-mapped back to `.ts` files no longer fall
  through to the 10-line bucket. Closes α D10's deferred work --
  the granularity gap shifts from "always 10-line for TS" to
  "function-stable for TS"
- **Reporter wiring for failure signatures**: new
  `packages/reporter/src/utils/process-failure.ts` walks each
  Vitest stack frame, source-maps the top non-framework frame,
  runs `findFunctionBoundary`, calls `computeFailureSignature`,
  and returns the parsed frames + `signatureHash` for
  persistence. `AgentReporter.onTestRunEnd` now calls
  `processFailure` per error, upserts `failure_signatures` via
  the new `writeFailureSignature` (idempotent, increments
  `occurrence_count` on conflict), then writes
  `test_errors.signature_hash` and the `stack_frames`
  source-mapped/function-boundary line columns
- **New `DataStore` methods**: `writeFailureSignature(input:
  FailureSignatureWriteInput)` (ON CONFLICT idempotent upsert
  on the `signature_hash` PK), `endSession(ccSessionId,
  endedAt, endReason)` (updates `sessions.ended_at` and
  `sessions.end_reason` for the SessionEnd hook), and
  auto-assignment of `turn_no` in `writeTurn` when omitted (the
  live layer computes `MAX(turn_no)+1` per session). New input
  shapes: `StackFrameInput` and `FailureSignatureWriteInput`
  (the latter name disambiguates from
  `utils/failure-signature.ts`'s compute-time
  `FailureSignatureInput`). `TestErrorInput` gained optional
  `signatureHash` and `frames` fields
- **New `DataReader` methods**: `getSessionByCcId(ccSessionId)`
  (used by the `record` CLI to resolve sessions from Claude Code
  IDs), `listSessions(options)` (filter by project/agentKind,
  default limit 50), `getFailureSignatureByHash(hash)` returning
  `FailureSignatureDetail` (signature row + up-to-10 recent
  errors), `getTddSessionById(id)` returning `TddSessionDetail`
  rolling up `tdd_sessions` + `tdd_phases` + `tdd_artifacts`,
  and `listHypotheses(options)` (filter by sessionId/outcome
  where `outcome=open` means `validation_outcome IS NULL`,
  default limit 50). New detail types: `FailureSignatureDetail`,
  `TddSessionDetail`, `TddPhaseDetail`, `TddArtifactDetail`,
  `HypothesisDetail`
- **`record` CLI subcommand**: new
  `packages/cli/src/commands/record.ts` with three subcommands
  (`record turn --cc-session-id ... <payload-json>`,
  `record session-start --cc-session-id ... --project ... --cwd
  ...`, `record session-end --cc-session-id ...
  [--end-reason ...]`). Lib functions
  (`packages/cli/src/lib/record-turn.ts`,
  `record-session.ts`): `parseAndValidateTurnPayload` validates
  against the α `TurnPayload` Effect Schema discriminated union
  before persistence; `recordTurnEffect` resolves the session
  via `getSessionByCcId` and writes the turn;
  `recordSessionStart` and `recordSessionEnd` wrap
  `writeSession`/`endSession`. Wired into the root command in
  `packages/cli/src/bin.ts`
- **Six new plugin hook scripts** (in `plugin/hooks/`):
  `session-start-record.sh` (parallel to existing context
  injection at SessionStart), `user-prompt-submit-record.sh`
  (new UserPromptSubmit registration -- emits `user_prompt`
  turn), `pre-tool-use-record.sh` (parallel to existing MCP
  allowlist matcher -- emits `tool_call` turn),
  `post-tool-use-record.sh` (parallel to existing Bash
  test-detection matcher -- emits `tool_result` turn, plus a
  second `file_edit` turn for Edit/Write/MultiEdit),
  `session-end-record.sh` (new SessionEnd registration -- calls
  `record session-end`), and `pre-compact-record.sh` (new
  PreCompact registration -- emits `hook_fire` turn; the
  prompt-injection nudge graduates to RC's interpretive hooks).
  All six wired into `plugin/hooks/hooks.json`
- **Seven new read-only MCP tools** in `packages/mcp/src/tools/`:
  `session_list`, `session_get`, `turn_search`,
  `failure_signature_get`, `tdd_session_get`, `hypothesis_list`,
  `acceptance_metrics`. Each is wrapped with a zod input schema
  (the MCP SDK side); registered in `router.ts` and
  `server.ts`; auto-allowed via
  `plugin/hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt`;
  listed in `tools/help.ts` under a new "Sessions / Turns / TDD
  reads (β)" section

**Breaking changes from Phase 7:** none. β is additive -- it adds
read paths and write paths for tables that already existed in α's
schema. The α drop-and-recreate already happened; β does not
re-run it.

**Out of scope on this branch (deferred to RC/final):**

- TDD orchestrator subagent (Workstream 2)
- Write-side TDD lifecycle MCP tools (`tdd_session_start`,
  `tdd_phase_transition_request`, `tdd_session_end`,
  `tdd_artifact_record`)
- Hypothesis writes (`hypothesis_record`, `hypothesis_validate`)
- Interpretive hook prompt-injection (Stop / SessionEnd /
  PreCompact / UserPromptSubmit content nudges -- β only records
  turn data, RC adds the interpretive nudges)
- tRPC idempotency middleware
- W3 orientation triage report
- W4 std-osc8 hyperlinks, CI annotation formatter, `cache prune`
  CLI, `wrapup` CLI
- `commit_changes` MCP tool (no rows to read until RC's
  `record run_workspace_changes` lands)
- Bun-rewrite hooks
- E2E spawnSync test against the built bin (Task 30 of the β
  plan was deferred -- documented in decisions.md)

**Dependencies added (in shared only):** `acorn-typescript
^1.4.13` (TS plugin for acorn).

See [decisions.md](./decisions.md) for the supporting notes (the
`FailureSignatureWriteInput` / `FailureSignatureInput` naming
disambiguation and the deferred e2e test).

---

## Phase 9: 2.0.0-RC Substrate Integration -- COMPLETE

The 2.0.0-RC release closes the W3/W5/W6 workstreams and the W4
cheap wins on top of α's schema substrate and β's record paths.
RC is purely **integration**: it consumes existing α primitives
(failure signatures, turn payload schemas, evidence-binding
validator) and β record paths (sessions, turns, hypothesis
substrate, MCP read tools) and adds the user-facing surfaces
that turn the captured data into action -- the orientation
triage brief, interpretive prompt-injection hooks, hypothesis
write tools, and a shared idempotency middleware. **No new
architectural decisions** are introduced. The migration
(`0003_idempotent_responses`) is purely additive (one
`CREATE TABLE`, no DROP) -- per Decision D9, `0002` remains the
last drop-and-recreate.

- **W3 orientation triage report**: new
  `packages/shared/src/lib/format-triage.ts` -- a pure markdown
  generator (`E = never` via `Effect.orElseSucceed`) that reads
  from DataReader and emits the triage brief. Options:
  `{ project?, maxLines?, since? }`. Powers both the new CLI
  `triage` subcommand and the new `triage_brief` MCP tool.
  `session-start.sh` is rewritten to call the `triage` CLI and
  emit `hookSpecificOutput.additionalContext` with the triage
  markdown (or generic context fallback), additionally writing
  the sessions row with `--triage-was-non-empty`. The earlier β
  `session-start-record.sh` is removed -- its responsibility
  folds into `session-start.sh`, and the duplicate `SessionStart`
  entry in `hooks.json` is removed
- **W5 interpretive hook nudges**: new
  `packages/shared/src/lib/format-wrapup.ts` -- a pure markdown
  generator with five `kind` variants (`stop`, `session_end`,
  `pre_compact`, `tdd_handoff`, `user_prompt_nudge`). The
  text-match logic for "is this a failure prompt?" lives in
  this generator, not in the hooks. Powers the new `wrapup`
  CLI, the `wrapup_prompt` MCP tool, and four interpretive
  hooks. New `stop-record.sh` (registered for the first time as
  the `Stop` hook in `hooks.json`) records a `hook_fire` turn
  AND injects a wrap-up nudge via `wrapup --kind=stop`. The β
  hooks `session-end-record.sh`, `pre-compact-record.sh`, and
  `user-prompt-submit-record.sh` are upgraded from record-only
  to record + inject (calling `wrapup --kind=session_end`,
  `--kind=pre_compact`, and
  `--kind=user_prompt_nudge --user-prompt-hint <prompt>`
  respectively). PreToolUse-record and PostToolUse-record stay
  record-only -- they fire too often for prompt injection to be
  tolerable
- **W6 hypothesis MCP write tools**: two new mutation tools
  (`hypothesis_record`, `hypothesis_validate`) backed by new
  DataStore methods of the same names. Both go through the new
  tRPC idempotency middleware so duplicate calls (from a flaky
  agent retry) are no-ops at the database layer
- **tRPC idempotency middleware**: new
  `packages/mcp/src/middleware/idempotency.ts`. Wraps a
  procedure: derives a key from input via a per-procedure
  `idempotencyKeys` derive function, checks
  `DataReader.findIdempotentResponse(path, key)`, replays the
  cached result with `_idempotentReplay: true` on a hit,
  otherwise runs `next()` and persists via
  `DataStore.recordIdempotentResponse`. Persistence errors are
  swallowed (best-effort) so a transient DB failure doesn't
  surface as a tool error. Exposes `idempotentProcedure` (a
  drop-in for `publicProcedure` on idempotent mutations) and
  shares the same tRPC instance via a new `middleware` export
  from `packages/mcp/src/context.ts` rather than constructing a
  parallel `t`. Currently registers `hypothesis_record` (key:
  `${sessionId}:${content}`) and `hypothesis_validate` (key:
  `${id}:${outcome}`)
- **W4 cheap wins**: three additions hand-picked from the
  larger W4 backlog. `wrapup` CLI subcommand
  (`--since --cc-session-id --kind --user-prompt-hint --format`
  -- emits the same wrap-up prompt as the MCP tool and the
  interpretive hooks). `wrapup_prompt` MCP tool (read-only;
  identical generator). `cache prune --keep-recent` CLI
  subcommand (W1 retention -- finds the cutoff at the
  `(keepRecent+1)`-th most recent session and deletes turn
  rows for older sessions; FK CASCADE handles
  `tool_invocations` and `file_edits`; sessions rows
  themselves are retained). The remaining W4 items
  (std-osc8 hyperlinks, CI annotation formatter, the
  `commit_changes` MCP tool, Bun-rewrite hooks) defer to
  later releases
- **`0003_idempotent_responses` migration**: additive
  `CREATE TABLE mcp_idempotent_responses` with composite PK
  `(procedure_path, key)`, `result_json` text, `created_at`
  timestamp, plus a `(procedure_path, created_at DESC)` index
  for future TTL pruning. Per Decision D9, this is purely
  additive (no DROP); 0002 remains the last drop-and-recreate.
  Registered in `ensureMigrated`, `DataStoreTestLayer`,
  `DataReaderLive.test.ts`'s migrator, and
  `format-wrapup.test.ts`'s migrator. Exported from
  `packages/shared/src/index.ts` as `migration0003`. Tables
  total moves from 40 to 41 + `notes_fts`
- **New `DataStore` methods** (in
  `packages/shared/src/services/DataStore.ts` and
  `layers/DataStoreLive.ts`):
  - `recordIdempotentResponse(input: IdempotentResponseInput)`
    -- `INSERT ... ON CONFLICT DO NOTHING` so duplicate keys
    are no-ops
  - `writeHypothesis(input: HypothesisInput)` -- inserts a
    `hypotheses` row with cited evidence FKs
    (`citedTestErrorId`, `citedStackFrameId`,
    `createdTurnId`) and returns the new id
  - `validateHypothesis(input: ValidateHypothesisInput)` --
    updates `validation_outcome`, `validated_at`,
    `validated_turn_id`; raises a `DataStoreError` when the
    hypothesis id is unknown
  - `pruneSessions(keepRecent: number)` -- finds the cutoff at
    the `(keepRecent+1)`-th most recent session and deletes
    turn rows for older sessions (FK CASCADE handles
    `tool_invocations` + `file_edits`). Sessions rows
    themselves are retained. Returns
    `{ affectedSessions, prunedTurns }`

  New input shapes in DataStore.ts: `IdempotentResponseInput`,
  `HypothesisInput`, `ValidateHypothesisInput`
- **New `DataReader` method**:
  `findIdempotentResponse(procedurePath, key)` returning
  `Option<string>`. Backs the tRPC idempotency middleware's
  cache check
- **Four new MCP tools** (registered in `router.ts` and
  `server.ts`, allowlisted in
  `plugin/hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt`,
  listed in `tools/help.ts`):
  - `triage_brief({ project?, maxLines? })` -- read-only;
    same generator as the CLI `triage` subcommand
  - `wrapup_prompt({ sessionId?, ccSessionId?, kind?,
    userPromptHint? })` -- read-only; same generator as the
    `wrapup` CLI
  - `hypothesis_record({ sessionId, content,
    citedTestErrorId?, citedStackFrameId?, createdTurnId? })`
    -- mutation; idempotent
  - `hypothesis_validate({ id, outcome, validatedAt,
    validatedTurnId? })` -- mutation; idempotent

  Total tool count moves from 31 (β) to 37 (RC). `help.ts`
  reports 37
- **Three new CLI subcommands** (registered in
  `packages/cli/src/bin.ts`):
  - `triage --format --project --max-lines` -- emits the W3
    orientation triage brief
  - `wrapup --since --cc-session-id --kind --user-prompt-hint
    --format` -- emits the W5 wrap-up prompt
  - `cache prune --keep-recent` -- drops old turn history
    (W1 retention)

**Breaking changes from Phase 8:** none. RC is additive across
the schema (one new table), the data layer, the CLI, the MCP
server, and the plugin. Existing β data layout, frontmatter,
options, and command names are preserved.

**Out of scope on this branch (deferred to final/post-RC):**

- TDD orchestrator subagent
- Write-side TDD lifecycle MCP tools (`tdd_session_start`,
  `tdd_phase_transition_request`, `tdd_session_end`,
  `tdd_artifact_record`)
- Remaining W4 polish (std-osc8 hyperlinks, CI annotation
  formatter, `commit_changes` MCP tool, Bun-rewrite hooks)
- E2E spawnSync test against the built bin (Decision β-N2)

**Dependencies added:** none. RC is built entirely on the α/β
dependency graph.

See [decisions.md](./decisions.md) "Phase 9 / RC notes"
subsection for the idempotency middleware's
`findIdempotentResponse` -> `next()` ->
`recordIdempotentResponse` flow and how it handles the
persist-failure case.

---

## Phase 10: 2.0.0 Stable / TDD Orchestrator -- COMPLETE

The 2.0.0 stable / final release closes the W2 (TDD
orchestrator + anti-pattern detection), W4 cheap wins
(`ci-annotations` formatter + OSC-8 hyperlinks +
`commit_changes` MCP tool), and W6 (TDD lifecycle MCP write
tools) workstreams from the spec, plus anti-pattern detection
hooks scoped to the TDD orchestrator subagent. **No new
architectural decisions** are introduced in this phase --
everything is downstream of α's D9 / D10 / D11 and built on
top of β's substrate wiring and RC's interpretive hooks +
idempotency middleware. This phase ships final 2.0.0 stable
across all four packages.

### What lands in final

The release covers the seven workstreams from the spec:

- **W2 -- TDD orchestrator subagent**:
  `plugin/agents/tdd-orchestrator.md` carries the iron-law
  system prompt, the eight-state state machine matching α's
  `tdd_phases.phase` enum, the ~15-tool `tools:` array, and
  the 9 sub-skill primitives embedded inline. The
  `/tdd <goal>` slash command (`plugin/commands/tdd.md`)
  hands off to the orchestrator. Sub-skills also publish as
  standalone `plugin/skills/tdd-primitives/<9 dirs>/SKILL.md`
  per Decision D6 (standalone reuse for non-TDD work):
  `interpret-test-failure`, `derive-test-name-from-behavior`,
  `derive-test-shape-from-name`, `verify-test-quality`,
  `run-and-classify`, `record-hypothesis-before-fix`,
  `commit-cycle`, `revert-on-extended-red`,
  `decompose-goal-into-behaviors`
- **W2 -- TDD lifecycle MCP writes**: 5 new mutation tools
  (`tdd_session_start`, `tdd_session_end`,
  `tdd_session_resume` -- read, technically -- ,
  `decompose_goal_into_behaviors`,
  `tdd_phase_transition_request`) backed by 7 new DataStore
  methods (`writeTddSession`, `endTddSession`,
  `writeTddSessionBehaviors`, `writeTddPhase`,
  `writeTddArtifact`, `writeCommit`, `writeRunChangedFiles`)
  and 4 new DataReader methods (`getCurrentTddPhase`,
  `getTddArtifactWithContext`, `getCommitChanges`,
  `listTddSessionsForSession`). The `tdd_phase_transition_request`
  tool reads the current phase + cited artifact context, runs
  the pure α `validatePhaseTransition` validator, and on
  accept calls `writeTddPhase` (which closes the prior open
  phase and opens the new one in the same SQL transaction).
  Per Phase 10 / final notes, the transition tool is **not**
  in the idempotency-key registry; the four other write tools
  are
- **W2 -- Anti-pattern detection hooks**: five new
  orchestrator-scoped plugin hook scripts.
  `pre-tool-use-bash-tdd.sh` is a restricted-Bash gate that
  blocks `--update`, `-u`, `--reporter=silent`, `--bail`,
  `-t`, `--testNamePattern`, `*.snap` edits, and edits to
  `coverage.exclude` / `setupFiles` / `globalSetup` in vitest
  config files. `post-tool-use-tdd-artifact.sh` records
  test_failed_run / test_passed_run / test_written /
  code_written artifacts via `record tdd-artifact`.
  `post-tool-use-test-quality.sh` scans test-file edits for
  escape-hatch tokens (`it.skip`, `it.todo`, `it.fails`,
  `it.concurrent`, `.skipIf`, `.todoIf`, `test.skip`,
  `test.todo`, `test.fails`, `describe.skip`,
  `describe.todo`) and records `test_weakened` artifacts.
  `subagent-start-tdd.sh` and `subagent-stop-tdd.sh` register
  the new `SubagentStart` and `SubagentStop` event types and
  write/close the `sessions` row with
  `agent_kind='subagent'`, `agent_type='tdd-orchestrator'`
- **W4 -- `ci-annotations` formatter**:
  `packages/shared/src/formatters/ci-annotations.ts` emits
  GitHub Actions `::error file=...,line=...::` workflow
  commands. The `OutputFormat` literal in `Common.ts` extends
  from 4 to 5 values to add `"ci-annotations"`.
  `FormatSelector.select()` gains an optional `environment?:
  Environment` third parameter (backwards-compatible) that
  the `ci-github` branch consults to auto-select this
  formatter when running inside a GitHub Actions runner
- **W4 -- OSC-8 hyperlinks**:
  `packages/shared/src/utils/hyperlink.ts` provides
  `osc8(url, label, { enabled })`. Wired into
  `formatters/markdown.ts` via a regex post-processor that
  wraps test-file paths in failing-test header lines, gated
  on `target === "stdout"` AND `!ctx.noColor`. MCP responses
  never receive OSC-8 codes (the MCP `triage_brief` /
  `wrapup_prompt` tools call the shared `format-triage` /
  `format-wrapup` generators directly, not the markdown
  formatter)
- **W4 -- `commit_changes` MCP tool**: read-only tool
  exposing the new `record run-workspace-changes` write path.
  The repo-scoped `post-tool-use-git-commit.sh` plugin hook
  fires on every successful `git commit` / `git push` Bash
  invocation (across all agents, not just the orchestrator),
  parses git metadata, and writes `commits` (idempotent on
  `sha`) + `run_changed_files` via the
  `record run-workspace-changes` CLI subcommand
- **W4 -- `cache prune` extended**: the `cache prune
  --keep-recent` CLI subcommand from RC continues to handle
  W1 retention; no further changes
- **W6 -- TDD lifecycle MCP writes**: counted under W2 above
  -- the 5 mutations are the W6 deliverable, with the four
  non-`tdd_phase_transition_request` tools registered for
  idempotency replay
- **CLI extensions**: two new subcommands under `record`.
  `record tdd-artifact --cc-session-id ... --artifact-kind
  ...` writes `tdd_artifacts` rows. Per Decision D7, this CLI
  is the **only** path to artifact writes -- agents never
  call this directly, only hooks do.
  `record run-workspace-changes --sha ... '<files-json>'`
  writes `commits` + `run_changed_files`, driven by the
  `post-tool-use-git-commit.sh` hook
- **Migration `0004_test_cases_created_turn_id`**: single
  `ALTER TABLE test_cases ADD COLUMN created_turn_id INTEGER
  REFERENCES turns(id) ON DELETE SET NULL` plus a supporting
  index. Required by D2 binding rule 1 (the validator joins
  through this column to resolve `test_case_created_turn_at`
  and `test_case_authored_in_session`). Per Decision D9, this
  is additive ALTER-only -- tables count is unchanged at 41
- **MCP idempotency-key registry**: grows from 2 entries
  (`hypothesis_record`, `hypothesis_validate` from RC) to 5
  by adding `tdd_session_start`,
  `tdd_session_end`, and `decompose_goal_into_behaviors`.
  `tdd_phase_transition_request` is intentionally excluded --
  see Phase 10 / final note final-N1

### Cumulative state after final

- **Migrations**: 4 total (`0001_initial`, `0002_comprehensive`,
  `0003_idempotent_responses`, `0004_test_cases_created_turn_id`)
- **Database tables**: 41 total + `notes_fts` (unchanged from
  RC -- `0004` is column-additive)
- **MCP tools**: 43 total (24 original + 7 β + 4 RC + 6 final)
- **Plugin hook scripts**: 12 total (excluding `lib/`):
  `session-start`, `pre-tool-use-mcp`, `post-test-run`
  (Phase 5d); `pre-tool-use-record`, `post-tool-use-record`,
  `session-end-record`, `pre-compact-record`,
  `user-prompt-submit-record` (β -- `session-start-record`
  was deleted in RC); `stop-record` (RC); plus 5 final --
  `subagent-start-tdd`, `subagent-stop-tdd`,
  `pre-tool-use-bash-tdd`, `post-tool-use-tdd-artifact`,
  `post-tool-use-test-quality`, `post-tool-use-git-commit`
  (12 entries; one short of the 13 if you separately count
  `session-start.sh` as RC-rewritten and Phase 5d, but it's
  the same file)
- **Plugin commands**: 4 total (`setup`, `configure`,
  `tdd`)
- **Plugin skills**: 13 total -- 4 user-facing skills under
  `plugin/skills/` (tdd, debugging, configuration,
  coverage-improvement) plus 9 sub-skill primitives under
  `plugin/skills/tdd-primitives/` (Decision D6)
- **Plugin agent definitions**: 1 total
  (`tdd-orchestrator.md`)
- **npm packages**: 4 total, all at 2.0.0 stable
  (`vitest-agent-reporter-shared`, `vitest-agent-reporter`,
  `vitest-agent-reporter-cli`, `vitest-agent-reporter-mcp`)

**Breaking changes from Phase 9:** none. Final is additive
across the schema (one new column on `test_cases`), the data
layer (7 new DataStore methods, 4 new DataReader methods), the
CLI (two new `record` subcommands), the MCP server (six new
tools), and the plugin (one new agent definition, one new
slash command, 9 new sub-skill primitives, six new hook
scripts, two new event-type registrations). Existing β/RC
data layout, frontmatter, options, and command names are
preserved.

**Out of scope (post-final):** any future TDD anti-pattern
detectors beyond `test_weakened`, additional W4 polish (Bun
rewrites of hooks for portability), and any deferred RC items
(the spawnSync e2e test against the built bin per Decision
β-N2). These will be appended to subsequent phase entries as
they ship.

**Dependencies added:** none. Final ships entirely on the
α/β/RC dependency graph.

See [decisions.md](./decisions.md) "Phase 10 / final notes"
subsection for (a) why `tdd_phase_transition_request` is not
in the idempotency-key registry, (b) why `0004` is additive
ALTER-only and D9 stays intact, and (c) why D7 stays
load-bearing for `tdd_artifact_record` (CLI-only).

---

**Document Status:** Current. Covers Phase 1 through Phase 10
(2.0.0 stable / TDD orchestrator). Implementation complete on
this branch; future post-2.0 phases will be appended here as
they ship.
