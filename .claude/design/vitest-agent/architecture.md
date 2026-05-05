---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-05-05
last-synced: 2026-05-05
completeness: 95
# Note: doc set lives at .claude/design/vitest-agent/ as of branch
# refactor/2-0-0-package-rename. Frontmatter `module` retains the
# legacy "vitest-agent-reporter" value so design.config.json doesn't
# need to move; the npm package "vitest-agent-reporter" is now one of
# five workspaces (see Overview).
related:
  - ./components.md
  - ./decisions.md
  - ./data-structures.md
  - ./testing-strategy.md
dependencies: []
---

# Vitest LLM Reporter - Architecture

A Vitest reporter that outputs structured terminal/markdown output to console
and persistent data to a SQLite database for LLM coding agents, with optional
GFM output for GitHub Actions check runs, a CLI bin for on-demand test
landscape queries, an MCP server for tool-based agent integration, an output
pipeline with pluggable formatters, and Effect-based service architecture
for testability.

## Progressive Loading

This architecture documentation is split across focused sub-documents. Load
only what you need for the task at hand.

| Document | Load when... | Content |
| -------- | ------------ | ------- |
| [components.md](./components.md) | Working on specific components, need API details | Component descriptions with interfaces and dependencies |
| [decisions.md](./decisions.md) | Need to understand "why" something was built a certain way | Architectural decisions, design patterns, constraints/trade-offs |
| [data-structures.md](./data-structures.md) | Working with schemas, DB schema, output, or data flow | File structure, TypeScript interfaces, SQLite schema, XDG data layout, config file schema, data flow diagrams, integration points |
| [testing-strategy.md](./testing-strategy.md) | Writing tests, reviewing test coverage, or checking testing patterns | Current test patterns, coverage targets, per-project test counts, integration test targets |

---

## Overview

`vitest-agent` ships as **five coordinated pnpm workspaces** under
`packages/`. The split lets the MCP server, the plugin, and the
named-reporter implementations version independently while sharing one
schema/data-layer/contract surface:

| Package | Path | Role |
| --- | --- | --- |
| `vitest-agent-sdk` | `packages/sdk/` | Effect Schema, SQLite migrations, errors, `DataStore`/`DataReader` services + live layers, all pipeline services (Environment/Executor/Format/Detail/OutputRenderer) and live layers, History/ProjectDiscovery, Logger, formatters, utilities, the XDG path-resolution stack (`AppDirs`, ConfigFile, WorkspaceDiscovery, `resolveDataPath`), the `lib/` markdown generators (`format-triage`, `format-wrapup`), and the public **reporter contract types** (`contracts/reporter.ts`: `ResolvedReporterConfig`, `ReporterKit`, `ReporterRenderInput`, `VitestAgentReporter`, `VitestAgentReporterFactory`). No internal dependencies. |
| `vitest-agent-plugin` | `packages/plugin/` | The Vitest plugin + the internal `AgentReporter` Vitest-API class + `ReporterLive` + `CoverageAnalyzer` + reporter-side utilities (`build-reporter-kit`, `route-rendered-output`, `process-failure`, `capture-env`, `capture-settings`, `resolve-thresholds`, `strip-console-reporters`). Owns the Vitest lifecycle, persistence, classification, baselines, and trends. Delegates rendering to a user-supplied `VitestAgentReporterFactory` (defaults to `defaultReporter` from `vitest-agent-reporter`). Declares `vitest-agent-reporter`, `vitest-agent-cli`, and `vitest-agent-mcp` as required `peerDependencies`. No bin entries. |
| `vitest-agent-reporter` | `packages/reporter/` | Named `VitestAgentReporterFactory` implementations only — no Vitest-API code. Exports `defaultReporter` (env-aware composition that picks a primary reporter from `kit.config.format` and adds `githubSummaryReporter` as a sidecar under GitHub Actions) plus the focused single-formatter factories `markdownReporter`, `terminalReporter`, `jsonReporter`, `silentReporter`, `ciAnnotationsReporter`, and `githubSummaryReporter`. Each named reporter wraps exactly one shared `Formatter`. Depends on shared. No bin entries. |
| `vitest-agent-cli` | `packages/cli/` | `vitest-agent` bin (`@effect/cli`-based) with `status`, `overview`, `coverage`, `history`, `trends`, `cache` (incl. `prune`), `doctor`, `record` (with `turn`, `session-start`, `session-end`, `tdd-artifact`, `run-workspace-changes` actions), `triage`, and `wrapup` subcommands. Owns `CliLive`. |
| `vitest-agent-mcp` | `packages/mcp/` | `vitest-agent-mcp` bin (`@modelcontextprotocol/sdk` + tRPC) exposing 50 tools to LLM agents (including the 10 goal/behavior CRUD tools added in 2.0), plus four MCP resources under two URI schemes (`vitest://docs/{+path}` for the vendored Vitest documentation snapshot at `packages/mcp/vendor/vitest-docs/` and `vitest-agent://patterns/{slug}` for the curated patterns library at `packages/mcp/patterns/`) and six framing-only prompts (`triage`, `why-flaky`, `regression-since-pass`, `explain-failure`, `tdd-resume`, `wrapup`). Owns the tRPC idempotency middleware, the resources/prompts registrars, the vendor snapshot fetch script, and `McpLive`. |

Examples live under `examples/*` (included as a sixth Vitest project for
integration coverage). The `plugin/` directory is the file-based
Claude Code plugin and is NOT a pnpm workspace.

### Core capabilities

- **Plugin and pluggable reporters** -- `AgentPlugin` (in
  `vitest-agent`) injects the internal `AgentReporter` Vitest-API
  class via `configureVitest` with environment-aware behavior,
  per-project isolation via `projectFilter`, and native coverage
  table suppression in agent/own mode. `AgentReporter` owns the
  Vitest lifecycle hooks (Vitest >= 4.1.0), runs the persistence /
  classification / baseline / trend pipeline, and then delegates
  rendering to a user-supplied `VitestAgentReporterFactory` (default
  `defaultReporter` from `vitest-agent-reporter`). The factory
  receives a `ReporterKit` (resolved config + `stdEnv` + `stdOsc8`)
  and returns one or more `VitestAgentReporter`s; each reporter's
  `RenderedOutput[]` is concatenated and routed by target (`stdout`
  / `github-summary` / `file`). On each test error the plugin walks
  Vitest stack frames, source-maps the top non-framework frame, runs
  `findFunctionBoundary` on the resolved source, computes a stable
  failure signature, and persists `failure_signatures` plus per-frame
  source-mapped/function-boundary line columns.
- **CLI** -- `vitest-agent` bin with `status`, `overview`,
  `coverage`, `history`, `trends`, `cache` (incl. `cache prune
  --keep-recent` for turn-history retention), `doctor`, `record`
  (with five actions: `turn`, `session-start`, `session-end`,
  `tdd-artifact`, `run-workspace-changes`), `triage` (orientation
  brief), and `wrapup` (interpretive prompt-injection nudges)
  subcommands. All commands support `--format` for output format
  selection. The read-side commands query cached data on demand;
  the `record` actions are driven by plugin hook scripts.
- **Failure history and classification** -- per-test failure
  persistence with a 10-entry sliding window, classifying tests as
  `stable`, `new-failure`, `persistent`, `flaky`, or `recovered` for
  regression vs flake detection.
- **Coverage thresholds, baselines, and trends** -- Vitest-native
  `coverageThresholds` format, aspirational `coverageTargets`,
  auto-ratcheting baselines toward targets, per-project coverage
  trends with a 50-entry sliding window, and tiered console output
  (green/yellow/red) keyed to run health.
- **SQLite persistence + Effect services + output pipeline** -- a
  43-table normalized SQLite database via `@effect/sql-sqlite-node`,
  Effect services for all I/O (DataStore, DataReader, etc.) with
  live and test layers, and a 5-stage output pipeline
  (EnvironmentDetector -> ExecutorResolver -> FormatSelector ->
  DetailResolver -> OutputRenderer) with built-in formatters
  (`terminal`, `markdown`, `gfm`, `json`, `silent`, plus the
  GitHub-Actions-only `ci-annotations`).
- **Session, turn, TDD, and hypothesis tracking** -- Claude Code
  conversations are recorded as `sessions` rows; per-session
  `turns` capture user prompts, tool calls, tool results, file
  edits, hook fires, notes, and hypotheses (validated against the
  `TurnPayload` Effect Schema discriminated union). TDD lifecycle
  state lives in `tdd_sessions`, `tdd_session_goals` (2.0),
  `tdd_session_behaviors` (reshaped in 2.0),
  `tdd_behavior_dependencies` (2.0 junction table), `tdd_phases`,
  and `tdd_artifacts`, organized as a three-tier
  Objective→Goal→Behavior hierarchy. Phase transitions are gated by
  the pure `validatePhaseTransition` evidence-binding validator;
  `tdd_phase_transition_request` adds goal/behavior membership
  pre-checks in 2.0 and auto-promotes behavior status on accept.
- **MCP server and Claude Code plugin** -- 50 MCP tools via tRPC
  router with stdio transport, including read-only query tools
  (status/overview/coverage/history/trends/errors/etc.), discovery
  tools (project/test/module/suite/settings listing), note CRUD,
  session/turn/TDD/hypothesis reads, the orientation triage brief,
  the wrap-up prompt, hypothesis writes, TDD session lifecycle
  writes, the 10 goal/behavior CRUD tools added in 2.0, and
  workspace commit history. The MCP server **also exposes content
  surfaces** registered directly with `@modelcontextprotocol/sdk`
  (alongside the tRPC tool router): four resources under two URI
  schemes — `vitest://docs/` (index) + `vitest://docs/{+path}`
  (page) for the vendored upstream Vitest documentation snapshot at
  `packages/mcp/vendor/vitest-docs/`, and `vitest-agent://patterns/`
  (index) + `vitest-agent://patterns/{slug}` (page) for the
  curated testing patterns library at `packages/mcp/patterns/`
  — plus six framing-only prompts (`triage`, `why-flaky`,
  `regression-since-pass`, `explain-failure`, `tdd-resume`,
  `wrapup`) that emit small templated user messages without
  pre-fetching any tool data on the server. Resource and prompt
  registrars live in `packages/mcp/src/resources/index.ts` and
  `packages/mcp/src/prompts/index.ts`; `server.ts` calls
  `registerAllResources(server)` and `registerAllPrompts(server)`
  before the `StdioServerTransport` setup. Vendor + patterns trees
  are copied into `dist/dev/` and `dist/npm/` via
  `packages/mcp/scripts/copy-vendor-to-dist.mjs` (postbuild step
  invoked by both `build:dev` and `build:prod`); the snapshot is
  refreshed via `pnpm run update-vitest-snapshot --tag <vN.M.K>`
  (zero-deps `execFileSync`-based git-clone fetcher at
  `packages/mcp/scripts/update-vitest-snapshot.mjs`) and the
  `update-vitest-snapshot` Claude Code skill. The file-based
  Claude Code plugin at `plugin/` ships a PM-detect-and-spawn
  loader, lifecycle hooks (session/turn capture, interpretive
  nudges, TDD orchestrator scoping, anti-pattern detection,
  git-commit recording), the TDD orchestrator subagent definition
  (`plugin/agents/tdd-orchestrator.md`), the `/tdd <goal>` slash
  command, sub-skill primitives (including the new
  `update-vitest-snapshot` skill), and two `PreToolUse` hooks:
  `pre-tool-use-mcp.sh` auto-allows the non-destructive MCP tools,
  and `pre-tool-use-tdd-restricted.sh` (2.0) denies
  `tdd_goal_delete` / `tdd_behavior_delete` / `tdd_artifact_record`
  for the orchestrator subagent specifically.

The repository is a pnpm monorepo with five publishable workspaces
under `packages/` (`sdk`, `plugin`, `reporter`, `cli`, `mcp`) plus
`examples/*` for integration coverage. The `plugin/` directory
contains the Claude Code plugin (NOT a pnpm workspace). The root
`vitest.config.ts` imports the plugin from
`./packages/plugin/src/plugin.js` and runs six named Vitest projects
(one per package plus `example-basic`).

---

## Key Design Principles

- **Five-package split with shared data layer** -- the schema,
  migrations, errors, services, formatters, utilities, the XDG
  path-resolution stack, the `lib/` markdown generators, and the
  public reporter contract types live in `vitest-agent-sdk`.
  `vitest-agent-plugin` (plugin + lifecycle), `vitest-agent-reporter`
  (named reporter factories), `vitest-agent-cli`, and
  `vitest-agent-mcp` each depend on the shared package and are
  released in lockstep. `vitest-agent-plugin` declares
  `vitest-agent-reporter`, the CLI, and the MCP packages as required
  `peerDependencies` so the default reporter and the agent tooling
  story are always installed alongside the plugin.
- **Reporter contract: plugin owns lifecycle, reporter owns
  rendering** -- the `VitestAgentReporter` contract has a single
  synchronous `render(input: ReporterRenderInput)` method returning
  `ReadonlyArray<RenderedOutput>`. The plugin assembles the input
  (`reports` per project + a flat `Map<fullName, TestClassification>`
  - optional `trendSummary`) after persistence completes, hands the
  reporter a `ReporterKit` of plugin-resolved primitives (resolved
  config, `stdEnv`, pre-bound `stdOsc8`), and routes whatever
  `RenderedOutput[]` the reporter returns. The factory may return an
  array of reporters so multi-target outputs (e.g. console markdown
  plus GitHub Step Summary) compose without bespoke plugin support.
- **Deterministic XDG-based data path** -- the SQLite database
  lives at `$XDG_DATA_HOME/vitest-agent/<workspaceKey>/data.db`
  (falling back to `~/.local/share/...`). `<workspaceKey>` is
  derived from the root `package.json` `name` via `WorkspaceDiscovery`
  from `workspaces-effect` and normalized via
  `normalizeWorkspaceKey` (`@org/pkg` -> `@org__pkg`). Optional
  `vitest-agent.config.toml` overrides via `cacheDir` (full
  path) or `projectKey` (key segment). Programmatic
  `reporter.cacheDir` is highest precedence. The path is a function
  of identity, not filesystem layout.
- **Fail-loud on missing workspace identity** -- if no `projectKey`
  override is set and the root workspace has no `name` field,
  `resolveDataPath` raises `WorkspaceRootNotFoundError` instead of
  silently falling back to a path hash. Silent fallbacks would make
  the DB location depend on filesystem layout instead of identity.
- **Effect service architecture** -- all I/O and shared logic
  encapsulated in Effect services (DataStore, DataReader,
  CoverageAnalyzer, ProjectDiscovery, EnvironmentDetector,
  HistoryTracker, ExecutorResolver, FormatSelector, DetailResolver,
  OutputRenderer, VitestAgentReporterConfigFile) with live and test
  layer implementations for dependency injection.
- **SQLite-first persistence** -- all test data stored in a
  normalized SQLite database (`data.db`) using
  `@effect/sql-sqlite-node` with migration-based schema management.
  43 tables plus `notes_fts` for FTS5 note search.
- **Process-level migration coordination** --
  `ensureMigrated(dbPath)` serializes SQLite migrations across
  reporter instances in the same process via a `globalThis`-keyed
  promise cache (`Symbol.for("vitest-agent/migration-promises")`).
  Required for multi-project Vitest configs sharing a single
  `data.db`, where concurrent migration attempts on a fresh database
  would otherwise hit `SQLITE_BUSY` because deferred-transaction
  write upgrades bypass SQLite's busy handler. Once migration
  completes, concurrent reads/writes work under WAL +
  better-sqlite3's 5s `busy_timeout`.
- **Per-project reporter isolation** -- in multi-project configs,
  the plugin creates a separate `AgentReporter` instance per project
  via `projectFilter`. Each reporter filters `testModules` to only
  its own project. Coverage dedup: only the first project
  (alphabetically) processes global coverage. `splitProject()`
  separates `project:subProject` for normalized storage.
- **Effect-based structured logging** -- `LoggerLive` layer factory
  provides NDJSON logging to stderr plus optional file logging via
  `Logger.zip`. Controlled by `logLevel`/`logFile` options with env
  var fallback (`VITEST_REPORTER_LOG_LEVEL`,
  `VITEST_REPORTER_LOG_FILE`). All 30+ DataStore/DataReader methods
  emit `Effect.logDebug` calls.
- **Four-environment detection** -- `EnvironmentDetector` identifies
  `agent-shell`, `terminal`, `ci-github`, `ci-generic` via
  `std-env`. The `ExecutorResolver` maps environments to executor
  roles (`human`, `agent`, `ci`) for output behavior decisions.
- **Pluggable output pipeline** -- five chained services
  (EnvironmentDetector -> ExecutorResolver -> FormatSelector ->
  DetailResolver -> OutputRenderer) determine format, detail level,
  and rendering. Built-in formatters: `terminal` (plain-text stdout
  with optional ANSI color and OSC-8 hyperlinks), `markdown`
  (Claude/MCP), `gfm` (GitHub step summary), `json`, `silent`, and
  `ci-annotations` (auto-selected when env=ci-github + executor=ci).
- **Three output targets** -- console output, SQLite database, and
  GFM for GitHub Actions (auto-detected via
  `process.env.GITHUB_ACTIONS`).
- **Effect Schema data structures** -- all report and manifest types
  are defined as Effect Schema definitions with `typeof Schema.Type`
  for TypeScript types, plus
  `Schema.decodeUnknown`/`Schema.encodeUnknown` for JSON
  encode/decode.
- **Duck-type istanbul** -- structural interface avoids hard peer
  dependency; works with both `v8` and `istanbul` coverage
  providers.
- **MCP-first agent integration** -- the MCP server exposes 50 tools
  via tRPC router, giving agents structured access to test data,
  coverage, history, trends, errors, per-file coverage, individual
  test details, note management, discovery queries, session/TDD/
  hypothesis read paths, the orientation triage brief, the wrap-up
  prompt, hypothesis writes, TDD session lifecycle writes, the 10
  goal/behavior CRUD tools added in 2.0 (the three-tier
  Objective→Goal→Behavior hierarchy), and workspace commit history
  -- all without parsing CLI output.
- **Hook-driven session/turn capture** -- shell hooks under
  `plugin/hooks/` (SessionStart, UserPromptSubmit, PreToolUse,
  PostToolUse, Stop, SessionEnd, PreCompact, SubagentStart,
  SubagentStop) call the `vitest-agent record` subcommand
  to write `sessions` and `turns` rows. Turn payloads are validated
  against the `TurnPayload` Effect Schema discriminated union before
  persistence. Interpretive hooks (`stop-record`,
  `session-end-record`, `pre-compact-record`,
  `user-prompt-submit-record`) additionally invoke `wrapup` to
  inject prompt-injection nudges.
- **Reporter-side failure signature capture** -- on each test error,
  `processFailure` walks Vitest stack frames, source-maps the top
  non-framework frame, runs `findFunctionBoundary` (TypeScript-aware
  via the `acorn-typescript` plugin), calls
  `computeFailureSignature`, then upserts `failure_signatures`
  (idempotent on `signature_hash`, with `occurrence_count` and
  `last_seen_at` updated on recurrence) and writes
  `test_errors.signature_hash` plus the `stack_frames`
  source-mapped/function-boundary line columns.
- **CLI-first overview** -- overview/status generated on-demand by
  the CLI, not on every test run. Keeps the reporter lean.
- **Three-level coverage model** -- Vitest-native
  `coverageThresholds` (enforced minimums), `coverageTargets`
  (aspirational goals), and auto-ratcheting baselines that advance
  high-water marks toward targets.
- **Coverage trends** -- per-project trend tracking with 50-entry
  sliding window, target-change detection via hash comparison,
  direction analysis.
- **Tiered console output** -- green (all pass, targets met), yellow
  (pass but below targets), red (failures/threshold violations/
  regressions) with progressively more detail at each tier.
- **TDD evidence binding** -- the pure `validatePhaseTransition`
  function gates phase transitions on three rules: (1) cited test
  was authored in the current phase window AND in the current
  session, (2) cited artifact's `behavior_id` matches the requested
  behavior when one is specified, (3) for `red→green` transitions
  the cited test wasn't already failing on main. Returns a
  discriminated `PhaseTransitionResult` with typed `DenialReason` +
  remediation hint.
- **MCP idempotency** -- a tRPC idempotency middleware wraps
  selected mutation tools so duplicate calls (from a flaky agent
  retry) replay the cached response with `_idempotentReplay: true`
  rather than double-writing. Six tools are registered for replay
  (2.0 update): `hypothesis_record`, `hypothesis_validate`,
  `tdd_session_start`, `tdd_session_end`, `tdd_goal_create`, and
  `tdd_behavior_create`. `decompose_goal_into_behaviors` was
  removed alongside the tool. `tdd_phase_transition_request` is
  intentionally excluded because its accept/deny is a function of
  mutable artifact-log state.

---

## Architecture Diagram

Package layout (the five pnpm workspaces under `packages/`):

```text
+-----------------------------------------------------------+
| vitest-agent-sdk (no internal deps)                       |
|   schemas, migrations, errors, DataStore/DataReader,      |
|   output pipeline services, HistoryTracker,               |
|   ProjectDiscovery, Logger, formatters, utilities,        |
|   XDG path stack (AppDirs, ConfigFile,                    |
|   WorkspaceDiscovery, resolveDataPath,                    |
|   PathResolutionLive, ConfigLive),                        |
|   lib/ markdown generators (format-triage,                |
|   format-wrapup), contracts/reporter.ts                   |
|   (ResolvedReporterConfig, ReporterKit,                   |
|    ReporterRenderInput, VitestAgentReporter,              |
|    VitestAgentReporterFactory)                            |
+-----------------------------------------------------------+
        ^            ^            ^            ^
        |            |            |            |
+----------------+ +-----------+ +---------+ +---------+
| plugin         | | reporter  | | cli     | | mcp     |
| plugin.ts,     | | named     | | bin:    | | bin:    |
| reporter.ts    | | factories | | vitest- | | vitest- |
| (internal      | | only:     | | agent   | | agent-  |
|  Vitest-API    | |  default, | | CliLive | | mcp     |
|  class),       | |  markdown,| |         | | McpLive |
| ReporterLive,  | |  terminal,| |         | |         |
| CoverageAnalyzr| |  json,    | |         | |         |
| build-reporter-| |  silent,  | |         | |         |
|   kit,         | |  ci-      | |         | |         |
| route-rendered-| |   annota- | |         | |         |
|   output,      | |   tions,  | |         | |         |
| process-failure| |  github-  | |         | |         |
| peerDeps:      | |  summary  | |         | |         |
|  reporter +    | | (each one | |         | |         |
|  cli + mcp     | |  formatter| |         | |         |
|  (required)    | |  factory) | |         | |         |
+----------------+ +-----------+ +---------+ +---------+

   AgentPlugin (configureVitest) -> internal AgentReporter
                                  +-- onInit (async): ensureDbPath
                                  +-- onCoverage: stash CoverageMap
                                  +-- onTestRunEnd:
                                      ensureMigrated -> processFailure
                                      per error -> writeFailureSignature
                                      + persistence (writeRun /
                                      writeModules / writeErrors / ...)
                                      + classify + baselines + trends
                                          |
                                          v
                                      Build ReporterKit
                                      (buildReporterKit)
                                          |
                                          v
                                      opts.reporter(kit) ->
                                      VitestAgentReporter[]
                                          |
                                      .render({ reports,
                                                classifications,
                                                trendSummary? })
                                          |
                                      RenderedOutput[]
                                      (concatenated)
                                          |
                                      routeRenderedOutput per entry
                                       |       |          |
                                       v       v          v
                                    stdout  GITHUB_     file
                                            STEP_SUMMARY (no-op)
                                    (and: data.db written above)

   CLI bin and MCP server bin both:
     resolveDataPath(projectDir) -> CliLive/McpLive(dbPath)
     read from data.db; CLI also writes session/turn/TDD/commit
     rows via record subcommands; MCP also writes notes,
     hypotheses (via idempotency middleware), and TDD lifecycle
     rows.

   Claude Code plugin (plugin/) spawns vitest-agent-mcp
     through the user's package manager via plugin/bin/mcp-server.mjs.
     Hook scripts capture session/turn data via the record CLI,
     emit prompt-injection nudges via the wrapup CLI, gate the
     TDD orchestrator's Bash tool, record TDD evidence artifacts
     on test runs and edits, scan for test-quality anti-patterns,
     and record git commits + run-changed files for the
     commit_changes MCP tool.
```

XDG data path resolution (`resolveDataPath`, `packages/sdk`).
Precedence, highest first:

1. `options.cacheDir` (programmatic, e.g. plugin's `reporter.cacheDir`)
   -> `<cacheDir>/data.db`
2. `cacheDir` from `vitest-agent.config.toml`
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
| AgentPlugin | `packages/plugin/src/plugin.ts` |
| Internal AgentReporter (Vitest-API class) | `packages/plugin/src/reporter.ts` |
| Reporter contract types | `packages/sdk/src/contracts/reporter.ts` (`ResolvedReporterConfig`, `ReporterKit`, `ReporterRenderInput`, `VitestAgentReporter`, `VitestAgentReporterFactory`) |
| Default reporter factory | `packages/reporter/src/default.ts` (env-aware composition; primary chosen from `kit.config.format`, GitHub Step Summary added as sidecar under GitHub Actions) |
| Named reporter factories | `packages/reporter/src/{markdown,terminal,json,silent,ci-annotations,github-summary}.ts` (each wraps one shared `Formatter`) |
| Reporter kit context helper | `packages/reporter/src/_kit-context.ts` (private `FormatterContext` builder shared by the named factories) |
| Effect Services (11) | `packages/sdk/src/services/` (10) + `packages/plugin/src/services/CoverageAnalyzer.ts` |
| DataStore + DataReader | `packages/sdk/src/services/DataStore.ts`, `packages/sdk/src/services/DataReader.ts` |
| CLI bin (`vitest-agent`) | `packages/cli/` |
| MCP server (`vitest-agent-mcp`) | `packages/mcp/` |
| Output pipeline | `packages/sdk/src/layers/OutputPipelineLive.ts` (5 services) |
| `ensureMigrated` | `packages/sdk/src/utils/ensure-migrated.ts` |
| XDG path resolution | `packages/sdk/src/utils/resolve-data-path.ts`, `packages/sdk/src/layers/PathResolutionLive.ts` |
| SQLite migrations | `packages/sdk/src/migrations/` (`0001_initial`, `0002_comprehensive`, `0003_idempotent_responses`, `0004_test_cases_created_turn_id`, `0005_failure_signatures_last_seen_at`) |
| Turn payload schemas | `packages/sdk/src/schemas/turns/` (7 payload `Schema.Struct` types + `TurnPayload` union) |
| Failure signature + function boundary | `packages/sdk/src/utils/failure-signature.ts`, `packages/sdk/src/utils/function-boundary.ts` (TypeScript-aware via `acorn-typescript`) |
| Phase-transition validator | `packages/sdk/src/utils/validate-phase-transition.ts` |
| Plugin failure-signature wiring | `packages/plugin/src/utils/process-failure.ts`, called from `packages/plugin/src/reporter.ts` |
| Plugin kit + routing utilities | `packages/plugin/src/utils/build-reporter-kit.ts` (constructs `ReporterKit`), `packages/plugin/src/utils/route-rendered-output.ts` (dispatches by target: `stdout` / `github-summary` / `file`) |
| `record` CLI subcommand | `packages/cli/src/commands/record.ts`, with five lib actions: `record-turn.ts`, `record-session.ts`, `record-tdd-artifact.ts`, `record-workspace-changes.ts` |
| Shared lib generators | `packages/sdk/src/lib/format-triage.ts`, `packages/sdk/src/lib/format-wrapup.ts` |
| CLI subcommands | `packages/cli/src/commands/{status,overview,coverage,history,trends,cache,doctor,record,triage,wrapup}.ts` |
| MCP tools | `packages/mcp/src/tools/` (one file per tool; the 6 note CRUD ops live in `notes.ts`, totaling 50 tools — 41 from prior work, plus 10 new TDD goal/behavior CRUD tools added in 2.0, minus 1 removed `decompose_goal_into_behaviors`) |
| MCP resources registrar | `packages/mcp/src/resources/index.ts` (`registerAllResources(server)` registers four resources: `vitest_docs_index`, `vitest_docs_page`, `vitest_agent_patterns_index`, `vitest_agent_pattern`) plus `paths.ts` (path-traversal-safe resolver), `upstream-docs.ts` / `patterns.ts` (per-scheme readers), `indexes.ts` (index renderers) |
| MCP prompts registrar | `packages/mcp/src/prompts/index.ts` (`registerAllPrompts(server)` registers six framing-only prompts: `triage`, `why-flaky`, `regression-since-pass`, `explain-failure`, `tdd-resume`, `wrapup`; one file per prompt) |
| Vendored Vitest docs snapshot | `packages/mcp/vendor/vitest-docs/` (10 entries including `manifest.json` with `tag` + `commitSha` + `capturedAt` and `ATTRIBUTION.md`; pinned at a specific upstream tag) |
| Curated patterns library | `packages/mcp/patterns/` (`_meta.json` index + per-pattern markdown files; three launch patterns: `testing-effect-services-with-mock-layers`, `testing-effect-schema-definitions`, `authoring-a-custom-vitest-agent-reporter`) |
| MCP build scripts | `packages/mcp/scripts/update-vitest-snapshot.mjs` (zero-deps `execFileSync`-based snapshot fetcher; invoked via `pnpm run update-vitest-snapshot --tag <vN.M.K>`), `packages/mcp/scripts/copy-vendor-to-dist.mjs` (postbuild copier invoked by `build:dev` and `build:prod` to mirror `vendor/` and `patterns/` into `dist/dev/` and `dist/npm/`) |
| tRPC idempotency middleware | `packages/mcp/src/middleware/idempotency.ts` (with `idempotentProcedure` + `idempotencyKeys` registry) |
| Plugin hooks | `plugin/hooks/{session-start,user-prompt-submit-record,pre-tool-use-mcp,pre-tool-use-record,pre-tool-use-bash-tdd,post-test-run,post-tool-use-record,post-tool-use-tdd-artifact,post-tool-use-test-quality,post-tool-use-git-commit,session-end-record,stop-record,pre-compact-record,subagent-start-tdd,subagent-stop-tdd}.sh` plus `lib/match-tdd-agent.sh`, `lib/detect-pm.sh`, `lib/hook-output.sh`, and `lib/safe-mcp-vitest-agent-ops.txt` |
| CI annotations formatter | `packages/sdk/src/formatters/ci-annotations.ts` |
| Terminal formatter | `packages/sdk/src/formatters/terminal.ts` |
| OSC-8 hyperlink utility | `packages/sdk/src/utils/hyperlink.ts` (`osc8(url, label, { enabled })`) |
| TDD orchestrator agent | `plugin/agents/tdd-orchestrator.md` |
| `/tdd` slash command | `plugin/commands/tdd.md` |
| TDD sub-skill primitives | `plugin/skills/{interpret-test-failure,derive-test-name-from-behavior,derive-test-shape-from-name,verify-test-quality,run-and-classify,record-hypothesis-before-fix,commit-cycle,revert-on-extended-red,decompose-goal-into-behaviors}/SKILL.md` |
| MCP snapshot maintenance skill | `plugin/skills/update-vitest-snapshot/SKILL.md` (guided workflow for bumping `packages/mcp/vendor/vitest-docs/` to a new upstream tag) |
| Claude Code Plugin | `plugin/` (manifest + zero-deps PM-detect loader at `plugin/bin/mcp-server.mjs`) |

---

## Current Limitations

- **No streaming** -- all output written post-run in `onTestRunEnd`,
  not streamed during execution.
- **Istanbul duck-typing** -- coverage integration relies on
  structural typing of istanbul's `CoverageMap`; unconventional
  providers may not work.
- **Convention-based source mapping** -- file-to-test mapping uses
  naming convention (strip `.test.`/`.spec.`); no import analysis
  yet.
- **Coverage not per-project** -- coverage data is shared across all
  projects (same CoverageMap attached to each project's report),
  though scoped coverage filters to relevant files within a project.
- **SQLite single-writer** -- WAL mode allows concurrent reads but
  writes are serialized. Not an issue for single test runs but may
  need attention for parallel test processes.
- **MCP server process lifetime** -- the MCP server is a long-running
  stdio process; database connections are held for the process
  lifetime via `ManagedRuntime`.
- **Standalone reporter usage removed in 2.0** -- 1.x users could
  `import { AgentReporter } from "vitest-agent-reporter"` and place
  the class directly in `vitest.config.reporters` without the
  plugin. After the plugin/reporter split, `vitest-agent-reporter`
  exports only named `VitestAgentReporterFactory` implementations
  and no Vitest-API class. Users must adopt `agentPlugin()` from
  `vitest-agent-plugin`. Documented as a 2.0 breaking change.
- **`route-rendered-output` `file` target is a no-op** -- the
  `RenderedOutput.target === "file"` branch is reserved for a future
  convention; current routing handles `stdout` and `github-summary`
  only.

---

## Quick Reference

**When to load sub-documents:**

- Modifying a component --> [components.md](./components.md)
- Understanding a design decision --> [decisions.md](./decisions.md)
- Working with data schemas or output format --> [data-structures.md](./data-structures.md)
- Writing or reviewing tests --> [testing-strategy.md](./testing-strategy.md)

For the per-project test count breakdown and coverage metrics, see
[testing-strategy.md](./testing-strategy.md).
