---
status: current
module: vitest-agent-reporter
category: testing
created: 2026-03-20
updated: 2026-04-28
last-synced: 2026-04-28
post-phase5-sync: 2026-04-23
completeness: 95
related:
  - vitest-agent-reporter/architecture.md
  - vitest-agent-reporter/components.md
dependencies: []
---

# Testing Strategy & Implementation Phases -- vitest-agent-reporter

Testing approach, test patterns, and implementation phase history.

**Parent document:** [architecture.md](./architecture.md)

---

## Testing Strategy

### Unit Tests

**Location:** `package/src/**/*.test.ts`

**Test structure mirrors source.** Services are tested through their layers.
CLI logic is tested through lib functions. Formatters are tested directly.
MCP tools are tested via tRPC caller factory.

**Implemented tests (Phase 1-2-3-4-5):**

- `utils/compress-lines.test.ts` -- `compressLines()` edge cases
- `utils/safe-filename.test.ts` -- `safeFilename()` sanitization
- `utils/ansi.test.ts` -- `ansi()`/`stripAnsi()`, `NO_COLOR` behavior
- `utils/strip-console-reporters.test.ts` -- `stripConsoleReporters()`
  (string, tuple, class instance filtering)
- `utils/detect-pm.test.ts` -- `detectPackageManager()` with mock FS,
  `getRunCommand()` for all package managers
- `utils/build-report.test.ts` -- `buildAgentReport()` with mock Vitest
  objects, tallying, error extraction, omitPassingTests behavior
- `utils/format-console.test.ts` -- legacy `formatConsoleMarkdown()` tests
- `utils/format-gfm.test.ts` -- legacy `formatGfm()` tests
- `utils/format-fatal-error.test.ts` -- fatal error formatting
- `utils/resolve-thresholds.test.ts` -- `resolveThresholds()` Vitest-native
  format parsing, `100` shorthand, per-glob patterns, `getMinThreshold()`
- `utils/compute-trend.test.ts` -- `computeTrend()` trend entry computation,
  sliding window, target hash change detection, `getRecentDirection()`
- `utils/split-project.test.ts` -- `splitProject()` project name splitting,
  colon handling, empty/undefined input
- `utils/capture-env.test.ts` -- `captureEnvVars()` CI, GitHub, Runner
  var capture logic
- `utils/capture-settings.test.ts` -- `captureSettings()` config extraction
  and hash computation
- `utils/ensure-migrated.test.ts` -- migration coordinator (4 tests):
  fresh DB migrates without error, concurrent calls with the same
  `dbPath` share the same promise, distinct `dbPath`s yield independent
  promises, and three concurrent callers serialize without
  `SQLITE_BUSY`. Uses `_resetMigrationCacheForTesting` in `afterEach`
- `schemas/Common.test.ts` -- shared literal schema validation including
  Environment, Executor, OutputFormat, DetailLevel
- `schemas/AgentReport.test.ts` -- report schema validation and encoding
- `schemas/CacheManifest.test.ts` -- manifest schema validation
- `schemas/Coverage.test.ts` -- coverage schema validation, thresholds
  object format, targets, baselines
- `schemas/Baselines.test.ts` -- CoverageBaselines schema validation
- `schemas/Trends.test.ts` -- TrendEntry, TrendRecord schema validation
- `schemas/History.test.ts` -- TestRun, TestHistory, HistoryRecord schema
  validation
- `schemas/Options.test.ts` -- reporter + plugin + coverage options schema
  validation
- `services/services.test.ts` -- service Context.Tag definitions (all 10)
- `errors/errors.test.ts` -- DataStoreError and DiscoveryError tagged
  error types
- `layers/EnvironmentDetectorLive.test.ts` -- std-env integration, 4
  environment types
- `layers/DataStoreLive.test.ts` -- database write operations via SQLite
- `layers/DataReaderLive.test.ts` -- database read operations via SQLite,
  assembler integration
- `layers/CoverageAnalyzerLive.test.ts` -- coverage processing, scoped
  coverage, bare-zero handling, test layer
- `layers/ProjectDiscoveryLive.test.ts` -- test file discovery, source
  mapping
- `layers/HistoryTrackerLive.test.ts` -- classification logic, sliding
  window (new-failure, persistent, flaky, stable, recovered)
- `layers/ReporterLive.test.ts` -- merged layer composition with SQLite
- `layers/ExecutorResolverLive.test.ts` -- environment to executor mapping
- `layers/FormatSelectorLive.test.ts` -- format selection logic
- `layers/DetailResolverLive.test.ts` -- detail level resolution
- `layers/OutputRendererLive.test.ts` -- formatter dispatch
- `layers/LoggerLive.test.ts` -- structured logging layer
- `formatters/markdown.test.ts` -- tiered console markdown formatting,
  coverage gaps, trend summaries, CLI hints
- `formatters/gfm.test.ts` -- GFM formatting, single and multi-project
  output, coverage tables, details blocks
- `formatters/json.test.ts` -- JSON output formatting
- `migrations/0001_initial.test.ts` -- migration schema verification,
  table creation, index creation
- `sql/assemblers.test.ts` -- assembler functions for reconstructing
  domain types from row data
- `mcp/router.test.ts` -- tRPC router integration tests via caller factory
- `mcp/tools/run-tests.test.ts` -- run_tests tool spawnSync behavior
- `cli/lib/format-status.test.ts` -- status formatting
- `cli/lib/format-overview.test.ts` -- overview formatting
- `cli/lib/format-coverage.test.ts` -- coverage formatting with thresholds
  object
- `cli/lib/format-history.test.ts` -- history formatting (flaky/persistent/
  recovered display, P/F visualization)
- `cli/lib/format-trends.test.ts` -- trends formatting (direction, metrics,
  sparkline)
- `cli/lib/format-doctor.test.ts` -- doctor diagnostic formatting
- `cli/lib/resolve-cache-dir.test.ts` -- cache dir resolution including
  Vite hash-based subdirectory search
- `reporter.test.ts` -- `AgentReporter` lifecycle integration tests,
  including history classification, DataStore write invocations
- `plugin.test.ts` -- `AgentPlugin` environment detection, reporter
  injection, cache directory resolution, coverage threshold/target
  resolution, consoleStrategy behavior, autoUpdate disabling

**Test patterns:**

Each service test follows the state-container pattern:

```typescript
const run = <A, E>(effect: Effect.Effect<A, E, DataReader>) =>
  Effect.runPromise(Effect.provide(effect, testLayer));

const getLatestRun = (project: string, subProject: string | null) =>
  Effect.flatMap(DataReader, (svc) => svc.getLatestRun(project, subProject));
```

Test layers swap `@effect/platform` FileSystem and `@effect/sql-sqlite-node`
SqlClient for mock implementations. Reporter integration tests compose test
layers:

```typescript
const TestReporterLive = Layer.mergeAll(
  DataStoreTest.layer(writeState),
  CoverageAnalyzerTest.layer(),
  HistoryTrackerTest.layer(),
);
```

CLI commands are not tested directly (thin wrappers). Logic lives in
`cli/lib/` and is tested as pure functions.

MCP tools are tested via tRPC's `createCallerFactory` without starting
the MCP server:

```typescript
const factory = createCallerFactory(appRouter);
const caller = factory(mockCtx);
const result = await caller.test_status({ project: "my-app" });
```

### Integration Tests

**What to test:**

- End-to-end reporter behavior with actual Vitest test runs
- Per-project database records in multi-project setup
- GFM output written to GITHUB_STEP_SUMMARY mock file
- Reporter injection via `AgentPlugin`
- CLI bin invocation with cached test data
- MCP server tool invocations via caller factory

---

## Implementation Phases

### Phase 1: Core Reporter and Plugin -- COMPLETE

**Deliverables (all implemented):**

- `AgentReporter` class implementing Vitest Reporter interface
- `AgentPlugin` with three-environment detection and reporter chain
  management
- Zod 4 schemas and codecs for all data structures
- Console markdown formatter (three output modes, compact format)
- JSON report builder (pure function, duck-typed Vitest interfaces)
- GFM formatter for GitHub Actions
- Coverage processor (duck-typed istanbul, isolated module)
- Package manager detection with FileSystemAdapter
- Utility functions (`compressLines`, `safeFilename`, `ansi`,
  `detectEnvironment`, `stripConsoleReporters`)
- Public API exports via `package/src/index.ts` (reporter, plugin, schemas, types)
- Comprehensive unit and integration tests for all modules

**Note:** Phase 1 source files were restructured during Phase 2. See Phase
2 deliverables for current file locations.

### Phase 2: Effect Services, CLI Bin, and Hybrid Mode -- COMPLETE

**Goal:** Migrate to Effect service architecture, add CLI bin for on-demand
test landscape queries, introduce hybrid console strategy, and fix Phase 1
bugs.

**Deliverables (all implemented):**

- Migrated from Zod to Effect Schema (`package/src/schemas/` directory)
- Five Effect services: AgentDetection, CacheWriter, CacheReader,
  CoverageAnalyzer, ProjectDiscovery (`package/src/services/`)
- Live and test layers for all services (`package/src/layers/`)
- Merged composition layers: ReporterLive, CliLive
- Tagged error types: CacheError, DiscoveryError (`package/src/errors/`)
- CLI bin with `status`, `overview`, `coverage` commands (`package/src/cli/`)
- `consoleStrategy` option (`"own" | "complement"`, default `"complement"`)
- Scoped coverage support via CoverageAnalyzer.processScoped()
- `std-env` integration replacing hand-rolled environment detection
- Restructured utils from single file to `package/src/utils/` directory
- Relocated formatters from `package/src/formatters/` to `package/src/utils/`
- Bug fix: unhandledErrors now attached to ALL project reports
- Bug fix: `includeBareZero` works correctly at threshold 0

**Breaking changes from Phase 1:**

- Zod replaced by Effect Schema (all schema exports changed)
- `consoleStrategy` defaults to `"complement"` (Phase 1 was implicitly
  `"own"`)
- `detectEnvironment()` and `isGitHubActions()` utilities removed (replaced
  by AgentDetection service)
- `package/src/schemas.ts` and `package/src/types.ts` removed (replaced by
  `package/src/schemas/`)
- `package/src/coverage.ts` removed (replaced by CoverageAnalyzer service)

**Dependencies added:** `effect`, `@effect/cli`, `@effect/platform`,
`@effect/platform-node`, `std-env`

**Dependencies removed:** `zod`

**Source files:**

- `package/src/reporter.ts`, `package/src/plugin.ts`, `package/src/index.ts`
- `package/src/services/*.ts`, `package/src/layers/*.ts`,
  `package/src/errors/*.ts`
- `package/src/schemas/*.ts`, `package/src/utils/*.ts`
- `package/src/cli/index.ts`, `package/src/cli/commands/*.ts`,
  `package/src/cli/lib/*.ts`
**Depends on:** Phase 1 (architecture, data structures, test patterns)

### Phase 3: Suggested Actions and Failure History -- COMPLETE

**Goal:** Actionable intelligence in reporter output -- what to do next,
and whether failures are new, persistent, or flaky.

**Deliverables (all implemented):**

- `History.ts` schema (`TestRun`, `TestHistory`, `HistoryRecord`) for
  failure persistence
- `HistoryTracker` Effect service (`package/src/services/HistoryTracker.ts`)
  with `classify(outcomes: TestOutcome[])` method
- `HistoryTrackerLive` with 10-entry sliding window and five classifications:
  `new-failure`, `persistent`, `flaky`, `recovered`, `stable`
- `HistoryTrackerTest` test layer with canned classifications
- `CacheWriter.writeHistory` writes history to
  `{cacheDir}/history/{name}.history.json`
- `CacheReader.readHistory` reads history; returns empty record for
  missing/corrupt files (logs warning for corruption)
- `ReporterLive` updated to include HistoryTrackerLive + CacheReaderLive
- `CliLive` updated to include HistoryTrackerLive
- AgentReporter integration: extracts `TestOutcome[]`, classifies, attaches
  `classification` to `TestReport` objects, writes history, populates
  `historyFile` in manifest entries
- Enhanced console output: `[new-failure]` labels on failed tests,
  prioritized suggestions in Next Steps section
- CLI `history` command: shows flaky tests, persistent failures, recovered
  tests with P/F run visualization
- Public API exports: `HistoryRecord`, `TestHistory`, `TestRun` schemas;
  `HistoryTracker` service + `HistoryTrackerLive` layer; `TestOutcome` type;
  `AgentDetection` service

**New test files:**

- `schemas/History.test.ts`
- `layers/HistoryTrackerLive.test.ts` (14 tests)
- `cli/lib/format-history.test.ts` (13 tests)

**Modified test files:** `CacheWriterLive.test.ts`, `CacheReaderLive.test.ts`,
`ReporterLive.test.ts`, `reporter.test.ts`, `format-console.test.ts`

**Source files:**

- `package/src/services/HistoryTracker.ts`
- `package/src/layers/HistoryTrackerLive.ts`,
  `package/src/layers/HistoryTrackerTest.ts`
- `package/src/schemas/History.ts`
- `package/src/cli/commands/history.ts`,
  `package/src/cli/lib/format-history.ts`

**Depends on:** Phase 1 (report data structures), Phase 2 (Effect services,
CacheReader/CacheWriter, CliLive/ReporterLive composition)

### Phase 4: Coverage Thresholds, Baselines, and Trends -- COMPLETE

**Goal:** Replace the single `coverageThreshold: number` with Vitest-native
threshold format, add aspirational targets with auto-ratcheting baselines,
per-project coverage trend tracking, tiered console output, and new CLI
commands for cache management and diagnostics.

**Deliverables (all implemented):**

- **Monorepo restructuring:** source moved from `src/` to `package/src/`;
  root is pnpm monorepo with `package` (publishable) and `examples/*`
  (test projects) workspaces
- **Coverage thresholds overhaul (breaking change):**
  `coverageThreshold: number` replaced by `coverageThresholds` (Vitest-native
  format: per-metric, per-glob, negative numbers, `100` shorthand, `perFile`).
  `extractCoverageThreshold` deleted, replaced by `resolveThresholds` utility.
  `CoverageReport.threshold` (number) replaced by `CoverageReport.thresholds`
  (object with global + patterns)
- **Coverage targets:** new `coverageTargets` option (same format as
  thresholds) for aspirational goals. Plugin disables Vitest's native
  `autoUpdate` when our targets are set
- **Coverage baselines:** `baselines.json` in cache directory stores
  high-water marks per metric. Reporter reads baselines, computes updated
  baselines, writes them back. Baselines ratchet up but never past targets.
  `autoUpdate` option (default true) controls auto-ratcheting
- **Coverage trends:** per-project trend tracking with 50-entry sliding
  window. Only recorded on full (non-scoped) runs. Target change detection
  via hash comparison resets trend history. `TrendEntry` and `TrendRecord`
  schemas, `computeTrend` utility
- **Tiered console output:** green (all pass, targets met -- minimal),
  yellow (pass but below targets -- improvements + CLI hint), red
  (failures/violations/regressions -- full detail + CLI hints). Trend
  summary line after header. CLI command suggestions use detected PM
- **New CLI commands:** `cache path` (resolved cache dir), `cache clean`
  (delete cache), `doctor` (5-point health diagnostic), `trends`
  (per-project trend display with direction, metrics, sparkline)
- **CLI cache resolution fix:** `resolveCacheDir` now searches
  `node_modules/.vite/vitest/*/vitest-agent-reporter` for Vite's
  hash-based cache subdirectory
- **New schemas:** `Thresholds.ts` (MetricThresholds, PatternThresholds,
  ResolvedThresholds), `Baselines.ts` (CoverageBaselines), `Trends.ts`
  (TrendEntry, TrendRecord)
- **New utilities:** `resolve-thresholds.ts`, `compute-trend.ts`
- **New service methods:** `CacheReader.readBaselines`, `readTrends`;
  `CacheWriter.writeBaselines`, `writeTrends`
- **New `CoverageOptions` and `FormatterOptions` schemas** in Options.ts

**Breaking changes from Phase 3:**

- `coverageThreshold: number` replaced by
  `coverageThresholds: Record<string, unknown>` in `AgentReporterOptions`
- `CoverageReport.threshold` (number) replaced by
  `CoverageReport.thresholds` (object with `global` and `patterns`)
- `extractCoverageThreshold()` function removed
- Console output format changed to tiered model

**New test files:**

- `schemas/Baselines.test.ts`
- `schemas/Trends.test.ts`
- `utils/resolve-thresholds.test.ts`
- `utils/compute-trend.test.ts`
- `cli/lib/format-trends.test.ts`
- `cli/lib/format-doctor.test.ts`

**Modified test files:** `schemas/Coverage.test.ts`,
`schemas/Options.test.ts`, `layers/CacheWriterLive.test.ts`,
`layers/CacheReaderLive.test.ts`, `layers/CoverageAnalyzerLive.test.ts`,
`layers/ReporterLive.test.ts`, `reporter.test.ts`, `plugin.test.ts`,
`cli/lib/format-coverage.test.ts`, `cli/lib/format-console.test.ts`,
`cli/lib/resolve-cache-dir.test.ts`

**Source files:**

- `package/src/schemas/Thresholds.ts`, `package/src/schemas/Baselines.ts`,
  `package/src/schemas/Trends.ts`
- `package/src/utils/resolve-thresholds.ts`,
  `package/src/utils/compute-trend.ts`
- `package/src/cli/commands/cache.ts`,
  `package/src/cli/commands/doctor.ts`,
  `package/src/cli/commands/trends.ts`
- `package/src/cli/lib/format-doctor.ts`,
  `package/src/cli/lib/format-trends.ts`

**Depends on:** Phase 2 (Effect services, CacheReader/CacheWriter, CLI
framework), Phase 3 (HistoryTracker, ReporterLive/CliLive composition)

### Phase 5: SQLite Data Layer, Output Pipeline, MCP Server, Claude Code Plugin -- COMPLETE

**Goal:** Replace JSON file cache with SQLite database, add pluggable
output pipeline with formatter system, expose test data via MCP server,
and provide a Claude Code plugin for seamless agent integration.

Four sub-phases executed on the `feat/db-mcp` branch:

#### Phase 5a: SQLite Data Layer

**Deliverables (all implemented):**

- **SQLite database:** 25-table normalized schema via
  `@effect/sql-sqlite-node` with WAL journal mode and foreign key
  enforcement. Single `data.db` file replaces all JSON cache files
- **DataStore service** (`package/src/services/DataStore.ts`) -- replaces
  CacheWriter. Writes test runs, modules, suites, test cases, errors,
  coverage, history, baselines, trends, settings, source maps, and notes
- **DataReader service** (`package/src/services/DataReader.ts`) -- replaces
  CacheReader. Reads all test data from SQLite with rich query methods
  (getFlaky, getPersistentFailures, getTestsForFile, searchNotes, etc.)
- **DataStoreError** (`package/src/errors/DataStoreError.ts`) -- replaces
  CacheError. Fields: `operation`, `table`, `reason`
- **Migration system** (`package/src/migrations/0001_initial.ts`) --
  migration-based schema management via SqliteMigrator
- **SQL helpers** (`package/src/sql/rows.ts`, `package/src/sql/assemblers.ts`)
  -- row type definitions and assembler functions for reconstructing domain
  types from normalized row data
- **Composition layers as functions of `dbPath`:** `ReporterLive(dbPath)`,
  `CliLive(dbPath)` now construct SqliteClient + Migrator layers inline
- **New utilities:** `split-project.ts` (project:subProject parsing),
  `capture-env.ts` (environment variable capture), `capture-settings.ts`
  (Vitest config capture + hash)
- **HistoryTracker signature change:** `classify` now accepts
  `(project, subProject, testOutcomes, timestamp)` instead of
  `(cacheDir, testOutcomes)`; depends on DataReader instead of CacheReader
- **classifyTest()** pure function extracted to `utils/classify-test.ts`
  from HistoryTrackerLive for reuse in CLI formatting

**Breaking changes from Phase 4:**

- `CacheWriter` / `CacheReader` services removed, replaced by
  `DataStore` / `DataReader`
- `CacheError` removed, replaced by `DataStoreError`
- `CacheWriterLive` / `CacheReaderLive` removed, replaced by
  `DataStoreLive` / `DataReaderLive`
- `ReporterLive` and `CliLive` changed from static layers to functions
  of `dbPath: string`
- JSON cache files no longer produced (all data in `data.db`)

**Deleted files:**

- `package/src/services/CacheWriter.ts`,
  `package/src/services/CacheReader.ts`
- `package/src/layers/CacheWriterLive.ts`,
  `package/src/layers/CacheReaderLive.ts`,
  `package/src/layers/CacheWriterTest.ts`,
  `package/src/layers/CacheReaderTest.ts`
- `package/src/errors/CacheError.ts`

**New files:**

- `package/src/services/DataStore.ts`, `package/src/services/DataReader.ts`
- `package/src/layers/DataStoreLive.ts`, `package/src/layers/DataReaderLive.ts`,
  `package/src/layers/DataStoreTest.ts`
- `package/src/migrations/0001_initial.ts`
- `package/src/sql/rows.ts`, `package/src/sql/assemblers.ts`
- `package/src/errors/DataStoreError.ts`
- `package/src/utils/split-project.ts`, `package/src/utils/capture-env.ts`,
  `package/src/utils/capture-settings.ts`, `package/src/utils/classify-test.ts`

**New test files:**

- `layers/DataStoreLive.test.ts`
- `layers/DataReaderLive.test.ts`
- `migrations/0001_initial.test.ts`
- `sql/assemblers.test.ts`
- `utils/split-project.test.ts`
- `utils/capture-env.test.ts`
- `utils/capture-settings.test.ts`

**Dependencies added:** `@effect/sql-sqlite-node`

#### Phase 5b: Output Pipeline

**Deliverables (all implemented):**

- **5 new Effect services forming output pipeline:**
  `EnvironmentDetector`, `ExecutorResolver`, `FormatSelector`,
  `DetailResolver`, `OutputRenderer`
- **EnvironmentDetector** replaces AgentDetection with finer granularity:
  `agent-shell`, `terminal`, `ci-github`, `ci-generic` (4 environments
  vs previous 3)
- **ExecutorResolver** maps environment + mode to executor role:
  `human`, `agent`, `ci`
- **FormatSelector** selects output format based on executor + explicit
  override: `markdown`, `json`, `vitest-bypass`, `silent`
- **DetailResolver** determines detail level based on executor + run
  health: `minimal`, `neutral`, `standard`, `verbose`
- **OutputRenderer** dispatches to registered formatter instances
- **4 built-in formatters:** `MarkdownFormatter` (tiered console),
  `GfmFormatter` (GitHub Actions), `JsonFormatter` (raw JSON),
  `SilentFormatter` (no output)
- **OutputPipelineLive** composition layer included in `ReporterLive`,
  `CliLive`, and `McpLive`
- **New schema literals** in Common.ts: `Environment`, `Executor`,
  `OutputFormat`, `DetailLevel`
- **`--format` flag** on all CLI commands for explicit format selection
- **`format` option** replaces `consoleStrategy` internally for format
  selection

**Breaking changes from Phase 4:**

- `AgentDetection` service removed, replaced by `EnvironmentDetector`
- `AgentDetectionLive` / `AgentDetectionTest` removed, replaced by
  `EnvironmentDetectorLive` / `EnvironmentDetectorTest`
- Three-environment model (`agent`, `ci`, `human`) replaced by
  four-environment model + executor resolution

**Deleted files:**

- `package/src/services/AgentDetection.ts`
- `package/src/layers/AgentDetectionLive.ts`,
  `package/src/layers/AgentDetectionTest.ts`

**New files:**

- `package/src/services/EnvironmentDetector.ts`,
  `package/src/services/ExecutorResolver.ts`,
  `package/src/services/FormatSelector.ts`,
  `package/src/services/DetailResolver.ts`,
  `package/src/services/OutputRenderer.ts`
- `package/src/layers/EnvironmentDetectorLive.ts`,
  `package/src/layers/ExecutorResolverLive.ts`,
  `package/src/layers/FormatSelectorLive.ts`,
  `package/src/layers/DetailResolverLive.ts`,
  `package/src/layers/OutputRendererLive.ts`,
  `package/src/layers/OutputPipelineLive.ts`,
  `package/src/layers/EnvironmentDetectorTest.ts`
- `package/src/formatters/types.ts`, `package/src/formatters/markdown.ts`,
  `package/src/formatters/gfm.ts`, `package/src/formatters/json.ts`,
  `package/src/formatters/silent.ts`

**New test files:**

- `layers/EnvironmentDetectorLive.test.ts`
- `layers/ExecutorResolverLive.test.ts`
- `layers/FormatSelectorLive.test.ts`
- `layers/DetailResolverLive.test.ts`
- `layers/OutputRendererLive.test.ts`
- `formatters/markdown.test.ts`
- `formatters/gfm.test.ts`
- `formatters/json.test.ts`

#### Phase 5c: MCP Server

**Deliverables (all implemented):**

- **tRPC router** (`package/src/mcp/router.ts`) with 24 procedures
  aggregating all MCP tools
- **MCP server** (`package/src/mcp/server.ts`) using
  `@modelcontextprotocol/sdk` with StdioServerTransport, registers all
  24 tools with Zod input schemas
- **tRPC context** (`package/src/mcp/context.ts`) carrying `ManagedRuntime`
  for Effect service access
- **Entry point** (`package/src/mcp/index.ts`) resolves DB path, creates
  ManagedRuntime with McpLive, starts server
- **McpLive composition layer** (`package/src/layers/McpLive.ts`) --
  DataReaderLive + DataStoreLive + ProjectDiscoveryLive +
  OutputPipelineLive + SqliteClient + Migrator + NodeContext +
  NodeFileSystem
- **24 MCP tools:**
  - Meta (markdown): `help`
  - Read-only (markdown): `test_status`, `test_overview`, `test_coverage`,
    `test_history`, `test_trends`, `test_errors`, `test_for_file`,
    `test_get`, `file_coverage`, `cache_health`, `configure`
  - Discovery (markdown): `project_list`, `test_list`, `module_list`,
    `suite_list`, `settings_list`
  - Mutation (text): `run_tests`
  - Note CRUD (markdown for list/search, JSON for create/get/update/
    delete): `note_create`, `note_list`, `note_get`, `note_update`,
    `note_delete`, `note_search`
- **19 tool implementation files** in `package/src/mcp/tools/`

**Dependencies added:** `@modelcontextprotocol/sdk`, `@trpc/server`, `zod`

**New files:**

- `package/src/mcp/context.ts`, `package/src/mcp/router.ts`,
  `package/src/mcp/server.ts`, `package/src/mcp/index.ts`
- `package/src/mcp/tools/help.ts`, `package/src/mcp/tools/status.ts`,
  `package/src/mcp/tools/overview.ts`, `package/src/mcp/tools/coverage.ts`,
  `package/src/mcp/tools/history.ts`, `package/src/mcp/tools/trends.ts`,
  `package/src/mcp/tools/errors.ts`, `package/src/mcp/tools/test-for-file.ts`,
  `package/src/mcp/tools/test-get.ts`, `package/src/mcp/tools/test-list.ts`,
  `package/src/mcp/tools/file-coverage.ts`,
  `package/src/mcp/tools/run-tests.ts`,
  `package/src/mcp/tools/cache-health.ts`,
  `package/src/mcp/tools/configure.ts`, `package/src/mcp/tools/notes.ts`,
  `package/src/mcp/tools/project-list.ts`,
  `package/src/mcp/tools/module-list.ts`,
  `package/src/mcp/tools/suite-list.ts`,
  `package/src/mcp/tools/settings-list.ts`
- `package/src/layers/McpLive.ts`

**New test files:**

- `mcp/router.test.ts`
- `mcp/tools/run-tests.test.ts`

#### Phase 5d: Claude Code Plugin

**Deliverables (all implemented):**

- **Plugin manifest** (`plugin/.claude-plugin/plugin.json`) -- name,
  version, author, homepage, repository
- **MCP auto-registration** (`plugin/.mcp.json`) -- configures
  `vitest-reporter` MCP server via `npx vitest-agent-reporter-mcp`
- **Hooks:**
  - `SessionStart` -> `plugin/hooks/session-start.sh` -- injects test
    context into the Claude Code session via bash
  - `PostToolUse` on `Bash` -> `plugin/hooks/post-test-run.sh` -- detects
    vitest test runs and triggers post-run actions
- **4 Skills:**
  - `plugin/skills/tdd/SKILL.md` -- TDD workflow guidance
  - `plugin/skills/debugging/SKILL.md` -- test debugging workflow
  - `plugin/skills/configuration/SKILL.md` -- Vitest configuration guidance
  - `plugin/skills/coverage-improvement/SKILL.md` -- coverage improvement
- **2 Commands:**
  - `plugin/commands/setup.md` -- initial setup instructions
  - `plugin/commands/configure.md` -- configuration management

**Note:** The `plugin/` directory is NOT a pnpm workspace. It contains
only static files (JSON, shell scripts, markdown) with no dependencies,
build step, or tests.

**New files:**

- `plugin/.claude-plugin/plugin.json`
- `plugin/.mcp.json`
- `plugin/hooks/hooks.json`
- `plugin/hooks/session-start.sh`
- `plugin/hooks/post-test-run.sh`
- `plugin/skills/tdd/SKILL.md`
- `plugin/skills/debugging/SKILL.md`
- `plugin/skills/configuration/SKILL.md`
- `plugin/skills/coverage-improvement/SKILL.md`
- `plugin/commands/setup.md`
- `plugin/commands/configure.md`

**Depends on:** Phase 2 (Effect services, CLI framework), Phase 3
(HistoryTracker), Phase 4 (coverage thresholds, baselines, trends,
tiered output)

### Post-Phase-5 Refinements (on `feat/db-mcp` branch)

Incremental improvements made after the Phase 5 implementation was
complete. These are not a new phase but a set of fixes and enhancements.

**Changes:**

- **Multi-project support fix:** `projectFilter` option on AgentReporter.
  Plugin passes project name from `configureVitest` context. Reporter
  filters testModules to only its own project. Coverage dedup: only
  first project (alphabetically) processes global coverage
- **Proper Vitest plugin types:** Plugin uses `VitestPluginContext` from
  `vitest/node` for `configureVitest` hook typing. Uses `as unknown as`
  casts where Vitest types are too strict
- **`mcp` option:** Boolean on plugin and reporter. When true, Next Steps
  suggests MCP tools instead of CLI commands
- **Cache file line removed:** The `-> Cache:` line no longer appears in
  console output. `cacheFile` removed from `FormatterContext`
- **`consoleStrategy` renamed to `strategy`:** Shorter option name on
  `AgentPluginOptions`
- **`debug` replaced by `logLevel`/`logFile`:** Effect-based structured
  logging via `Logger.structuredLogger`. New `LoggerLive` layer factory
  with NDJSON to stderr + optional file logging via `Logger.zip`.
  `resolveLogLevel`/`resolveLogFile` helpers with env var fallback
  (`VITEST_REPORTER_LOG_LEVEL`, `VITEST_REPORTER_LOG_FILE`).
  `Effect.logDebug` calls on all 30+ DataStore/DataReader methods.
  Case-insensitive level names
- **Native coverage table suppression:** Plugin sets
  `coverage.reporter = []` in agent/own mode to prevent Vitest from
  printing the large text table
- **Redundant "All tests passed" line removed:** Header already conveys
  pass/fail state
- **Trend summary wired up:** Reporter reads trends back from DB after
  writing and builds `trendSummary` for formatter context. Shows
  "trending improving over N runs" line
- **DataStoreError fix:** `err.stacks[0]` (object) replaced with
  `err.stack` (string) for SQL parameters. Improved error extraction
  from Effect FiberFailure in catch block
- **Vitest config:** Plain `defineConfig` from `vitest/config` replaces
  `@savvy-web/vitest`. Projects use `extends: true`. Coverage excludes
  added for new files
- **Turbo config:** Removed redundant uncached `build` wrapper from
  `package/turbo.json`. Excluded test/markdown files from build hashes
- **New file:** `package/src/layers/LoggerLive.ts`
- **`vite` added as devDependency** to `package/`

**New/modified files:**

- `package/src/layers/LoggerLive.ts` (new)
- `package/src/reporter.ts` (projectFilter, logLevel, mcp, trend summary)
- `package/src/plugin.ts` (strategy rename, projectFilter, coverage
  suppression, VitestPluginContext)
- `package/src/formatters/markdown.ts` (cache line removed, "All tests
  passed" removed, MCP-aware suggestions)
- `package/src/formatters/types.ts` (cacheFile removed, mcp added)
- `package/src/schemas/Options.ts` (strategy, logLevel, logFile, mcp,
  projectFilter)
- `package/src/layers/DataStoreLive.ts` (logDebug calls, error fix)
- `package/src/layers/DataReaderLive.ts` (logDebug calls)
- `vitest.config.ts` (plain defineConfig, extends: true)
- `package/turbo.json` (build wrapper removed)

### bug/startup Branch Refinements

Bug fixes targeting startup races and error reporting in multi-project
configurations. See Decisions 28 and 29 for background.

**Changes:**

- **Process-level migration coordination:** new utility
  `package/src/utils/ensure-migrated.ts` exports
  `ensureMigrated(dbPath, logLevel?, logFile?)` and an internal
  `_resetMigrationCacheForTesting`. The promise cache lives at
  `Symbol.for("vitest-agent-reporter/migration-promises")` on
  `globalThis` so coordination survives Vite loading the plugin module
  twice in the same process. AgentReporter awaits this before its main
  `Effect.runPromise` and bails with `formatFatalError(err)` to stderr
  on rejection. Fixes `SQLITE_BUSY` on fresh databases when multiple
  reporter instances try to migrate concurrently
- **`extractSqlReason(e)` helper:** new export on
  `package/src/errors/DataStoreError.ts` extracts the underlying
  `SqlError.cause.message` (real SQLite error text like
  `"SQLITE_BUSY: database is locked"` or
  `"UNIQUE constraint failed: ..."`) instead of the generic
  `"Failed to execute statement"` wrapper. Every `Effect.mapError`
  callsite in `DataStoreLive.ts` and `DataReaderLive.ts` now uses
  `extractSqlReason(e)` for the `reason` field; the previously
  special-cased `writeErrors` mapError is unified with the rest using
  the helper
- **Derived error messages:** `DataStoreError` and `DiscoveryError`
  constructors set `this.message` via `Object.defineProperty` to
  `[operation table-or-path] reason`, so `Cause.pretty()` produces
  useful output instead of `"An error has occurred"`
- **Plugin MCP loader:** new `plugin/bin/mcp-server.mjs` walks up from
  `process.cwd()` looking for `node_modules/vitest-agent-reporter`,
  reads its `exports['./mcp']`, and dynamically imports it via
  `file://` URL. Bypasses Node's strict-exports CJS rejection. Fails
  fast with install instructions for npm/pnpm/yarn/bun if the package
  is missing
- **Inline plugin MCP config:** `plugin/.claude-plugin/plugin.json`
  now declares `mcpServers` inline (per Claude Code convention), with
  `command: "node"` and arg
  `${CLAUDE_PLUGIN_ROOT}/bin/mcp-server.mjs`
- **Removed `plugin/.mcp.json`:** old config used
  `npx vitest-agent-reporter-mcp` which on first run could fall back
  to an npm download and exceed Claude Code's MCP startup window

**New files:**

- `package/src/utils/ensure-migrated.ts`
- `package/src/utils/ensure-migrated.test.ts`
- `plugin/bin/mcp-server.mjs`

**Modified files:**

- `package/src/reporter.ts` (awaits `ensureMigrated` in
  `onTestRunEnd`)
- `package/src/errors/DataStoreError.ts` (derived message,
  `extractSqlReason` helper)
- `package/src/errors/DiscoveryError.ts` (derived message)
- `package/src/errors/errors.test.ts` (covers new behavior)
- `package/src/layers/DataStoreLive.ts` (uses `extractSqlReason`
  everywhere)
- `package/src/layers/DataReaderLive.ts` (uses `extractSqlReason`
  everywhere)
- `package/src/utils/format-fatal-error.test.ts` (exercises new
  reasons)
- `plugin/.claude-plugin/plugin.json` (inline `mcpServers`)

**Deleted files:**

- `plugin/.mcp.json` (replaced by inline config + loader)

---

## Related Documentation

**Internal Design Docs:**

- Phase 2 spec: `docs/superpowers/specs/2026-03-20-phase-2-design.md`

**Package Documentation:**

- `README.md` -- Package overview
- [GitHub Issue #1](https://github.com/spencerbeggs/vitest-agent-reporter/issues/1)
  -- Original specification

**External Resources:**

- [Vitest Reporter API](https://vitest.dev/api/advanced/reporters.html)
- [Vitest Plugin API](https://vitest.dev/api/advanced/plugin.html)
- [Vitest Metadata API](https://vitest.dev/api/advanced/metadata.html)
- [GitHub Actions Job Summaries](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#adding-a-job-summary)
- [Effect Documentation](https://effect.website/)
- [std-env](https://github.com/unjs/std-env)
- [Model Context Protocol](https://spec.modelcontextprotocol.io/)
- [tRPC Documentation](https://trpc.io/docs)
- [@effect/sql-sqlite-node](https://effect.website/docs/integrations/sql)

---

**Document Status:** Current -- reflects Phase 1 through Phase 5
implementation plus post-Phase-5 refinements and bug/startup branch
fixes. 573 tests across 53 files, all coverage metrics above 80%. All
phases complete.
