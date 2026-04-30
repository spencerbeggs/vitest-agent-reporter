---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-04-30
last-synced: 2026-04-30
post-phase5-sync: 2026-04-23
post-2-0-sync: 2026-04-29
post-rc-sync: 2026-04-30
post-final-sync: 2026-04-30
completeness: 95
related:
  - vitest-agent-reporter/components.md
  - vitest-agent-reporter/decisions.md
  - vitest-agent-reporter/data-structures.md
  - vitest-agent-reporter/testing-strategy.md
  - vitest-agent-reporter/phase-history.md
dependencies: []
---

# Vitest LLM Reporter - Architecture

A Vitest reporter that outputs structured markdown to console and persistent
data to a SQLite database for LLM coding agents, with optional GFM output for
GitHub Actions check runs, a CLI bin for on-demand test landscape queries, an
MCP server for tool-based agent integration, an output pipeline with pluggable
formatters, and Effect-based service architecture for testability.

## Progressive Loading

This architecture documentation is split across focused sub-documents. Load
only what you need for the task at hand.

| Document | Load when... | Content |
| -------- | ------------ | ------- |
| [components.md](./components.md) | Working on specific components, need API details | Component descriptions with interfaces and dependencies (incl. four-package layout, XDG path resolution, plugin spawn loader) |
| [decisions.md](./decisions.md) | Need to understand "why" something was built a certain way | Architectural decisions (incl. 2.0 four-package split, XDG path resolution, retired plugin file:// loader), design patterns, constraints/trade-offs |
| [data-structures.md](./data-structures.md) | Working with schemas, DB schema, output, or data flow | File structure across four packages, TypeScript interfaces, SQLite schema, XDG data layout, config file schema, data flow diagrams, integration points |
| [testing-strategy.md](./testing-strategy.md) | Writing tests, reviewing test coverage, or checking testing patterns | Current test patterns, coverage targets, per-project test counts, integration test targets |
| [phase-history.md](./phase-history.md) | Understanding implementation history or when a feature shipped | Chronological narrative of Phases 1-10 (2.0 restructure + 2.0.0-α comprehensive schema + 2.0.0-β substrate wiring + 2.0.0-RC substrate integration + 2.0.0 stable / TDD orchestrator) with breaking changes per phase |

---

## Overview

As of 2.0, `vitest-agent-reporter` ships as **four coordinated pnpm
workspaces** under `packages/` instead of a single package. The split lets
the MCP server and the reporter version independently while sharing one
schema/data-layer contract:

| Package | Path | Role |
| --- | --- | --- |
| `vitest-agent-reporter-shared` | `packages/shared/` | Effect Schema, SQLite migrations, errors, `DataStore`/`DataReader` services + live layers, all pipeline services (Environment/Executor/Format/Detail/OutputRenderer) and live layers, History/ProjectDiscovery, Logger, formatters, utilities, **and the new XDG path-resolution stack** (`AppDirs`, ConfigFile, WorkspaceDiscovery, `resolveDataPath`). No internal dependencies. |
| `vitest-agent-reporter` | `packages/reporter/` | The Vitest reporter + plugin + `ReporterLive` + `CoverageAnalyzer`. Depends on shared. Declares the CLI and MCP packages as required `peerDependencies`. No bin entries. |
| `vitest-agent-reporter-cli` | `packages/cli/` | `vitest-agent-reporter` bin (`@effect/cli`-based) with `status`, `overview`, `coverage`, `history`, `trends`, `cache` (β: + `prune`), `doctor`, (β) `record`, and (RC) `triage` + `wrapup` subcommands. Final adds two more `record` subcommands (`tdd-artifact`, `run-workspace-changes`). Depends on shared. Owns `CliLive`. |
| `vitest-agent-reporter-mcp` | `packages/mcp/` | `vitest-agent-reporter-mcp` bin (`@modelcontextprotocol/sdk` + tRPC). Depends on shared. Owns `McpLive`. β adds seven read-only tools over the α schema substrate; RC adds four more (`triage_brief`, `wrapup_prompt`, `hypothesis_record`, `hypothesis_validate`) plus a tRPC idempotency middleware. Final adds six more (`tdd_session_start`, `tdd_session_end`, `tdd_session_resume`, `decompose_goal_into_behaviors`, `tdd_phase_transition_request`, `commit_changes`) for 43 tools total. |

Examples live under `examples/*` (not pnpm workspaces by name, but
included as a fifth Vitest project for integration coverage). The
`plugin/` directory is the file-based Claude Code plugin and is NOT a
pnpm workspace.

### Six core capabilities

- **Reporter and plugin** -- `AgentReporter` (Vitest >= 4.1.0) writes
  structured markdown to console, persistent data to SQLite, and
  optional GFM to GitHub Actions check runs. `AgentPlugin` injects the
  reporter via `configureVitest` with environment-aware behavior, per-
  project isolation via `projectFilter`, and native coverage table
  suppression in agent/own mode.
- **CLI** -- `vitest-agent-reporter` bin with `status`, `overview`,
  `coverage`, `history`, `trends`, `cache`, and `doctor` subcommands,
  plus (2.0.0-β) a `record` subcommand with three actions
  (`record turn`, `record session-start`, `record session-end`)
  driven by the plugin hook scripts, plus (2.0.0-RC) a `triage`
  subcommand emitting the W3 orientation brief, a `wrapup`
  subcommand emitting the W5 wrap-up prompt, and a
  `cache prune --keep-recent` subcommand for W1 turn-history
  retention; final adds two more `record` actions
  (`record tdd-artifact` for hook-driven TDD evidence capture per
  Decision D7, `record run-workspace-changes` backing the
  `commit_changes` MCP tool). All commands support `--format` for
  output format selection. Reads cached test data on-demand for
  LLM-oriented test landscape queries.
- **Failure history and classification** -- per-test failure
  persistence with a 10-entry sliding window, classifying tests as
  `stable`, `new-failure`, `persistent`, `flaky`, or `recovered` for
  regression vs flake detection.
- **Coverage thresholds, baselines, and trends** -- Vitest-native
  `coverageThresholds` format, aspirational `coverageTargets`, auto-
  ratcheting baselines toward targets, per-project coverage trends
  with a 50-entry sliding window, and tiered console output
  (green/yellow/red) keyed to run health.
- **SQLite persistence + Effect services + output pipeline** --
  25-table normalized SQLite database via `@effect/sql-sqlite-node`,
  Effect services for all I/O (DataStore, DataReader, etc.) with live
  and test layers, and a 5-stage output pipeline
  (EnvironmentDetector -> ExecutorResolver -> FormatSelector ->
  DetailResolver -> OutputRenderer) with 4 built-in formatters
  (`markdown`, `gfm`, `json`, `silent`).

- **MCP server and Claude Code plugin** -- 43 MCP tools via tRPC
  router (24 from Phase 5/6 plus 7 read-only β tools:
  `session_list`, `session_get`, `turn_search`,
  `failure_signature_get`, `tdd_session_get`, `hypothesis_list`,
  `acceptance_metrics`; plus 4 RC tools: read-only `triage_brief`
  and `wrapup_prompt`, mutation `hypothesis_record` and
  `hypothesis_validate` -- routed through the tRPC idempotency
  middleware; plus 6 final tools: TDD lifecycle reads/writes
  `tdd_session_start`, `tdd_session_end`, `tdd_session_resume`,
  `decompose_goal_into_behaviors`, `tdd_phase_transition_request`
  -- the latter is the headline write but is **not** in the
  idempotency-key registry per Phase 10 / final notes -- plus
  read-only `commit_changes`), stdio transport. The file-based
  Claude Code plugin at `plugin/` ships a PM-detect-and-spawn
  loader, lifecycle hooks (incl. six β `record-*` hook scripts
  that emit session/turn rows via the CLI; RC adds a new
  `stop-record.sh` and upgrades three β record-only hooks --
  `session-end`, `pre-compact`, `user-prompt-submit` -- to
  record + interpretive prompt-injection nudges via the
  `wrapup` CLI; final adds five more orchestrator-scoped hooks
  (`subagent-start-tdd.sh`, `subagent-stop-tdd.sh`,
  `pre-tool-use-bash-tdd.sh`, `post-tool-use-tdd-artifact.sh`,
  `post-tool-use-test-quality.sh`) and one repo-scoped hook
  (`post-tool-use-git-commit.sh`)), the new TDD orchestrator
  agent definition (`plugin/agents/tdd-orchestrator.md`), the
  `/tdd <goal>` slash command (`plugin/commands/tdd.md`), the
  9 sub-skill primitives under `plugin/skills/tdd-primitives/`
  (Decision D6 standalone reuse), and a `PreToolUse` hook that
  auto-allows all 43 MCP tools.

For implementation history see [phase-history.md](./phase-history.md).

The repository is a pnpm monorepo with four publishable workspaces under
`packages/` (`shared`, `reporter`, `cli`, `mcp`) plus `examples/*` for
integration coverage. The `plugin/` directory contains the Claude Code
plugin (NOT a pnpm workspace). The root `vitest.config.ts` imports the
plugin from `./packages/reporter/src/plugin.js` and runs five named
Vitest projects (one per package plus `example-basic`).

---

## Key Design Principles

- **Four-package split with shared data layer (2.0)** -- the schema,
  migrations, errors, services, formatters, utilities, and the new XDG
  path-resolution stack live in `vitest-agent-reporter-shared`. The
  reporter (`vitest-agent-reporter`), CLI
  (`vitest-agent-reporter-cli`), and MCP server
  (`vitest-agent-reporter-mcp`) each depend on the shared package and
  are released in lockstep. The reporter declares the CLI and MCP
  packages as required `peerDependencies` so the agent tooling story is
  always installed alongside the reporter
- **Deterministic XDG-based data path (2.0)** -- the SQLite database
  lives at `$XDG_DATA_HOME/vitest-agent-reporter/<workspaceKey>/data.db`
  (falling back to `~/.local/share/...`). `<workspaceKey>` is derived
  from the root `package.json` `name` via `WorkspaceDiscovery` from
  `workspaces-effect` and normalized via `normalizeWorkspaceKey`
  (`@org/pkg` -> `@org__pkg`). Optional
  `vitest-agent-reporter.config.toml` overrides via `cacheDir` (full
  path) or `projectKey` (key segment). Programmatic
  `reporter.cacheDir` is highest precedence. **No more
  artifact-probing** of `node_modules/.vite/...` -- the path is a
  function of identity, not filesystem layout. Closes
  [issue #39](https://github.com/spencerbeggs/vitest-agent-reporter/issues/39)
- **Fail-loud on missing workspace identity** -- if no `projectKey`
  override is set and the root workspace has no `name` field,
  `resolveDataPath` raises `WorkspaceRootNotFoundError` instead of
  silently falling back to a path hash. Silent fallbacks make the DB
  location depend on filesystem layout instead of identity (the bug
  class 2.0 leaves behind)
- **Effect service architecture** -- all I/O and shared logic encapsulated
  in Effect services (DataStore, DataReader, CoverageAnalyzer,
  ProjectDiscovery, EnvironmentDetector, HistoryTracker, ExecutorResolver,
  FormatSelector, DetailResolver, OutputRenderer,
  VitestAgentReporterConfigFile) with live and test layer
  implementations for dependency injection
- **SQLite-first persistence** -- all test data stored in a normalized
  SQLite database (`data.db`) using `@effect/sql-sqlite-node` with
  migration-based schema management. The 2.0.0-α `0002_comprehensive`
  migration extends the original 25-table 1.x layout to 40 tables
  (plus `notes_fts`), adding session/turn logging, TDD lifecycle
  state, code-change context, hook execution data, and stable
  failure-signature tracking. Replaces the previous JSON file cache
- **Process-level migration coordination** -- `ensureMigrated(dbPath)`
  serializes SQLite migrations across reporter instances in the same
  process via a `globalThis`-keyed promise cache
  (`Symbol.for("vitest-agent-reporter/migration-promises")`). Required
  for multi-project Vitest configs sharing a single `data.db`, where
  concurrent migration attempts on a fresh database hit `SQLITE_BUSY`
  because deferred-transaction write upgrades bypass SQLite's busy
  handler. Once migration completes, concurrent reads/writes work under
  WAL + better-sqlite3's 5s `busy_timeout`
- **Per-project reporter isolation** -- in multi-project configs, the
  plugin creates a separate `AgentReporter` instance per project via
  `projectFilter`. Each reporter filters `testModules` to only its own
  project. Coverage dedup: only the first project (alphabetically)
  processes global coverage. `splitProject()` separates
  `project:subProject` for normalized storage
- **Effect-based structured logging** -- `LoggerLive` layer factory
  provides NDJSON logging to stderr plus optional file logging via
  `Logger.zip`. Controlled by `logLevel`/`logFile` options with env var
  fallback (`VITEST_REPORTER_LOG_LEVEL`, `VITEST_REPORTER_LOG_FILE`).
  All 30+ DataStore/DataReader methods emit `Effect.logDebug` calls
- **Four-environment detection** -- `EnvironmentDetector` identifies
  `agent-shell`, `terminal`, `ci-github`, `ci-generic` via `std-env`.
  The `ExecutorResolver` maps environments to executor roles (`human`,
  `agent`, `ci`) for output behavior decisions
- **Pluggable output pipeline** -- 5 chained services
  (EnvironmentDetector -> ExecutorResolver -> FormatSelector ->
  DetailResolver -> OutputRenderer) determine format, detail level, and
  rendering. 4 built-in formatters: `markdown`, `gfm`, `json`, `silent`
- **Three output targets** -- console markdown, SQLite database, and GFM
  for GitHub Actions (auto-detected via `process.env.GITHUB_ACTIONS`)
- **Effect Schema data structures** -- all report and manifest types are
  defined as Effect Schema definitions with `typeof Schema.Type` for
  TypeScript types, plus `Schema.decodeUnknown`/`Schema.encodeUnknown`
  for JSON encode/decode
- **Duck-type istanbul** -- structural interface avoids hard peer dependency;
  works with both `v8` and `istanbul` coverage providers
- **MCP-first agent integration** -- MCP server exposes 43 tools via
  tRPC router (24 from Phase 5/6 plus 7 β read-only tools surfacing
  α's session/turn/TDD/hypothesis/failure-signature substrate, plus
  4 RC tools, plus 6 final tools for TDD lifecycle reads/writes and
  `commit_changes`), giving agents structured access to test data,
  coverage, history, trends, errors, per-file coverage, individual
  test details, note management, discovery queries
  (project/test/module/suite/settings listing), session/TDD/hypothesis
  read paths, the W3 orientation triage brief, the W5 wrap-up
  prompt, hypothesis writes, TDD lifecycle writes, and workspace
  commit history -- all without parsing CLI output
- **Hook-driven session/turn capture (β)** -- six new `record-*`
  shell hooks under `plugin/hooks/` (SessionStart,
  UserPromptSubmit, PreToolUse, PostToolUse, SessionEnd,
  PreCompact) call the new `vitest-agent-reporter record`
  subcommand to write `sessions` and `turns` rows. Turn payloads
  are validated against α's `TurnPayload` Effect Schema
  discriminated union before persistence. β only records the data;
  RC's interpretive hooks add prompt-injection nudges on top
- **Reporter-side failure signature capture (β)** -- on each test
  error, `processFailure` walks Vitest stack frames, source-maps
  the top non-framework frame, runs `findFunctionBoundary`
  (TypeScript-aware via `acorn-typescript` plugin), calls
  `computeFailureSignature`, then upserts `failure_signatures` and
  writes `test_errors.signature_hash` and the `stack_frames`
  source-mapped/function-boundary line columns. Activates α's
  failure-signature schema
- **CLI-first overview** -- overview/status generated on-demand by CLI, not
  on every test run. Keeps the reporter lean
- **Three-level coverage model** -- Vitest-native `coverageThresholds`
  (enforced minimums), `coverageTargets` (aspirational goals), and
  auto-ratcheting baselines that advance high-water marks toward targets
- **Coverage trends** -- per-project trend tracking with 50-entry sliding
  window, target change detection via hash comparison, direction analysis
- **Tiered console output** -- green (all pass, targets met), yellow
  (pass but below targets), red (failures/threshold violations/regressions)
  with progressively more detail at each tier
- **Progressive enhancement** -- Phase 1 is a standalone reporter; Phase 2
  adds Effect services, CLI tooling, and hybrid mode; Phase 3 adds failure
  history; Phase 4 adds coverage thresholds, baselines, and trends; Phase 5
  adds SQLite, output pipeline, MCP server, and Claude Code plugin;
  Phase 6 (2.0) splits the monolith into four packages, replaces
  artifact-probing path resolution with deterministic XDG-based
  derivation, and rewrites the plugin's MCP loader to spawn the bin
  through the user's package manager; Phase 7 (2.0.0-α) lands the
  comprehensive 40-table SQLite schema with session/turn logging,
  TDD lifecycle, hypothesis tracking, and failure-signature
  primitives; Phase 8 (2.0.0-β) wires the α substrate into reporter
  failure-signature capture, the `record` CLI, six plugin hook
  scripts, and seven read-only MCP tools; Phase 9 (2.0.0-RC) adds
  the W3 orientation triage report (CLI + MCP), W5 interpretive
  hook nudges driven by a shared `format-wrapup` generator, W6
  hypothesis MCP write tools backed by a new tRPC idempotency
  middleware, and W4 cheap wins (`wrapup` CLI, `wrapup_prompt`
  MCP tool, `cache prune` CLI) -- all built on a single
  additive `0003_idempotent_responses` migration (41 tables
  total); Phase 10 (2.0.0 stable / final) lands the TDD
  orchestrator subagent (`plugin/agents/tdd-orchestrator.md` with
  the eight-state state machine and the iron-law system prompt),
  the `/tdd <goal>` slash command, the 9 sub-skill primitives
  (Decision D6 standalone reuse), six new MCP tools for TDD
  lifecycle reads/writes plus `commit_changes`, two new `record`
  CLI subcommands (`tdd-artifact` per Decision D7, plus
  `run-workspace-changes`), six new plugin hook scripts (five
  orchestrator-scoped, one repo-scoped for git commits), the
  `ci-annotations` shared formatter for GitHub Actions, the
  `osc8` shared utility for terminal hyperlinks, and a single
  additive `0004_test_cases_created_turn_id` migration (4
  migrations total, 41 tables unchanged) needed by D2 binding
  rule 1

---

## Architecture Diagram

Package layout (the four pnpm workspaces under `packages/`):

```text
+-----------------------------------------------------------+
| vitest-agent-reporter-shared (no internal deps)           |
|   schemas, migrations, errors, DataStore/DataReader,      |
|   output pipeline services, HistoryTracker,               |
|   ProjectDiscovery, Logger, formatters, utilities,        |
|   XDG path stack (AppDirs, ConfigFile,                    |
|   WorkspaceDiscovery, resolveDataPath,                    |
|   PathResolutionLive, ConfigLive)                         |
+-----------------------------------------------------------+
        ^                ^                  ^
        |                |                  |
+-----------------+ +-----------------+ +-----------------+
| reporter        | | cli             | | mcp             |
| reporter.ts,    | | bin: vitest-    | | bin: vitest-    |
| plugin.ts,      | | agent-reporter  | | agent-reporter- |
| ReporterLive,   | | CliLive         | | mcp             |
| CoverageAnalyzer| |                 | | McpLive         |
| peerDeps:       | |                 | |                 |
|   cli + mcp     | |                 | |                 |
|   (required)    | |                 | |                 |
+-----------------+ +-----------------+ +-----------------+

   AgentPlugin (configureVitest) -> AgentReporter
                                  +-- onInit (async): ensureDbPath
                                  +-- onCoverage: stash CoverageMap
                                  +-- onTestRunEnd:
                                      ensureMigrated -> writes ->
                                      OutputRenderer
                                          |       |          |
                                          v       v          v
                                       stdout   data.db   GITHUB_
                                                          STEP_SUMMARY
                                      (β) processFailure ->
                                          writeFailureSignature +
                                          test_errors.signature_hash

   CLI bin and MCP server bin both:
     resolveDataPath(projectDir) -> CliLive/McpLive(dbPath)
     read from data.db; MCP also writes notes via DataStore;
     (β) MCP exposes seven additional read-only tools over
     sessions/turns/TDD/hypothesis/failure-signature/metrics
     (RC) MCP adds four more tools: read-only triage_brief,
     wrapup_prompt + idempotent mutations hypothesis_record,
     hypothesis_validate (routed through the new tRPC
     idempotency middleware backed by mcp_idempotent_responses)

   CLI bin (β): record turn / session-start / session-end
     write sessions + turns rows under TurnPayload validation.
     Driven by plugin hook scripts.
   CLI bin (RC): triage / wrapup / cache prune subcommands
     emit the same markdown as the matching MCP tools (shared
     format-triage / format-wrapup generators in shared/lib).

   Claude Code plugin (plugin/) spawns vitest-agent-reporter-mcp
     through the user's package manager via plugin/bin/mcp-server.mjs.
     (β) Six record-* hook scripts (SessionStart, UserPromptSubmit,
     PreToolUse, PostToolUse, SessionEnd, PreCompact) invoke the
     CLI's record subcommand to capture session/turn data.
     (RC) session-start.sh rewritten to call triage CLI and emit
     hookSpecificOutput.additionalContext (β session-start-record.sh
     folded in). New stop-record.sh registered as Stop hook.
     session-end-record.sh, pre-compact-record.sh, and
     user-prompt-submit-record.sh upgraded from record-only to
     record + interpretive nudge via wrapup CLI.
     (final) New tdd-orchestrator subagent (plugin/agents/) +
     /tdd slash command (plugin/commands/tdd.md) + 9 sub-skill
     primitives (plugin/skills/tdd-primitives/). Five new
     orchestrator-scoped hooks: subagent-start-tdd.sh,
     subagent-stop-tdd.sh, pre-tool-use-bash-tdd.sh (Bash gate),
     post-tool-use-tdd-artifact.sh (records evidence),
     post-tool-use-test-quality.sh (test_weakened detection).
     One repo-scoped hook: post-tool-use-git-commit.sh (writes
     commits + run_changed_files). MCP adds 6 more tools (TDD
     lifecycle reads/writes + commit_changes) for 43 total.
```

XDG data path resolution (`resolveDataPath`, `packages/shared`).
Precedence, highest first:

1. `options.cacheDir` (programmatic, e.g. plugin's `reporter.cacheDir`)
   -> `<cacheDir>/data.db`
2. `cacheDir` from `vitest-agent-reporter.config.toml`
   -> `<cacheDir>/data.db`
3. `projectKey` from config TOML
   -> `<XDG data root>/<normalized projectKey>/data.db`
4. Workspace `name` via `WorkspaceDiscovery`
   -> `<XDG data root>/<normalized name>/data.db`
5. Fail with `WorkspaceRootNotFoundError`

For detailed lifecycle and data flow diagrams (reporter, CLI, MCP,
plugin spawn), see [data-structures.md](./data-structures.md).

---

## Component Summary

The most important components, with their canonical locations. See
[components.md](./components.md) for the full inventory.

| Component | Location |
| --------- | -------- |
| AgentReporter | `packages/reporter/src/reporter.ts` |
| AgentPlugin | `packages/reporter/src/plugin.ts` |
| Effect Services (11) | `packages/shared/src/services/` (10) + `packages/reporter/src/services/CoverageAnalyzer.ts` |
| DataStore + DataReader | `packages/shared/src/services/DataStore.ts`, `packages/shared/src/services/DataReader.ts` |
| CLI bin (`vitest-agent-reporter`) | `packages/cli/` |
| MCP server (`vitest-agent-reporter-mcp`) | `packages/mcp/` |
| Output pipeline | `packages/shared/src/layers/OutputPipelineLive.ts` (5 services) |
| `ensureMigrated` | `packages/shared/src/utils/ensure-migrated.ts` |
| XDG path resolution | `packages/shared/src/utils/resolve-data-path.ts`, `packages/shared/src/layers/PathResolutionLive.ts` |
| SQLite migrations | `packages/shared/src/migrations/0001_initial.ts` (1.x), `packages/shared/src/migrations/0002_comprehensive.ts` (2.0.0-α drop-and-recreate, 40 tables), `packages/shared/src/migrations/0003_idempotent_responses.ts` (2.0.0-RC additive, +1 table -> 41 total), `packages/shared/src/migrations/0004_test_cases_created_turn_id.ts` (2.0.0 final additive, +1 column -> 41 tables unchanged) |
| Turn payload schemas (2.0.0-α) | `packages/shared/src/schemas/turns/` (7 payload `Schema.Struct` types + `TurnPayload` union) |
| Failure signature + function boundary (2.0.0-α; TS-aware in β) | `packages/shared/src/utils/failure-signature.ts`, `packages/shared/src/utils/function-boundary.ts` (β: `acorn-typescript` plugin) |
| Phase-transition validator (2.0.0-α) | `packages/shared/src/utils/validate-phase-transition.ts` |
| Reporter failure-signature wiring (2.0.0-β) | `packages/reporter/src/utils/process-failure.ts`, called from `packages/reporter/src/reporter.ts` |
| `record` CLI subcommand (2.0.0-β) | `packages/cli/src/commands/record.ts`, `packages/cli/src/lib/record-turn.ts`, `packages/cli/src/lib/record-session.ts` |
| Plugin record hooks (2.0.0-β) | `plugin/hooks/{session-start-record,user-prompt-submit-record,pre-tool-use-record,post-tool-use-record,session-end-record,pre-compact-record}.sh` |
| β read-only MCP tools | `packages/mcp/src/tools/{session-list,session-get,turn-search,failure-signature-get,tdd-session-get,hypothesis-list,acceptance-metrics}.ts` |
| Shared lib generators (2.0.0-RC) | `packages/shared/src/lib/format-triage.ts`, `packages/shared/src/lib/format-wrapup.ts` |
| RC CLI subcommands (2.0.0-RC) | `packages/cli/src/commands/{triage,wrapup}.ts`, `cache prune` action in `packages/cli/src/commands/cache.ts` |
| RC MCP tools (2.0.0-RC) | `packages/mcp/src/tools/{triage-brief,wrapup-prompt,hypothesis-record,hypothesis-validate}.ts` |
| tRPC idempotency middleware (2.0.0-RC) | `packages/mcp/src/middleware/idempotency.ts` (with `idempotentProcedure` + `idempotencyKeys` registry) |
| RC interpretive hooks (2.0.0-RC) | `plugin/hooks/{session-start,stop-record}.sh` (new); `session-end-record,pre-compact-record,user-prompt-submit-record}.sh` (record + nudge) |
| Final CI annotations formatter | `packages/shared/src/formatters/ci-annotations.ts` (auto-selected when env=ci-github + executor=ci) |
| Final OSC-8 hyperlink utility | `packages/shared/src/utils/hyperlink.ts` (`osc8(url, label, { enabled })`) |
| Final CLI `record` subcommands | `packages/cli/src/lib/record-tdd-artifact.ts`, `packages/cli/src/lib/record-run-workspace-changes.ts` (registered under the existing `record.ts`) |
| Final MCP tools (TDD + commit) | `packages/mcp/src/tools/{tdd-session-start,tdd-session-end,tdd-session-resume,decompose-goal-into-behaviors,tdd-phase-transition-request,commit-changes}.ts` |
| Final TDD orchestrator agent | `plugin/agents/tdd-orchestrator.md` (eight-state state machine, iron-law system prompt, 9 inline sub-skill primitives) |
| Final `/tdd` slash command | `plugin/commands/tdd.md` |
| Final TDD sub-skill primitives (Decision D6) | `plugin/skills/tdd-primitives/{interpret-test-failure,derive-test-name-from-behavior,derive-test-shape-from-name,verify-test-quality,run-and-classify,record-hypothesis-before-fix,commit-cycle,revert-on-extended-red,decompose-goal-into-behaviors}/SKILL.md` |
| Final TDD plugin hooks | `plugin/hooks/{subagent-start-tdd,subagent-stop-tdd,pre-tool-use-bash-tdd,post-tool-use-tdd-artifact,post-tool-use-test-quality,post-tool-use-git-commit}.sh` |
| Claude Code Plugin | `plugin/` (manifest + zero-deps PM-detect loader at `plugin/bin/mcp-server.mjs`) |

---

## Current Limitations

- **No streaming** -- all output written post-run in `onTestRunEnd`, not
  streamed during execution
- **Istanbul duck-typing** -- coverage integration relies on structural
  typing of istanbul's `CoverageMap`; unconventional providers may not work
- **Convention-based source mapping** -- file-to-test mapping uses naming
  convention (strip `.test.`/`.spec.`); no import analysis yet
- **Coverage not per-project** -- coverage data is shared across all
  projects (same CoverageMap attached to each project's report), though
  scoped coverage filters to relevant files within a project
- **SQLite single-writer** -- WAL mode allows concurrent reads but writes
  are serialized. Not an issue for single test runs but may need attention
  for parallel test processes
- **MCP server process lifetime** -- the MCP server is a long-running
  stdio process; database connections are held for the process lifetime
  via `ManagedRuntime`

---

## Quick Reference

**When to load sub-documents:**

- Modifying a component --> [components.md](./components.md)
- Understanding a design decision --> [decisions.md](./decisions.md)
- Working with data schemas or output format --> [data-structures.md](./data-structures.md)
- Writing or reviewing tests --> [testing-strategy.md](./testing-strategy.md)
- Reviewing implementation history --> [phase-history.md](./phase-history.md)

For the per-project test count breakdown and coverage metrics, see
[testing-strategy.md](./testing-strategy.md).

Last updated: 2026-04-30
