---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-04-28
last-synced: 2026-04-28
post-phase5-sync: 2026-04-23
completeness: 95
related:
  - vitest-agent-reporter/components.md
  - vitest-agent-reporter/decisions.md
  - vitest-agent-reporter/data-structures.md
  - vitest-agent-reporter/testing-and-phases.md
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
| [components.md](./components.md) | Working on specific components, need API details | 25 component descriptions with interfaces and dependencies |
| [decisions.md](./decisions.md) | Need to understand "why" something was built a certain way | 27 architectural decisions, 9 design patterns, constraints/trade-offs |
| [data-structures.md](./data-structures.md) | Working with schemas, DB schema, output, or data flow | File structure, TypeScript interfaces, SQLite schema, output format, data flow diagrams, integration points |
| [testing-and-phases.md](./testing-and-phases.md) | Writing tests, reviewing test coverage, or checking phase status | 53 test files, test patterns, Phase 1-5 history |

---

## Overview

`vitest-agent-reporter` provides exports targeting LLM coding agents and CI
systems, implemented across five phases:

1. **`AgentReporter`** (Phase 1-2, COMPLETE) -- a Vitest `Reporter`
   (requires Vitest >= 3.2.0) that produces structured markdown to console,
   persistent data to a SQLite database, and optional GFM output for GitHub
   Actions check runs. Uses Effect services (DataStore, CoverageAnalyzer)
   for database I/O and coverage processing. In multi-project configs,
   each project gets its own reporter instance via `projectFilter`;
   coverage dedup ensures only the first project (alphabetically) processes
   global coverage data.
2. **`AgentPlugin`** (Phase 1-2-5, COMPLETE) -- a Vitest plugin (uses
   `configureVitest` hook from Vitest 3.1+ with `VitestPluginContext`
   types from `vitest/node`) that injects `AgentReporter` into the
   reporter chain with environment-aware behavior. Passes project name
   via `projectFilter` option so each reporter instance filters to its
   own project. Uses EnvironmentDetector Effect service backed by
   `std-env` for four-environment detection (`agent-shell`, `terminal`,
   `ci-github`, `ci-generic`). In agent/own mode, suppresses Vitest's
   native coverage text table by setting `coverage.reporter = []`.
3. **CLI bin** (Phase 2-4, COMPLETE) -- `vitest-agent-reporter` CLI via
   `@effect/cli` with `status`, `overview`, `coverage`, `history`,
   `trends`, `cache`, and `doctor` subcommands. Reads cached test data
   on-demand for LLM-oriented test landscape queries. All commands support
   `--format` flag for output format selection. Uses ProjectDiscovery
   and DataReader Effect services.
4. **Suggested actions & failure history** (Phase 3, COMPLETE) --
   actionable suggestions in console output and per-test failure persistence
   across runs for regression vs flake detection. Uses HistoryTracker Effect
   service with 10-entry sliding window. Classifies tests as new-failure,
   persistent, flaky, stable, or recovered. History rows stored in SQLite.
   CLI `history` command surfaces flaky and persistent failures.
5. **Coverage thresholds, baselines, and trends** (Phase 4, COMPLETE) --
   Vitest-native `coverageThresholds` format (per-metric, per-glob, negative
   numbers, `100` shorthand, `perFile`) replaces the single
   `coverageThreshold: number`. New `coverageTargets` option for aspirational
   goals. Auto-ratcheting baselines persist high-water marks and advance
   toward targets. Per-project coverage trends with 50-entry sliding window
   track direction over time. Tiered console output (green/yellow/red) adapts
   detail level to run health. CLI `trends`, `cache`, and `doctor` commands
   added.
6. **SQLite data layer, output pipeline, MCP server, Claude Code plugin**
   (Phase 5, COMPLETE) -- four sub-phases:
   - **5a: SQLite data layer** -- replaced JSON file cache with a 25-table
     normalized SQLite database (`data.db`) via `@effect/sql-sqlite-node`.
     `CacheWriter`/`CacheReader` services replaced by `DataStore`/`DataReader`.
     `CacheError` replaced by `DataStoreError`. `ReporterLive` and `CliLive`
     are now functions of `dbPath`. Migration-based schema management.
   - **5b: Output pipeline** -- 5 new Effect services forming a pluggable
     output pipeline: `EnvironmentDetector`, `ExecutorResolver`,
     `FormatSelector`, `DetailResolver`, `OutputRenderer`. Four-environment
     detection (`agent-shell`, `terminal`, `ci-github`, `ci-generic`)
     replaces three-environment model. 4 built-in formatters: `markdown`,
     `gfm`, `json`, `silent`. `--format` flag on all CLI commands.
   - **5c: MCP server** -- tRPC router with `@modelcontextprotocol/sdk`
     stdio transport. 24 MCP tools for help, test status, coverage,
     history, trends, errors, test-for-file, test-get, file-coverage,
     run_tests, cache health, configure, full note CRUD, and discovery
     tools (project/test/module/suite/settings listing). `McpLive`
     composition layer.
   - **5d: Claude Code plugin** -- file-based plugin at `plugin/`
     directory with `.claude-plugin/plugin.json` manifest, `.mcp.json`
     for MCP auto-registration, SessionStart and PostToolUse hooks,
     4 skills (TDD, debugging, configuration, coverage-improvement),
     and 2 commands (setup, configure).

The package complements Vitest's built-in `agent` reporter. The built-in
handles console noise suppression in-process; this package adds persistence
across runs via SQLite, coverage with uncovered line ranges and Vitest-native
threshold format, auto-ratcheting baselines toward aspirational targets,
coverage trend tracking, monorepo-aware data storage, GFM output for CI,
scoped coverage for partial test runs, MCP tool access to all test data,
and agent tooling for test discovery via the CLI.

The repository is structured as a pnpm monorepo with workspaces: `package`
(the publishable npm package) and `examples/*` (test projects for
integration testing). The `plugin/` directory contains the Claude Code
plugin (NOT a pnpm workspace). The root `vitest.config.ts` imports from
`./package/src/plugin.js`.

---

## Key Design Principles

- **Effect service architecture** -- all I/O and shared logic encapsulated
  in Effect services (DataStore, DataReader, CoverageAnalyzer,
  ProjectDiscovery, EnvironmentDetector, HistoryTracker, ExecutorResolver,
  FormatSelector, DetailResolver, OutputRenderer) with live and test layer
  implementations for dependency injection
- **SQLite-first persistence** -- all test data stored in a normalized
  25-table SQLite database (`data.db`) using `@effect/sql-sqlite-node` with
  migration-based schema management. Replaces the previous JSON file cache
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
- **MCP-first agent integration** -- MCP server exposes 24 tools via
  tRPC router, giving agents structured access to test data, coverage,
  history, trends, errors, per-file coverage, individual test details,
  note management, and discovery queries (project/test/module/suite/
  settings listing) without parsing CLI output
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
  adds SQLite, output pipeline, MCP server, and Claude Code plugin

---

## Architecture Diagram

```text
                        vitest run
                            |
                            v
               +-----------------------------+
               |  AgentPlugin (optional)     |
               |  async configureVitest hook |
               |                             |
               |  1. EnvironmentDetector     |
               |     (std-env) -> env        |
               |  2. ExecutorResolver        |
               |     env -> executor         |
               |  3. Resolve cacheDir/dbPath |
               |  4. Resolve coverage thresh |
               |     + targets + autoUpdate  |
               |  5. Set coverage.reporter=[]|
               |     (suppress text table)  |
               |  6. Push AgentReporter     |
               |     w/ projectFilter       |
               +-----------+-----------------+
                           |
                           v
     +--------------------------------------------+
     |              AgentReporter                  |
     |     (Effect.runPromise + ReporterLive)      |
     |                                             |
     |  onInit(vitest)                             |
     |    +-- store vitest instance                |
     |    +-- captureSettings + captureEnvVars     |
     |    +-- DataStore.writeSettings()            |
     |                                             |
     |  onCoverage(coverage)                       |
     |    +-- stash istanbul CoverageMap           |
     |                                             |
     |  onTestRunEnd(modules, errors, reason)      |
     |    +-- await ensureMigrated(dbPath, ...)    |
     |        (process-level migration coord;      |
     |         globalThis-keyed promise cache)     |
     |    +-- filter modules by projectFilter     |
     |    +-- group modules by project.name        |
     |    +-- splitProject() for each group        |
     |    +-- CoverageAnalyzer.process/Scoped()    |
     |    +-- buildAgentReport() per project       |
     |    +-- attach unhandledErrors to ALL reports|
     |    +-- HistoryTracker.classify(outcomes)    |
     |    +-- attach classifications to TestReports|
     |    +-- DataStore.writeRun() per project     |
     |    +-- DataStore.writeModules/TestCases/etc |
     |    +-- DataStore.writeHistory() per test    |
     |    +-- DataStore.writeBaselines()           |
     |    +-- DataStore.writeTrends()              |
     |    +-- OutputRenderer.render() -> outputs   |
     |    +-- emit to stdout / GFM as appropriate  |
     +--------------------------------------------+
               |              |              |
               v              v              v
          +---------+  +--------------+  +----------+
          | stdout  |  |  cacheDir/   |  | GITHUB_  |
          | (md/    |  |  data.db     |  | STEP_    |
          |  json)  |  |  (SQLite)    |  | SUMMARY  |
          +---------+  +--------------+  +----------+
                              ^
                              |
     +--------------------------------------------+
     |           CLI Bin (on-demand)               |
     |     (NodeRuntime.runMain + CliLive)         |
     |                                             |
     |  status  -- per-project state from DB       |
     |  overview -- test landscape + file mapping  |
     |  coverage -- gap analysis from cached data  |
     |  history -- flaky/persistent failure trends |
     |  trends  -- coverage trend visualization    |
     |  cache   -- path / clean cache management   |
     |  doctor  -- cache health diagnostic         |
     |  --format flag on all commands              |
     |                                             |
     |  Uses: DataReader, ProjectDiscovery,        |
     |        HistoryTracker, OutputRenderer       |
     +--------------------------------------------+
                              ^
                              |
     +--------------------------------------------+
     |           MCP Server (stdio)                |
     |  (ManagedRuntime + McpLive + tRPC router)   |
     |                                             |
     |  24 tools via @modelcontextprotocol/sdk:    |
     |  help, test_status, test_overview,          |
     |  test_coverage, test_history, test_trends,  |
     |  test_errors, test_for_file, test_get,      |
     |  file_coverage, run_tests, cache_health,    |
     |  configure, project_list, test_list,        |
     |  module_list, suite_list, settings_list,    |
     |  note_create/list/get/update/delete/search  |
     |                                             |
     |  Uses: DataReader, DataStore,               |
     |        ProjectDiscovery, OutputRenderer     |
     +--------------------------------------------+
                              ^
                              |
     +--------------------------------------------+
     |     Claude Code Plugin (file-based)         |
     |     plugin/.claude-plugin/plugin.json       |
     |     (inline mcpServers config)              |
     |                                             |
     |  bin/mcp-server.mjs -> Node loader walks    |
     |    up to user's node_modules and dynamic    |
     |    imports the package's ./mcp export       |
     |  hooks/session-start.sh -> context inject   |
     |  hooks/post-test-run.sh -> test detection   |
     |  skills: TDD, debugging, configuration,     |
     |          coverage-improvement                |
     |  commands: setup, configure                 |
     +--------------------------------------------+
```

---

## Component Summary

| # | Component | Location | Status |
| - | --------- | -------- | ------ |
| 1 | AgentReporter | `package/src/reporter.ts` | COMPLETE |
| 2 | AgentPlugin | `package/src/plugin.ts` | COMPLETE |
| 3 | Effect Services (10) | `package/src/services/` | COMPLETE |
| 4 | Effect Layers | `package/src/layers/` | COMPLETE |
| 5 | Error Types | `package/src/errors/` | COMPLETE |
| 6 | Schemas | `package/src/schemas/` | COMPLETE |
| 7 | CLI Bin | `package/src/cli/` | COMPLETE |
| 8 | Formatters | `package/src/formatters/` | COMPLETE |
| 9 | Report Builder | `package/src/utils/build-report.ts` | COMPLETE |
| 10 | PM Detection | `package/src/utils/detect-pm.ts` | COMPLETE |
| 11 | Utilities | `package/src/utils/` | COMPLETE |
| 12 | Failure History | `package/src/services/HistoryTracker.ts`, `package/src/schemas/History.ts` | COMPLETE |
| 13 | Coverage Thresholds | `package/src/schemas/Thresholds.ts`, `package/src/utils/resolve-thresholds.ts` | COMPLETE |
| 14 | Coverage Baselines | `package/src/schemas/Baselines.ts` | COMPLETE |
| 15 | Coverage Trends | `package/src/schemas/Trends.ts`, `package/src/utils/compute-trend.ts` | COMPLETE |
| 16 | CLI Diagnostics | `package/src/cli/commands/doctor.ts`, `package/src/cli/commands/cache.ts`, `package/src/cli/commands/trends.ts` | COMPLETE |
| 17 | DataStore | `package/src/services/DataStore.ts`, `package/src/layers/DataStoreLive.ts` | COMPLETE |
| 18 | DataReader | `package/src/services/DataReader.ts`, `package/src/layers/DataReaderLive.ts` | COMPLETE |
| 19 | SQLite Migration | `package/src/migrations/0001_initial.ts` | COMPLETE |
| 20 | SQL Helpers | `package/src/sql/rows.ts`, `package/src/sql/assemblers.ts` | COMPLETE |
| 21 | Output Pipeline | `package/src/layers/OutputPipelineLive.ts` (5 services) | COMPLETE |
| 22 | MCP Server | `package/src/mcp/` | COMPLETE |
| 23 | tRPC Router | `package/src/mcp/router.ts` | COMPLETE |
| 24 | Claude Code Plugin | `plugin/` | COMPLETE |
| 25 | LoggerLive | `package/src/layers/LoggerLive.ts` | COMPLETE |
| 26 | ensureMigrated | `package/src/utils/ensure-migrated.ts` | COMPLETE |

**Removed in Phase 5:**

| Component | Former Location | Replaced By |
| --------- | --------------- | ----------- |
| CacheWriter | `package/src/services/CacheWriter.ts` | DataStore |
| CacheReader | `package/src/services/CacheReader.ts` | DataReader |
| CacheError | `package/src/errors/CacheError.ts` | DataStoreError |
| AgentDetection | `package/src/services/AgentDetection.ts` | EnvironmentDetector |
| Console Formatter | `package/src/utils/format-console.ts` | `package/src/formatters/markdown.ts` |
| GFM Formatter | `package/src/utils/format-gfm.ts` | `package/src/formatters/gfm.ts` |

For detailed component descriptions, interfaces, and APIs:
--> [components.md](./components.md)

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
- Writing or reviewing tests --> [testing-and-phases.md](./testing-and-phases.md)

**53 test files, 573 tests total.** All coverage metrics above 80%.

**Document Status:** Current -- reflects Phase 1 through Phase 5
implementation plus post-Phase-5 refinements (multi-project support,
structured logging, strategy rename, MCP option, coverage table
suppression, MCP discovery tools, source map wiring) and bug/startup
branch fixes (process-level migration coordination via
`ensureMigrated`, derived error messages with `extractSqlReason`,
plugin MCP loader with inline mcpServers config). All phases complete.
