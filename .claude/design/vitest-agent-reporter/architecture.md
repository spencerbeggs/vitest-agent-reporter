---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-04-29
last-synced: 2026-04-29
post-phase5-sync: 2026-04-23
post-2-0-sync: 2026-04-29
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
| [components.md](./components.md) | Working on specific components, need API details | Component descriptions with interfaces and dependencies (incl. four-package layout, XDG path resolution, plugin spawn loader) |
| [decisions.md](./decisions.md) | Need to understand "why" something was built a certain way | Architectural decisions (incl. 2.0 four-package split, XDG path resolution, retired plugin file:// loader), design patterns, constraints/trade-offs |
| [data-structures.md](./data-structures.md) | Working with schemas, DB schema, output, or data flow | File structure across four packages, TypeScript interfaces, SQLite schema, XDG data layout, config file schema, data flow diagrams, integration points |
| [testing-and-phases.md](./testing-and-phases.md) | Writing tests, reviewing test coverage, or checking phase status | Test patterns, Phase 1-5 history, Phase 6 (2.0 architectural restructure: XDG paths + package split) |

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
| `vitest-agent-reporter-cli` | `packages/cli/` | `vitest-agent-reporter` bin (`@effect/cli`-based). Depends on shared. Owns `CliLive`. |
| `vitest-agent-reporter-mcp` | `packages/mcp/` | `vitest-agent-reporter-mcp` bin (`@modelcontextprotocol/sdk` + tRPC). Depends on shared. Owns `McpLive`. |

Examples live under `examples/*` (not pnpm workspaces by name, but
included as a fifth Vitest project for integration coverage). The
`plugin/` directory is the file-based Claude Code plugin and is NOT a
pnpm workspace.

The package provides exports targeting LLM coding agents and CI systems,
implemented across six phases:

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
7. **2.0 architectural restructure** (Phase 6, COMPLETE) -- closes [issue
   #39][issue-39] by replacing the artifact-probing `resolveDbPath` with
   deterministic XDG-based resolution, splits the monolith into four
   packages (shared/reporter/cli/mcp), and rewrites the Claude Code
   plugin's MCP loader to detect-the-PM-and-spawn instead of walking
   `node_modules` and dynamic-importing via `file://` URL. Adopts
   `xdg-effect`, `config-file-effect`, and `workspaces-effect`. Default
   DB location is now
   `$XDG_DATA_HOME/vitest-agent-reporter/<workspaceKey>/data.db` (with
   `~/.local/share/...` fallback), where `<workspaceKey>` is the root
   `package.json` `name` normalized for filesystem safety
   (`@org/pkg` -> `@org__pkg`). Optional
   `vitest-agent-reporter.config.toml` overrides via
   `cacheDir`/`projectKey`. Decision 29 (plugin file:// loader) is
   retired; Decision 28 (`ensureMigrated`) remains in force after an
   investigation concluded `xdg-effect`'s `SqliteState.Live` would
   reintroduce the SQLITE_BUSY race. See Phase 6 in
   [testing-and-phases.md](./testing-and-phases.md).

[issue-39]: https://github.com/spencerbeggs/vitest-agent-reporter/issues/39

The package complements Vitest's built-in `agent` reporter. The built-in
handles console noise suppression in-process; this package adds persistence
across runs via SQLite, coverage with uncovered line ranges and Vitest-native
threshold format, auto-ratcheting baselines toward aspirational targets,
coverage trend tracking, monorepo-aware data storage, GFM output for CI,
scoped coverage for partial test runs, MCP tool access to all test data,
and agent tooling for test discovery via the CLI.

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
  adds SQLite, output pipeline, MCP server, and Claude Code plugin;
  Phase 6 (2.0) splits the monolith into four packages, replaces
  artifact-probing path resolution with deterministic XDG-based
  derivation, and rewrites the plugin's MCP loader to spawn the bin
  through the user's package manager

---

## Architecture Diagram

```text
+-----------------------------------------------------------+
| Package layout (4 pnpm workspaces under packages/)        |
|                                                           |
|   vitest-agent-reporter-shared (no internal deps)         |
|     - schemas, migrations, errors                         |
|     - DataStore, DataReader, output pipeline services     |
|     - HistoryTracker, ProjectDiscovery, Logger            |
|     - formatters, utilities                               |
|     - XDG path stack: AppDirs, ConfigFile,                |
|       WorkspaceDiscovery, resolveDataPath,                |
|       PathResolutionLive, ConfigLive                      |
|                                                           |
|   vitest-agent-reporter      depends on shared            |
|     - reporter.ts, plugin.ts                              |
|     - ReporterLive, CoverageAnalyzer                      |
|     - peerDeps: -cli + -mcp (required)                    |
|                                                           |
|   vitest-agent-reporter-cli  depends on shared            |
|     - bin: vitest-agent-reporter                          |
|     - CliLive                                             |
|                                                           |
|   vitest-agent-reporter-mcp  depends on shared            |
|     - bin: vitest-agent-reporter-mcp                      |
|     - McpLive                                             |
+-----------------------------------------------------------+

                        vitest run
                            |
                            v
               +-----------------------------+
               |  AgentPlugin (optional)     |
               |  (packages/reporter)        |
               |  async configureVitest hook |
               |                             |
               |  1. EnvironmentDetector     |
               |     (std-env) -> env        |
               |  2. ExecutorResolver        |
               |     env -> executor         |
               |  3. Resolve coverage thresh |
               |     + targets + autoUpdate  |
               |  4. Set coverage.reporter=[]|
               |     (suppress text table)  |
               |  5. Push AgentReporter     |
               |     w/ projectFilter +     |
               |     optional cacheDir      |
               +-----------+-----------------+
                           |
                           v
     +--------------------------------------------+
     |              AgentReporter                  |
     |     (Effect.runPromise + ReporterLive)      |
     |                                             |
     |  async onInit(vitest)                       |
     |    +-- store vitest instance                |
     |    +-- await ensureDbPath()                 |
     |        +-- if options.cacheDir set:         |
     |        |   mkdirSync + dbPath = it/data.db  |
     |        +-- else: resolveDataPath(cwd)       |
     |            via PathResolutionLive           |
     |            -> $XDG_DATA_HOME/               |
     |               vitest-agent-reporter/        |
     |               <workspaceKey>/data.db        |
     |                                             |
     |  onCoverage(coverage)                       |
     |    +-- stash istanbul CoverageMap           |
     |                                             |
     |  async onTestRunEnd(modules, errors, reason)|
     |    +-- await ensureDbPath() (defensive)     |
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
          | stdout  |  | $XDG_DATA_   |  | GITHUB_  |
          | (md/    |  | HOME/.../    |  | STEP_    |
          |  json)  |  | <wsKey>/     |  | SUMMARY  |
          |         |  | data.db      |  |          |
          +---------+  +--------------+  +----------+
                              ^
                              |
     +--------------------------------------------+
     |           CLI Bin (vitest-agent-reporter)   |
     |   (packages/cli, NodeRuntime.runMain)       |
     |                                             |
     |  resolveDataPath(cwd) via                   |
     |    PathResolutionLive                       |
     |  -> CliLive(dbPath, logLevel, logFile)      |
     |                                             |
     |  status / overview / coverage / history /   |
     |    trends / cache / doctor                  |
     |  --format flag on all commands              |
     |                                             |
     |  Uses: DataReader, ProjectDiscovery,        |
     |        HistoryTracker, OutputRenderer       |
     +--------------------------------------------+
                              ^
                              |
     +--------------------------------------------+
     |         MCP Server (stdio)                  |
     |     (vitest-agent-reporter-mcp bin,         |
     |      ManagedRuntime + McpLive + tRPC)       |
     |                                             |
     |  resolveProjectDir() ::=                    |
     |    VITEST_AGENT_REPORTER_PROJECT_DIR        |
     |    | CLAUDE_PROJECT_DIR                     |
     |    | process.cwd()                          |
     |  resolveDataPath(projectDir) via            |
     |    PathResolutionLive                       |
     |  -> ManagedRuntime.make(McpLive(dbPath))    |
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
     |     (inline mcpServers config invokes       |
     |      ${CLAUDE_PLUGIN_ROOT}/bin/             |
     |       mcp-server.mjs via "node")            |
     |                                             |
     |  bin/mcp-server.mjs (zero-deps Node):       |
     |    1. projectDir = CLAUDE_PROJECT_DIR       |
     |       || process.cwd()                      |
     |    2. detect PM (packageManager field       |
     |       or lockfile: pnpm-lock, bun.lock,     |
     |       yarn.lock, package-lock.json)         |
     |    3. spawn `<pm exec>                      |
     |       vitest-agent-reporter-mcp` with       |
     |       stdio:'inherit', cwd: projectDir,     |
     |       env: VITEST_AGENT_REPORTER_           |
     |            PROJECT_DIR=projectDir           |
     |    4. forward exit code; on non-zero,      |
     |       print PM-specific install hint        |
     |    5. re-raise termination signals          |
     |                                             |
     |  hooks/session-start.sh -> context inject   |
     |  hooks/post-test-run.sh -> test detection   |
     |  skills: TDD, debugging, configuration,     |
     |          coverage-improvement                |
     |  commands: setup, configure                 |
     +--------------------------------------------+

XDG data path resolution (resolveDataPath, packages/shared)
-----------------------------------------------------------
Precedence (highest first):
  1. options.cacheDir (programmatic, e.g. plugin's reporter.cacheDir)
     -> mkdirSync + <cacheDir>/data.db
  2. cacheDir from vitest-agent-reporter.config.toml
     -> <cacheDir>/data.db
  3. projectKey from config TOML
     -> AppDirs.ensureData / <normalized projectKey> / data.db
  4. Workspace name via WorkspaceDiscovery
     -> AppDirs.ensureData / <normalized name> / data.db
  5. fail with WorkspaceRootNotFoundError
```

---

## Component Summary

| # | Component | Location | Status |
| - | --------- | -------- | ------ |
| 1 | AgentReporter | `packages/reporter/src/reporter.ts` | COMPLETE |
| 2 | AgentPlugin | `packages/reporter/src/plugin.ts` | COMPLETE |
| 3 | Effect Services (11) | `packages/shared/src/services/` (10) + `packages/reporter/src/services/CoverageAnalyzer.ts` | COMPLETE |
| 4 | Effect Layers | `packages/shared/src/layers/` + `packages/reporter/src/layers/` (`ReporterLive`, `CoverageAnalyzerLive`) + `packages/cli/src/layers/CliLive.ts` + `packages/mcp/src/layers/McpLive.ts` | COMPLETE |
| 5 | Error Types | `packages/shared/src/errors/` (DataStoreError, DiscoveryError, **PathResolutionError**) | COMPLETE |
| 6 | Schemas | `packages/shared/src/schemas/` (incl. **`Config.ts`** for the TOML config file) | COMPLETE |
| 7 | CLI Bin | `packages/cli/` (own package) | COMPLETE |
| 8 | Formatters | `packages/shared/src/formatters/` | COMPLETE |
| 9 | Report Builder | `packages/shared/src/utils/build-report.ts` | COMPLETE |
| 10 | PM Detection | `packages/shared/src/utils/detect-pm.ts` (plus zero-deps inline copy in `plugin/bin/mcp-server.mjs`) | COMPLETE |
| 11 | Utilities | `packages/shared/src/utils/` (most) + `packages/reporter/src/utils/` (`capture-env.ts`, `capture-settings.ts`, `resolve-thresholds.ts`, `strip-console-reporters.ts`) | COMPLETE |
| 12 | Failure History | `packages/shared/src/services/HistoryTracker.ts`, `packages/shared/src/schemas/History.ts` | COMPLETE |
| 13 | Coverage Thresholds | `packages/shared/src/schemas/Thresholds.ts`, `packages/reporter/src/utils/resolve-thresholds.ts` | COMPLETE |
| 14 | Coverage Baselines | `packages/shared/src/schemas/Baselines.ts` | COMPLETE |
| 15 | Coverage Trends | `packages/shared/src/schemas/Trends.ts`, `packages/shared/src/utils/compute-trend.ts` | COMPLETE |
| 16 | CLI Diagnostics | `packages/cli/src/commands/doctor.ts`, `packages/cli/src/commands/cache.ts`, `packages/cli/src/commands/trends.ts` | COMPLETE |
| 17 | DataStore | `packages/shared/src/services/DataStore.ts`, `packages/shared/src/layers/DataStoreLive.ts` | COMPLETE |
| 18 | DataReader | `packages/shared/src/services/DataReader.ts`, `packages/shared/src/layers/DataReaderLive.ts` | COMPLETE |
| 19 | SQLite Migration | `packages/shared/src/migrations/0001_initial.ts` | COMPLETE |
| 20 | SQL Helpers | `packages/shared/src/sql/rows.ts`, `packages/shared/src/sql/assemblers.ts` | COMPLETE |
| 21 | Output Pipeline | `packages/shared/src/layers/OutputPipelineLive.ts` (5 services) | COMPLETE |
| 22 | MCP Server | `packages/mcp/` (own package) | COMPLETE |
| 23 | tRPC Router | `packages/mcp/src/router.ts` | COMPLETE |
| 24 | Claude Code Plugin | `plugin/` (loader rewritten in 2.0 -- see Component 24) | COMPLETE |
| 25 | LoggerLive | `packages/shared/src/layers/LoggerLive.ts` | COMPLETE |
| 26 | ensureMigrated | `packages/shared/src/utils/ensure-migrated.ts` | COMPLETE |
| 27 | Shared package | `packages/shared/` -- the no-internal-deps base depended on by reporter, cli, and mcp | COMPLETE |
| 28 | CLI package | `packages/cli/` -- houses the `vitest-agent-reporter` bin and `CliLive` | COMPLETE |
| 29 | MCP package | `packages/mcp/` -- houses the `vitest-agent-reporter-mcp` bin and `McpLive` | COMPLETE |
| 30 | XDG path resolution | `packages/shared/src/utils/resolve-data-path.ts`, `packages/shared/src/utils/resolve-workspace-key.ts`, `packages/shared/src/utils/normalize-workspace-key.ts`, `packages/shared/src/layers/PathResolutionLive.ts` | COMPLETE |
| 31 | TOML config file | `packages/shared/src/schemas/Config.ts`, `packages/shared/src/services/Config.ts`, `packages/shared/src/layers/ConfigLive.ts` | COMPLETE |
| 32 | PathResolutionError | `packages/shared/src/errors/PathResolutionError.ts` | COMPLETE |

**Removed in Phase 5:**

| Component | Former Location | Replaced By |
| --------- | --------------- | ----------- |
| CacheWriter | `package/src/services/CacheWriter.ts` | DataStore |
| CacheReader | `package/src/services/CacheReader.ts` | DataReader |
| CacheError | `package/src/errors/CacheError.ts` | DataStoreError |
| AgentDetection | `package/src/services/AgentDetection.ts` | EnvironmentDetector |
| Console Formatter | `package/src/utils/format-console.ts` | `packages/shared/src/formatters/markdown.ts` |
| GFM Formatter | `package/src/utils/format-gfm.ts` | `packages/shared/src/formatters/gfm.ts` |

**Removed in 2.0 (Phase 6):**

| Component | Former Location | Replaced By |
| --------- | --------------- | ----------- |
| `resolveDbPath` (artifact-probing) | `package/src/cli/lib/resolve-cache-dir.ts` | `resolveDataPath` (XDG-derived) in `packages/shared/src/utils/resolve-data-path.ts` |
| Plugin `file://` import loader | `plugin/bin/mcp-server.mjs` (walked `node_modules`, dynamic-imported `./mcp` via file URL) | PM-detect + spawn `vitest-agent-reporter-mcp` (same path, new body) |

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

**618 tests total** across 5 named Vitest projects:

| Project | Tests |
| --- | --- |
| `vitest-agent-reporter` | 102 |
| `vitest-agent-reporter-shared` | 429 |
| `vitest-agent-reporter-mcp` | 40 |
| `vitest-agent-reporter-cli` | 39 |
| `example-basic` | 8 |

All coverage metrics above 80%.

**Document Status:** Current -- reflects Phase 1 through Phase 6 (2.0
architectural restructure on `feat/db-issues`). Phase 6 highlights:
four-package split (`shared`/`reporter`/`cli`/`mcp`); deterministic
XDG-based DB path via `resolveDataPath` (closes
[issue #39][issue-39]); `vitest-agent-reporter.config.toml` overrides
via `cacheDir`/`projectKey`; async `AgentReporter.onInit`; plugin's
MCP loader rewritten as PM-detect + spawn (Decision 29 retired);
investigation confirmed `xdg-effect`'s `SqliteState.Live` cannot
replace `ensureMigrated` (Decision 28 still in force). All phases
complete.
