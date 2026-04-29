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
  - vitest-agent-reporter/architecture.md
  - vitest-agent-reporter/decisions.md
  - vitest-agent-reporter/data-structures.md
dependencies: []
---

# Components -- vitest-agent-reporter

Detailed descriptions of all system components, their responsibilities,
interfaces, and dependencies. This is the "Current State" reference for
the codebase.

**Parent document:** [architecture.md](./architecture.md)

---

## Component 1: AgentReporter

**Location:** `packages/reporter/src/reporter.ts`

**Status:** COMPLETE (Phase 1-2-3-4-5-6)

**Purpose:** Vitest Reporter that produces three outputs: formatted output
to console (via output pipeline), persistent data to SQLite database per
project, and optional GFM for GitHub Actions. Uses Effect services for
database I/O, coverage processing, failure history tracking, coverage
baselines/trends, and output rendering.

**Responsibilities:**

- Store `Vitest` instance in `onInit` for project enumeration
- `onInit` is now `async` (Phase 6): resolves `dbPath` via the new
  XDG-based path stack. The reporter holds `private dbPath: string |
  null = null` and a `private async ensureDbPath()` helper. If
  `options.cacheDir` is set, the helper short-circuits to
  `<cacheDir>/data.db` (skipping the heavy XDG/workspace layer stack
  that would otherwise eagerly scan lockfiles). Otherwise it runs
  `resolveDataPath(process.cwd())` under
  `PathResolutionLive(projectDir) + NodeContext.layer`. The result is
  memoized on `this.dbPath`. `onTestRunEnd` calls `ensureDbPath()` again
  defensively for unit tests that bypass `onInit`. On rejection, the
  reporter prints `formatFatalError(err)` to stderr and returns early.
  See Component 30 (XDG path resolution) for the resolver internals.
- Capture Vitest settings and environment variables via `captureSettings()`
  and `captureEnvVars()`, write to database via `DataStore.writeSettings()`
- Stash coverage data in `onCoverage` (fires before `onTestRunEnd`)
- When `projectFilter` is set, filter `testModules` to only modules
  matching that project name before grouping
- Coverage dedup: only the first project (alphabetically) processes
  global coverage. Other projects skip coverage processing
- In `onTestRunEnd`, group `TestModule[]` by `testModule.project.name`
- Split project names via `splitProject()` into `project` + `subProject`
  for normalized storage
- For each project: build report via `buildAgentReport()`, write to
  database via `DataStore.writeRun()`, `writeModules()`, `writeTestCases()`,
  `writeErrors()`, `writeCoverage()`, etc.
- Attach `unhandledErrors` to ALL project reports (not just "default")
- Extract `TestOutcome[]` from `VitestTestModule` objects
- Classify tests via `HistoryTracker.classify(project, subProject, outcomes,
  timestamp)`, attach resulting classifications to `TestReport.classification`
  fields
- Write convention-based source-to-test mappings via
  `DataStore.writeSourceMap()` for each test module in `onTestRunEnd`
- Write per-test history rows via `DataStore.writeHistory()`
- Read existing baselines via `DataReader.getBaselines()`, compute updated
  baselines after coverage processing, write via `DataStore.writeBaselines()`
- Compute coverage trends via `computeTrend()` on full (non-scoped) runs,
  write per-project trends via `DataStore.writeTrends()`
- Render output via `OutputRenderer.render()` which selects the appropriate
  formatter based on the output pipeline resolution
- After writing trends, read them back from DB and build `trendSummary`
  for formatter context (direction, runCount, firstMetric)
- Format and emit tiered console markdown (green/yellow/red based on run
  health); includes `[new-failure]` classification labels on failed tests
  and "trending improving over N runs" line when trend data available
- When `mcp` option is true, Next Steps suggests MCP tools instead of
  CLI commands
- When `GITHUB_ACTIONS` detected or `githubActions` option enabled, append
  GFM summary to `GITHUB_STEP_SUMMARY` file
- Process coverage via CoverageAnalyzer service with scoped coverage support
  and Vitest-native threshold format
- Each lifecycle hook builds a scoped effect and runs it with
  `Effect.runPromise`, providing the `ReporterLive(dbPath)` layer inline
- Before the main `Effect.runPromise` in `onTestRunEnd`, calls
  `await ensureMigrated(dbPath, logLevel, logFile)` (see Component 26).
  Bails with a printed `formatFatalError(err)` to stderr if migration
  rejects. This serializes schema migration across reporter instances in
  multi-project Vitest configs sharing a single `dbPath`

**Key interfaces/APIs:**

```typescript
// Effect Schema (source of truth) -- see Options.ts in schemas/
interface AgentReporterOptions {
  cacheDir?: string;                              // default: ".vitest-agent-reporter"
  consoleOutput?: "failures" | "full" | "silent"; // default: "failures"
  omitPassingTests?: boolean;                     // default: true
  coverageThresholds?: Record<string, unknown>;   // Vitest-native format
  coverageTargets?: Record<string, unknown>;      // aspirational goals
  autoUpdate?: boolean;                           // default: true
  coverageConsoleLimit?: number;                  // default: 10
  includeBareZero?: boolean;                      // default: false
  githubActions?: boolean;                        // default: auto-detect
  githubSummaryFile?: string;                     // default: process.env.GITHUB_STEP_SUMMARY
  projectFilter?: string;                         // filter to single project
  mcp?: boolean;                                  // suggest MCP tools in Next Steps
  logLevel?: "Debug" | "Info" | "Warning" | "Error" | "None"; // default: "None"
  logFile?: string;                               // optional log file path
}
```

**Dependencies:**

- Depends on: Vitest Reporter v2 API (>= 3.2.0), DataStore service,
  DataReader service, CoverageAnalyzer service, HistoryTracker service,
  OutputRenderer service, `@effect/platform` FileSystem
- Used by: `AgentPlugin`, direct consumer configuration

---

## Component 2: AgentPlugin

**Location:** `packages/reporter/src/plugin.ts`

**Status:** COMPLETE (Phase 1-2-4-5-6)

**Purpose:** Vitest plugin that injects `AgentReporter` into the reporter
chain via the `configureVitest` hook. Manages environment detection via
EnvironmentDetector service, executor resolution via ExecutorResolver,
reporter chain manipulation, cache directory resolution, and coverage
threshold/target resolution.

**Responsibilities:**

- Use `VitestPluginContext` from `vitest/node` for `configureVitest` hook
  typing. Uses `as unknown as` casts where Vitest types are too strict
  for config subset access
- Detect runtime environment via EnvironmentDetector Effect service (backed
  by `std-env`): `agent-shell`, `terminal`, `ci-github`, `ci-generic`
- Resolve executor via ExecutorResolver: maps environment to `human`,
  `agent`, or `ci` executor role
- Apply output behavior based on executor and format selection
- Resolve cache directory with two-step priority (Phase 6 dropped the
  third Vite-cacheDir fallback): explicit `reporter.cacheDir` option >
  `outputFile['vitest-agent-reporter']` from Vitest config. When unset,
  the plugin passes `cacheDir: undefined` to `AgentReporter`, which
  falls through to XDG-based resolution via `resolveDataPath` in
  `ensureDbPath()`. The previous fallback to
  `vite.cacheDir + "/vitest-agent-reporter"` was removed because the
  XDG location is now the canonical default and the artifact-probing
  CLI/MCP resolvers that depended on the Vite path are gone.
- Resolve coverage thresholds from Vitest's resolved coverage config via
  `resolveThresholds()` utility
- Resolve coverage targets from plugin options via `resolveThresholds()`
- Disable Vitest's native `autoUpdate` when our targets are set (prevents
  Vitest from auto-ratcheting thresholds independently)
- In agent/own mode, suppress Vitest's native coverage text table by
  setting `coverage.reporter = []`
- Pass project name from `configureVitest` context as `projectFilter`
  option on AgentReporter so each instance filters to its own project
- Push `AgentReporter` instance into `vitest.config.reporters`
- `configureVitest` is async (runs `Effect.runPromise` for detection)

**Key interfaces/APIs:**

```typescript
// Effect Schema (source of truth) -- see Options.ts in schemas/
interface AgentPluginOptions {
  mode?: "auto" | "agent" | "silent";             // default: "auto"
  strategy?: "own" | "complement";                // default: "complement"
  mcp?: boolean;                                  // suggest MCP tools in output
  logLevel?: "Debug" | "Info" | "Warning" | "Error" | "None";
  logFile?: string;                               // optional log file path
  reporter?: {
    cacheDir?: string;
    omitPassingTests?: boolean;
    coverageThresholds?: Record<string, unknown>;  // Vitest-native format
    coverageTargets?: Record<string, unknown>;     // aspirational goals
    autoUpdate?: boolean;                          // default: true
    coverageConsoleLimit?: number;
    includeBareZero?: boolean;
    githubSummaryFile?: string;
  };
}
```

**Console reporters stripped in "own" mode (agent environment):**

`default`, `verbose`, `tree`, `dot`, `tap`, `tap-flat`, `hanging-process`,
`agent`. Custom reporters (class instances, file paths) and non-console
built-in reporters (`json`, `junit`, `html`, `blob`, `github-actions`) are
preserved.

**Dependencies:**

- Depends on: Vitest Plugin API (`configureVitest`, Vitest 3.1+),
  `AgentReporter`, EnvironmentDetector service, ExecutorResolver service,
  `stripConsoleReporters`
- Used by: Consumer `vitest.config.ts`

---

## Component 3: Effect Services

**Locations:** `packages/shared/src/services/` (10 services) +
`packages/reporter/src/services/CoverageAnalyzer.ts` (1 service that
stayed in the reporter package because nothing else needs it)

**Status:** COMPLETE (Phase 2-3-5-6)

**Purpose:** Effect `Context.Tag` definitions for all shared functionality.
Each service is a tag with a typed interface. Live implementations use
`@effect/platform` and `@effect/sql-sqlite-node` for I/O; test
implementations use mock state containers.

In Phase 6 every service except `CoverageAnalyzer` moved into the
shared package so the CLI and MCP packages can depend on them without
pulling in the reporter. `CoverageAnalyzer` stayed in the reporter
package because only the reporter exercises istanbul `CoverageMap`
data; CLI and MCP read pre-processed coverage from SQLite.

**Services (11 total):**

- **DataStore** (`packages/shared/src/services/DataStore.ts`) -- writes
  test runs, modules, suites, test cases, errors, coverage, history,
  baselines, trends, settings, source maps, and notes to SQLite via
  `@effect/sql-sqlite-node`. Provides `writeRun`, `writeModules`,
  `writeSuites`, `writeTestCases`, `writeErrors`, `writeCoverage`,
  `writeHistory`, `writeBaselines`, `writeTrends`, `writeSettings`,
  `writeSourceMap`, `ensureFile`, `writeNote`, `updateNote`,
  `deleteNote` effects. The `SettingsInput` type used by
  `writeSettings` is now declared in `DataStore.ts` (Phase 6 move from
  `utils/capture-settings.ts` so the service owns its full input
  contract without circular imports). Replaces CacheWriter from
  Phase 2-4.
- **DataReader** (`packages/shared/src/services/DataReader.ts`) -- reads
  test data from SQLite. Provides `getLatestRun`, `getRunsByProject`,
  `getHistory`, `getBaselines`, `getTrends`, `getFlaky`,
  `getPersistentFailures`, `getFileCoverage`, `getCoverage`,
  `getTestsForFile`, `getErrors`, `getNotes`, `getNoteById`,
  `searchNotes`, `getManifest`, `getSettings`, `getLatestSettings`,
  `listTests`, `listModules`, `listSuites`, `listSettings` effects.
  Returns `Option.none()` for missing data. Shared between reporter,
  CLI, and MCP server. Replaces CacheReader from Phase 2-4.
- **EnvironmentDetector**
  (`packages/shared/src/services/EnvironmentDetector.ts`) -- wraps
  `std-env` for four-environment detection. Provides `detect()`,
  `isAgent`, and `agentName` effects. Returns `Environment` type:
  `"agent-shell" | "terminal" | "ci-github" | "ci-generic"`. Replaces
  AgentDetection from Phase 2.
- **ExecutorResolver**
  (`packages/shared/src/services/ExecutorResolver.ts`) -- maps
  environment + mode to an executor role. Provides
  `resolve(env, mode)` returning `Executor` type:
  `"human" | "agent" | "ci"`.
- **FormatSelector**
  (`packages/shared/src/services/FormatSelector.ts`) -- selects output
  format based on executor and explicit override. Provides
  `select(executor, explicitFormat?)` returning `OutputFormat` type:
  `"markdown" | "json" | "vitest-bypass" | "silent"`.
- **DetailResolver**
  (`packages/shared/src/services/DetailResolver.ts`) -- determines
  output detail level based on executor, run health, and explicit
  override. Provides `resolve(executor, health, explicit?)` returning
  `DetailLevel` type: `"minimal" | "neutral" | "standard" | "verbose"`.
  `RunHealth` interface carries `hasFailures`, `belowTargets`,
  `hasTargets` flags.
- **OutputRenderer**
  (`packages/shared/src/services/OutputRenderer.ts`) -- renders reports
  using the selected formatter. Provides
  `render(reports, format, context)` returning `RenderedOutput[]` with
  target, content, and contentType.
- **CoverageAnalyzer**
  (`packages/reporter/src/services/CoverageAnalyzer.ts`) -- processes
  istanbul CoverageMap with optional scoping. Provides `process` (full
  analysis) and `processScoped` (filtered to tested source files)
  effects. Lives in the reporter package because only the reporter
  consumes istanbul data; downstream packages read pre-processed
  coverage from SQLite via DataReader.
- **ProjectDiscovery**
  (`packages/shared/src/services/ProjectDiscovery.ts`) -- glob-based
  test file discovery for the CLI. Provides `discoverTestFiles` and
  `mapTestToSource` effects. Unchanged from Phase 2.
- **HistoryTracker**
  (`packages/shared/src/services/HistoryTracker.ts`) -- classifies
  test outcomes against stored history. Provides a `classify` method
  accepting `project`, `subProject`, `testOutcomes[]`, and `timestamp`,
  returning history records plus a classifications map
  (`Map<string, TestClassification>`). Uses a 10-entry sliding window.
  Depends on DataReader to load prior history. Phase 5 changed
  signature to include `project`/`subProject` parameters (removed
  `cacheDir`).
- **VitestAgentReporterConfigFile** (Phase 6 -- new)
  (`packages/shared/src/services/Config.ts`) -- typed `Context.Tag` for
  the loaded `VitestAgentReporterConfig` from
  `vitest-agent-reporter.config.toml`. Backed by `config-file-effect`'s
  `ConfigFile.Tag<VitestAgentReporterConfig>("vitest-agent-reporter/Config")`.
  Live layer is `ConfigLive(projectDir)` (see Component 31).

---

## Component 4: Effect Layers

**Locations:**

- `packages/shared/src/layers/` -- all individual live/test layers and
  the new `OutputPipelineLive`, `ConfigLive`, `PathResolutionLive`,
  `LoggerLive`
- `packages/reporter/src/layers/` -- `CoverageAnalyzerLive`,
  `CoverageAnalyzerTest`, `ReporterLive(dbPath, logLevel?, logFile?)`
- `packages/cli/src/layers/CliLive.ts` --
  `CliLive(dbPath, logLevel?, logFile?)`
- `packages/mcp/src/layers/McpLive.ts` --
  `McpLive(dbPath, logLevel?, logFile?)`

**Status:** COMPLETE (Phase 2-3-5-6)

**Purpose:** Live and test implementations for all Effect services, plus
merged composition layers. Phase 6 distributed the composition layers
across the four packages: `ReporterLive` lives with the reporter,
`CliLive` with the CLI bin, `McpLive` with the MCP bin. All other live
and test layers (the ones used by more than one package) consolidated
into `packages/shared/src/layers/`.

**Live layers (in shared):**

- `DataStoreLive` -- writes to SQLite via `@effect/sql-sqlite-node`
- `DataReaderLive` -- reads from SQLite via `@effect/sql-sqlite-node`.
  Uses SQL assembler functions to reconstruct `AgentReport` and other
  domain types from normalized row data
- `EnvironmentDetectorLive` -- reads `std-env` exports plus CI env vars
- `ExecutorResolverLive` -- pure mapping logic
- `FormatSelectorLive` -- format selection logic
- `DetailResolverLive` -- detail level resolution logic
- `OutputRendererLive` -- dispatches to registered formatter instances
- `ProjectDiscoveryLive` -- depends on `FileSystem` for glob and stat
- `HistoryTrackerLive` -- classification logic with 10-entry sliding window.
  Depends on DataReader for loading prior history. Uses `classifyTest()`
  pure function
- `LoggerLive(logLevel?, logFile?)` -- structured NDJSON logging via
  `Logger.structuredLogger`, optional file logging via `Logger.zip`
- `OutputPipelineLive` (composite) -- EnvironmentDetectorLive +
  ExecutorResolverLive + FormatSelectorLive + DetailResolverLive +
  OutputRendererLive
- `ConfigLive(projectDir)` (Phase 6) -- builds a `ConfigFile.Live`
  with `TomlCodec` + `FirstMatch` strategy, anchored at `projectDir`,
  resolving via `WorkspaceRoot` -> `GitRoot` -> `UpwardWalk`
  resolvers from `config-file-effect`. Provides
  `VitestAgentReporterConfigFile`. See Component 31.
- `PathResolutionLive(projectDir)` (Phase 6) -- composite layer that
  merges `XdgLive(new AppDirsConfig({ namespace:
  "vitest-agent-reporter" }))`, `ConfigLive(projectDir)`, and
  `WorkspacesLive` (from `workspaces-effect`). Caller still supplies
  `NodeContext.layer` (or `NodeFileSystem.layer`). Provides
  `AppDirs`, `VitestAgentReporterConfigFile`, `WorkspaceDiscovery`,
  and `WorkspaceRoot` -- everything `resolveDataPath` requires. See
  Component 30.

**Live layers (in reporter):**

- `CoverageAnalyzerLive` -- pure computation (duck-typed CoverageMap)

**Test layers:**

- `DataStoreTest` (shared) -- accumulates writes into mutable state container
- `EnvironmentDetectorTest` (shared) -- accepts a fixed environment value
- `CoverageAnalyzerTest` (reporter) -- returns canned data
- `ProjectDiscoveryTest` (shared) -- returns canned data
- `HistoryTrackerTest` (shared) -- returns canned classifications

**Merged composition layers (all functions of
`(dbPath: string, logLevel?, logFile?)`):**

- `ReporterLive` (`packages/reporter/src/layers/ReporterLive.ts`) --
  DataStoreLive + CoverageAnalyzerLive + HistoryTrackerLive +
  OutputPipelineLive + DataReaderLive + SqliteClient + Migrator +
  LoggerLive(...). Used by AgentReporter via `Effect.runPromise`. (No
  longer pulls `NodeContext` directly because `ensureMigrated` and
  `resolveDataPath` provide their own platform layers earlier in the
  pipeline.)
- `CliLive` (`packages/cli/src/layers/CliLive.ts`) -- DataReaderLive +
  ProjectDiscoveryLive + HistoryTrackerLive + OutputPipelineLive +
  SqliteClient + Migrator + NodeContext + NodeFileSystem +
  LoggerLive(...). Used by the CLI bin via `NodeRuntime.runMain`.
- `McpLive` (`packages/mcp/src/layers/McpLive.ts`) -- DataReaderLive +
  DataStoreLive + ProjectDiscoveryLive + OutputPipelineLive +
  SqliteClient + Migrator + NodeContext + NodeFileSystem +
  LoggerLive(...). Used by the MCP server bin via `ManagedRuntime`.
- `OutputPipelineLive`
  (`packages/shared/src/layers/OutputPipelineLive.ts`) --
  EnvironmentDetectorLive + ExecutorResolverLive + FormatSelectorLive +
  DetailResolverLive + OutputRendererLive. Included in all three
  composition layers above.

**Removed in Phase 5:**

- `AgentDetectionLive` / `AgentDetectionTest` -- replaced by
  EnvironmentDetectorLive / EnvironmentDetectorTest
- `CacheWriterLive` / `CacheWriterTest` -- replaced by DataStoreLive /
  DataStoreTest
- `CacheReaderLive` / `CacheReaderTest` -- replaced by DataReaderLive

---

## Component 5: Effect Error Types

**Location:** `packages/shared/src/errors/`

**Status:** COMPLETE (Phase 2-5-6)

**Purpose:** Tagged error types for Effect service failure channels.

- **DataStoreError**
  (`packages/shared/src/errors/DataStoreError.ts`) -- `Data.TaggedError`
  for database failures. Fields: `operation`
  (`"read" | "write" | "migrate"`), `table` (string), `reason` (string).
  Constructor sets `this.message` via `Object.defineProperty` to a derived
  `[operation table] reason` string so `Cause.pretty()` surfaces the
  operation/table/reason instead of the default "An error has occurred".
  Also exports an `extractSqlReason(e: unknown) => string` helper that
  pulls `SqlError.cause.message` (the actual SQLite error like
  `"SQLITE_BUSY: database is locked"` or
  `"UNIQUE constraint failed: ..."`) instead of the generic
  `"Failed to execute statement"` wrapper. Replaces CacheError from
  Phase 2-4.
- **DiscoveryError**
  (`packages/shared/src/errors/DiscoveryError.ts`) --
  `Data.TaggedError` for project discovery failures (glob, read, stat
  operations). Constructor uses the same derived-message pattern as
  DataStoreError (`[operation path] reason`).
- **PathResolutionError** (Phase 6 -- new)
  (`packages/shared/src/errors/PathResolutionError.ts`) --
  `Data.TaggedError` raised when the data directory cannot be resolved.
  The most common case is missing workspace identity (no `projectKey`
  in the config TOML and no `name` in the root `package.json`).
  Constructor sets `this.message` to `args.reason` directly.
  `resolveDataPath` typically surfaces this via the underlying
  `WorkspaceRootNotFoundError` from `workspaces-effect`; this error is
  reserved for path-resolution failures that don't already have a
  more-specific tagged error.

**Removed in Phase 5:**

- `CacheError` -- replaced by DataStoreError

---

## Component 6: Effect Schemas

**Location:** `packages/shared/src/schemas/`

**Status:** COMPLETE (Phase 2-3-4-5-6)

**Purpose:** Single source of truth for all data structures. Defines Effect
Schema definitions with `typeof Schema.Type` for TypeScript types and
`Schema.decodeUnknown`/`Schema.encodeUnknown` for JSON encode/decode.

**Files:**

- `Common.ts` -- shared literals: `TestState`, `TestRunReason`,
  `TestClassification`, `ConsoleOutputMode`, `PluginMode`,
  `ConsoleStrategy`, `PackageManager`, `Environment` (Phase 5:
  `"agent-shell" | "terminal" | "ci-github" | "ci-generic"`),
  `Executor` (`"human" | "agent" | "ci"`), `OutputFormat`
  (`"markdown" | "json" | "vitest-bypass" | "silent"`), `DetailLevel`
  (`"minimal" | "neutral" | "standard" | "verbose"`)
- `AgentReport.ts` -- `AgentReport`, `ModuleReport`, `TestReport`,
  `ReportError` schemas
- `Coverage.ts` -- `CoverageReport`, `CoverageTotals`,
  `FileCoverageReport` schemas
- `Thresholds.ts` -- `MetricThresholds`, `PatternThresholds`,
  `ResolvedThresholds`
- `Baselines.ts` -- `CoverageBaselines`
- `Trends.ts` -- `TrendEntry`, `TrendRecord`
- `CacheManifest.ts` -- `CacheManifest`, `CacheManifestEntry` schemas
- `Options.ts` -- `AgentReporterOptions`, `AgentPluginOptions`,
  `CoverageOptions`, `FormatterOptions` schemas
- `History.ts` -- `TestRun`, `TestHistory`, `HistoryRecord` schemas
- `Config.ts` (Phase 6 -- new) -- `VitestAgentReporterConfig` schema for
  the optional `vitest-agent-reporter.config.toml`. Both fields
  (`cacheDir?: string`, `projectKey?: string`) are optional. When the
  file is absent or these fields are unset, `resolveDataPath` falls
  back to deriving the path from the workspace's `package.json` `name`
  under the XDG data directory.

Istanbul duck-type interfaces remain as TypeScript interfaces, not schemas.

---

## Component 7: CLI Bin

**Location:** `packages/cli/` (own pnpm workspace, Phase 6)

**Status:** COMPLETE (Phase 2-3-4-5-6)

**Purpose:** On-demand test landscape queries for LLM agents. Reads cached
test data from SQLite database and project structure. Does not run tests or
call AI providers. All commands support `--format` flag for output format
selection.

**Package structure (Phase 6):**

The CLI is now its own publishable package (`vitest-agent-reporter-cli`)
with `bin: { "vitest-agent-reporter": "./src/bin.ts" }`. It depends on
`vitest-agent-reporter-shared` for all services and on `@effect/cli`
for the command framework. The reporter package declares the CLI as a
required `peerDependency` so installing the reporter pulls the CLI
along with it.

**Files:**

- `packages/cli/src/bin.ts` -- bin entry point. Resolves `dbPath` via
  `resolveDataPath(process.cwd())` under
  `PathResolutionLive(projectDir) + NodeContext.layer`, then provides
  `CliLive(dbPath, logLevel, logFile)` to the `@effect/cli` `Command.run`
  effect. Handles defects by printing `formatFatalError(cause)` to
  stderr.
- `packages/cli/src/index.ts` -- public `runCli()` re-export.
- `packages/cli/src/commands/{status,overview,coverage,history,trends,cache,doctor}.ts`
  -- one file per subcommand, each a thin wrapper over the matching
  `lib/format-*.ts` function.
- `packages/cli/src/lib/format-{status,overview,coverage,history,trends,doctor}.ts`
  -- testable pure formatting logic.
- `packages/cli/src/layers/CliLive.ts` --
  `CliLive(dbPath, logLevel?, logFile?)` composition layer
  (DataReaderLive + ProjectDiscoveryLive + HistoryTrackerLive +
  OutputPipelineLive + SqliteClient + Migrator + NodeContext +
  NodeFileSystem + LoggerLive).

**Commands:**

- `status` -- reads DB via DataReader, shows per-project pass/fail state
  with re-run commands
- `overview` -- test landscape summary with file-to-test mapping, project
  discovery, and run commands
- `coverage` -- coverage gap analysis from cached reports
- `history` -- surfaces flaky tests, persistent failures, and recovered
  tests with pass/fail run visualization
- `trends` -- per-project coverage trend display with direction, metrics
  table, and trajectory sparkline
- `cache path` -- prints resolved cache directory path
- `cache clean` -- deletes entire cache directory (idempotent)
- `doctor` -- cache health diagnostic

**Removed in Phase 6:**

- `resolve-cache-dir.ts` (and its `resolveDbPath` export) -- the
  artifact-probing resolver that walked
  `node_modules/.vite/vitest/<hash>/...`. Replaced by the deterministic
  `resolveDataPath` orchestrator in `vitest-agent-reporter-shared`
  (Component 30). The `cache path` command now prints the XDG-derived
  path instead of probing for an existing artifact.

**Dependencies:**

- Depends on: `vitest-agent-reporter-shared` for services + path
  resolution; `@effect/cli` for command framework; `@effect/platform-node`
  for `NodeContext`/`NodeRuntime`; `@effect/sql-sqlite-node` for
  `SqliteClient`/`SqliteMigrator`
- Used by: end users via the `vitest-agent-reporter` bin (installed
  alongside the reporter package as a required peer dependency)

---

## Component 8: Formatters

**Location:** `packages/shared/src/formatters/`

**Status:** COMPLETE (Phase 5b, moved to shared in Phase 6)

**Purpose:** Pluggable output formatters implementing the `Formatter`
interface. Each formatter produces `RenderedOutput[]` with target, content,
and contentType fields.

**Files:**

- `types.ts` -- `Formatter`, `FormatterContext`, `RenderedOutput` interfaces
- `markdown.ts` -- structured console markdown with tiered output
  (green/yellow/red). Replaces `utils/format-console.ts` from Phase 1-4
- `gfm.ts` -- GitHub-Flavored Markdown for `GITHUB_STEP_SUMMARY`. Replaces
  `utils/format-gfm.ts` from Phase 1-4
- `json.ts` -- raw JSON output of AgentReport data
- `silent.ts` -- produces no output (database-only mode)

**Key interface:**

```typescript
interface Formatter {
  readonly format: string;
  readonly render: (
    reports: ReadonlyArray<AgentReport>,
    context: FormatterContext,
  ) => ReadonlyArray<RenderedOutput>;
}

interface FormatterContext {
  readonly detail: DetailLevel;
  readonly noColor: boolean;
  readonly coverageConsoleLimit: number;
  readonly trendSummary?: { direction, runCount, firstMetric? };
  readonly runCommand?: string;
  readonly mcp?: boolean;
  readonly githubSummaryFile?: string;
}

interface RenderedOutput {
  readonly target: "stdout" | "file" | "github-summary";
  readonly content: string;
  readonly contentType: string;
}
```

**Dependencies:**

- Depends on: AgentReport schema, Common schema (DetailLevel)
- Used by: OutputRendererLive

---

## Component 9: JSON Report Builder

**Location:** `packages/shared/src/utils/build-report.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2 + Phase 6)

**Purpose:** Pure data transformation function that converts Vitest
`TestModule`/`TestCase` objects into an `AgentReport`. No I/O.

**Implementation note:** Uses duck-typed Vitest interfaces (`VitestTestModule`,
`VitestTestCase`, etc.) rather than importing Vitest types directly, keeping
the formatter independent of the Vitest runtime.

---

## Component 10: Package Manager Detection

**Locations:**

- `packages/shared/src/utils/detect-pm.ts` -- the canonical Effect-aware
  detector used by reporter/CLI for run-command generation
- `plugin/bin/mcp-server.mjs` -- a zero-deps inline copy (~20 lines)
  used by the Claude Code plugin loader. The loader cannot import from
  the shared package because it must run before the user has installed
  any dependencies, so this duplication is intentional. The two
  implementations follow the same detection order

**Status:** COMPLETE (Phase 1, relocated Phase 2 + Phase 6)

**Purpose:** Detects the project's package manager for generating correct
run commands. Uses a `FileSystemAdapter` interface for testability.

**Detection order:**

1. `packageManager` field in `package.json` (e.g., `"pnpm@10.32.1"`)
2. Lockfile presence: `pnpm-lock.yaml` > `package-lock.json` > `yarn.lock`
   > `bun.lock`
3. Falls back to `null` (caller defaults to `npx`)

---

## Component 11: Utility Functions

**Locations:**

- `packages/shared/src/utils/` -- the bulk of pure utilities (everything
  used by more than one package)
- `packages/reporter/src/utils/` -- the reporter-specific subset
  (`capture-env.ts`, `capture-settings.ts`, `resolve-thresholds.ts`,
  `strip-console-reporters.ts`)

**Status:** COMPLETE (Phase 1-5-6)

**Purpose:** Pure utility functions that don't warrant Effect service
wrapping.

**Files in shared (`packages/shared/src/utils/`):**

- `compress-lines.ts` -- converts `[1,2,3,5,10,11,12]` to `"1-3,5,10-12"`
- `safe-filename.ts` -- sanitizes project names for cache file paths
- `ansi.ts` -- ANSI color helpers that no-op when `NO_COLOR` is set
- `compute-trend.ts` -- computes coverage trend entries from current run
  data against existing trend records
- `split-project.ts` (Phase 5) -- splits `"project:subProject"` into
  `{ project, subProject }` tuple for normalized SQLite storage
- `classify-test.ts` (Phase 5) -- pure classification function extracted
  from HistoryTrackerLive. Shared between live layer and CLI formatting
- `format-console.ts` -- legacy console formatter (kept for backward
  compatibility, delegates to markdown formatter)
- `format-gfm.ts` -- legacy GFM formatter (kept for backward
  compatibility, delegates to gfm formatter)
- `format-fatal-error.ts` -- formats fatal error output for unhandled
  reporter errors
- `build-report.ts` -- AgentReport builder with duck-typed Vitest interfaces
- `detect-pm.ts` -- package manager detection (canonical Effect-aware
  version)
- `ensure-migrated.ts` -- process-level migration coordinator (see
  Component 26)
- `normalize-workspace-key.ts` (Phase 6 -- new) -- pure normalization of a
  workspace `name` into a filesystem-safe directory segment. Replaces
  `/` with `__`, replaces other unsafe characters with `_`, and
  collapses runs of `_` produced by substitution. See Component 30
- `resolve-workspace-key.ts` (Phase 6 -- new) -- resolves the normalized
  workspace key for the workspace containing `projectDir` via
  `WorkspaceDiscovery.listPackages` from `workspaces-effect`. Fails
  with `WorkspaceRootNotFoundError` when no root workspace is
  discoverable. See Component 30
- `resolve-data-path.ts` (Phase 6 -- new) -- the headline
  `resolveDataPath(projectDir, options?)` orchestrator. See Component 30

**Files in reporter (`packages/reporter/src/utils/`):**

- `strip-console-reporters.ts` -- removes console reporters from Vitest's
  reporter chain, plus `CONSOLE_REPORTERS` constant. Stayed in the
  reporter package because only the plugin uses it
- `resolve-thresholds.ts` -- parses Vitest-native coverage thresholds
  format into `ResolvedThresholds`. Stayed because the reporter and
  plugin both call it but downstream packages don't
- `capture-env.ts` (Phase 5) -- captures relevant environment variables
  (CI, NODE_ENV, GITHUB_*, RUNNER_*) for settings storage
- `capture-settings.ts` (Phase 5) -- captures Vitest config settings
  (pool, environment, timeouts, coverage provider, etc.) and computes
  a deterministic hash. The `SettingsInput` type that this returns now
  lives in `packages/shared/src/services/DataStore.ts` (Phase 6 move
  to avoid a circular import path between the reporter and shared
  packages)

---

## Component 12: Failure History & Classification

**Location:** `packages/shared/src/services/HistoryTracker.ts`,
`packages/shared/src/layers/HistoryTrackerLive.ts`,
`packages/shared/src/layers/HistoryTrackerTest.ts`,
`packages/shared/src/schemas/History.ts`,
`packages/shared/src/utils/classify-test.ts`

**Status:** COMPLETE (Phase 3, updated Phase 5, moved to shared in
Phase 6)

**Purpose:** Per-test failure persistence across runs and classification-driven
suggestions in console output.

**Phase 5 changes:**

- `classify` signature changed: now accepts `(project, subProject,
  testOutcomes, timestamp)` instead of `(cacheDir, testOutcomes)`
- History stored in SQLite `test_history` table instead of JSON files
- Prior history loaded via `DataReader.getHistory()` instead of
  `CacheReader.readHistory()`
- Classification logic extracted to pure `classifyTest()` function in
  `utils/classify-test.ts` for reuse

**Key interface:**

```typescript
interface TestOutcome {
  fullName: string;
  state: "passed" | "failed";
}

// HistoryTracker.classify signature (Phase 5):
classify: (
  project: string,
  subProject: string | null,
  testOutcomes: ReadonlyArray<TestOutcome>,
  timestamp: string,
) => Effect<{ history, classifications }, DataStoreError>
```

**Classifications:**

- `new-failure` -- first failure (no prior history or prior run passed)
- `persistent` -- failed in two or more consecutive runs
- `flaky` -- mixed pass/fail across recent history
- `recovered` -- previously failed, now passing
- `stable` -- consistently passing

**Dependencies:**

- Depends on: DataReader service (to load prior history)
- Used by: AgentReporter (classification), CLI `history` command

---

## Component 13: Coverage Thresholds

**Location:** `packages/shared/src/schemas/Thresholds.ts`,
`packages/reporter/src/utils/resolve-thresholds.ts`

**Status:** COMPLETE (Phase 4, partially relocated Phase 6)

**Purpose:** Vitest-native coverage threshold parsing and resolution.
Unchanged from Phase 4.

---

## Component 14: Coverage Baselines

**Location:** `packages/shared/src/schemas/Baselines.ts`

**Status:** COMPLETE (Phase 4, storage updated Phase 5)

**Purpose:** Auto-ratcheting coverage baselines that persist high-water
marks per metric.

**Phase 5 change:** Baselines stored in SQLite `coverage_baselines` table
instead of `baselines.json` file. Read via `DataReader.getBaselines()`,
written via `DataStore.writeBaselines()`.

---

## Component 15: Coverage Trends

**Location:** `packages/shared/src/schemas/Trends.ts`,
`packages/shared/src/utils/compute-trend.ts`

**Status:** COMPLETE (Phase 4, storage updated Phase 5)

**Purpose:** Per-project coverage trend tracking with sliding window for
direction analysis over time.

**Phase 5 change:** Trends stored in SQLite `coverage_trends` table instead
of per-project JSON files. Read via `DataReader.getTrends()`, written via
`DataStore.writeTrends()`.

---

## Component 16: CLI Diagnostics (cache, doctor, trends)

**Location:** `packages/cli/src/commands/cache.ts`,
`packages/cli/src/commands/doctor.ts`,
`packages/cli/src/commands/trends.ts`

**Status:** COMPLETE (Phase 4-5, moved to CLI package in Phase 6)

**Purpose:** CLI commands for cache management, health diagnostics, and
coverage trend visualization. All support `--format` flag (Phase 5).
The `cache path` command now prints the deterministic XDG-derived path
(via `resolveDataPath`) rather than scanning the filesystem.

---

## Component 17: DataStore Service

**Location:** `packages/shared/src/services/DataStore.ts`,
`packages/shared/src/layers/DataStoreLive.ts`,
`packages/shared/src/layers/DataStoreTest.ts`

**Status:** COMPLETE (Phase 5a, moved to shared in Phase 6)

**Purpose:** Effect service for writing all test data to the SQLite
database. Replaces CacheWriter from Phase 2-4.

**Write operations:**

- `writeSettings(hash, settings, envVars)` -- Vitest config snapshot
- `writeRun(input: TestRunInput)` -- test run with summary stats, returns
  `runId`
- `writeModules(runId, modules)` -- test modules, returns `moduleId[]`
- `writeSuites(moduleId, suites)` -- test suites, returns `suiteId[]`
- `writeTestCases(moduleId, tests)` -- test cases, returns `testCaseId[]`
- `writeErrors(runId, errors)` -- test/suite/module/unhandled errors
- `writeCoverage(runId, coverage)` -- per-file coverage data
- `writeHistory(project, subProject, fullName, runId, ...)` -- per-test
  history entry
- `writeBaselines(baselines)` -- coverage baselines
- `writeTrends(project, subProject, runId, entry)` -- coverage trend entry
- `writeSourceMap(sourceFilePath, testModuleId, mappingType)` -- source-to-
  test file mapping
- `ensureFile(filePath)` -- ensure file path exists in `files` table,
  returns `fileId`
- `writeNote(note)` / `updateNote(id, fields)` / `deleteNote(id)` -- note
  CRUD operations

**Key input types:**

`TestRunInput`, `ModuleInput`, `TestCaseInput`, `TestErrorInput`,
`FileCoverageInput`, `SuiteInput`, `NoteInput`, **`SettingsInput`** --
all defined in `DataStore.ts`. (Phase 6: `SettingsInput` moved here
from `utils/capture-settings.ts` so the service owns its full input
contract without circular imports between reporter and shared
packages.)

**Bug-fix note (post-2.0):** `TestCaseInput` now carries an optional
`suiteId` field that the reporter populates from
`testCase.parent.fullName` via the `suiteIdMap` it built when writing
suites. This persists `test_cases.suite_id` so
`DataReader.listSuites`'s `SELECT COUNT(*) FROM test_cases WHERE
suite_id = ts.id` aggregation returns real per-suite counts -- the
previous behavior wrote `NULL` for `suite_id` and the count came back
as zero for every suite. The supporting duck-type change (`parent` on
`VitestTestCase` in `packages/shared/src/utils/build-report.ts`) is
optional in the interface so unit-test fixtures don't have to
fabricate a stub.

**Dependencies:**

- Depends on: `@effect/sql-sqlite-node` SqlClient
- Used by: AgentReporter, MCP server (note CRUD)

**Error mapping:** Every `Effect.mapError` callsite that produces a
`DataStoreError` uses `extractSqlReason(e)` (from
`errors/DataStoreError.ts`) for the `reason` field, surfacing the actual
SQLite error message rather than `String(e)` of the SqlError wrapper.
The previously-special-cased `writeErrors` mapError is unified with the
rest using the helper.

---

## Component 18: DataReader Service

**Location:** `packages/shared/src/services/DataReader.ts`,
`packages/shared/src/layers/DataReaderLive.ts`

**Status:** COMPLETE (Phase 5a, moved to shared in Phase 6)

**Purpose:** Effect service for reading all test data from the SQLite
database. Replaces CacheReader from Phase 2-4.

**Read operations:**

- `getLatestRun(project, subProject)` -- returns `Option<AgentReport>`
  for the most recent test run
- `getRunsByProject()` -- returns `ProjectRunSummary[]` for all projects
- `getHistory(project, subProject)` -- returns `HistoryRecord`
- `getBaselines(project, subProject)` -- returns `Option<CoverageBaselines>`
- `getTrends(project, subProject, limit?)` -- returns `Option<TrendRecord>`
- `getFlaky(project, subProject)` -- returns flaky test records
- `getPersistentFailures(project, subProject)` -- returns persistent
  failure records
- `getFileCoverage(runId)` -- returns per-file coverage
- `getCoverage(project, subProject)` -- returns coverage report from
  the latest run for a project (used by MCP `test_coverage` tool)
- `getTestsForFile(filePath)` -- returns test module paths covering a
  source file
- `getErrors(project, subProject, errorName?)` -- returns test errors
  with diffs and stacks
- `getNotes(scope?, project?, testFullName?)` -- returns filtered notes
- `getNoteById(id)` -- returns `Option<NoteRow>`
- `searchNotes(query)` -- full-text search via FTS5
- `getManifest()` -- returns `Option<CacheManifest>` (assembled from DB)
- `getSettings(hash)` -- returns `Option<SettingsRow>`
- `getLatestSettings()` -- returns `Option<SettingsRow>` for the most
  recent settings snapshot (used by MCP `configure` tool when no hash
  is specified)
- `listTests(project, subProject, options?: { state?, module?, limit? })`
  -- returns `TestListEntry[]` for test case discovery
- `listModules(project, subProject)` -- returns `ModuleListEntry[]` for
  test module discovery
- `listSuites(project, subProject, options?: { module? })` -- returns
  `SuiteListEntry[]` for test suite discovery
- `listSettings()` -- returns `SettingsListEntry[]` for settings
  snapshot discovery

**Key output types:**

`ProjectRunSummary`, `FlakyTest`, `PersistentFailure`, `TestError`,
`NoteRow`, `SettingsRow`, `TestListEntry`, `ModuleListEntry`,
`SuiteListEntry`, `SettingsListEntry` -- all defined in `DataReader.ts`.

**Dependencies:**

- Depends on: `@effect/sql-sqlite-node` SqlClient
- Used by: CLI commands, MCP tools, HistoryTracker, AgentReporter

**Error mapping:** All `Effect.mapError` callsites use
`extractSqlReason(e)` (from `errors/DataStoreError.ts`) for the `reason`
field of the resulting `DataStoreError`, exposing the underlying SQLite
error rather than the generic SqlError wrapper.

**Bug-fix notes (post-2.0):**

- `getCoverage` / `getFileCoverage` no longer return `Option.none()`
  when `file_coverage` is empty. The reporter only writes per-file rows
  for files that fall below threshold, so a passing project with full
  coverage produces zero rows -- the previous behavior reported "no
  coverage data" in that case. The query now falls back to
  `coverage_trends` totals (most recent entry for the project) and
  returns a totals-only report when per-file rows are absent. Only
  returns `Option.none()` when both `file_coverage` and
  `coverage_trends` are empty
- `getTestsForFile` now uses `SELECT DISTINCT ... ORDER BY f.path` on
  the source-test mapping query. The previous query returned the same
  test module path N times for a source file with N recorded test
  runs, because `source_test_map` accumulates a row per run
- `getManifest` resolves `cacheDir` (and the per-project `reportFile`
  / `historyFile` placeholders) from SQLite's own metadata via
  `PRAGMA database_list`, picking the file path of the `"main"`
  database. The previous implementation hardcoded the literals
  `"sql:"` and `"sql:<project>"`, which were placeholders left over
  from the pre-SQLite manifest format. In-memory databases (used in
  tests) report an empty file path and the manifest now reflects that

**Location:** `packages/shared/src/migrations/0001_initial.ts`

**Status:** COMPLETE (Phase 5a, moved to shared in Phase 6)

**Purpose:** Initial database migration creating the 25-table normalized
schema. Uses `@effect/sql-sqlite-node` SqliteMigrator with WAL journal
mode and foreign keys enabled.

**Tables:** `files`, `settings`, `settings_env_vars`, `test_runs`,
`scoped_files`, `test_modules`, `test_suites`, `test_cases`, `test_errors`,
`stack_frames`, `tags`, `test_case_tags`, `test_suite_tags`,
`test_annotations`, `test_artifacts`, `attachments`, `import_durations`,
`task_metadata`, `console_logs`, `test_history`, `coverage_baselines`,
`coverage_trends`, `file_coverage`, `source_test_map`, `notes` (plus
`notes_fts` FTS5 virtual table with sync triggers).

See [data-structures.md](./data-structures.md) for the full schema
reference.

---

## Component 20: SQL Helpers

**Location:** `packages/shared/src/sql/rows.ts`,
`packages/shared/src/sql/assemblers.ts`

**Status:** COMPLETE (Phase 5a, moved to shared in Phase 6)

**Purpose:** Row type definitions and assembler functions for reconstructing
domain objects from normalized SQLite rows. Assemblers join data from
multiple tables to build `AgentReport`, `CoverageReport`, and other
composite types.

---

## Component 21: Output Pipeline

**Location:** `packages/shared/src/layers/OutputPipelineLive.ts`
(composition), `packages/shared/src/services/EnvironmentDetector.ts`,
`packages/shared/src/services/ExecutorResolver.ts`,
`packages/shared/src/services/FormatSelector.ts`,
`packages/shared/src/services/DetailResolver.ts`,
`packages/shared/src/services/OutputRenderer.ts`

**Status:** COMPLETE (Phase 5b, moved to shared in Phase 6)

**Purpose:** Five chained Effect services forming a pluggable output
pipeline that determines environment, executor role, output format, detail
level, and performs rendering.

**Pipeline flow:**

```text
EnvironmentDetector.detect()
  -> "agent-shell" | "terminal" | "ci-github" | "ci-generic"
     |
     v
ExecutorResolver.resolve(env, mode)
  -> "human" | "agent" | "ci"
     |
     v
FormatSelector.select(executor, explicitFormat?)
  -> "markdown" | "json" | "vitest-bypass" | "silent"
     |
     v
DetailResolver.resolve(executor, health, explicitDetail?)
  -> "minimal" | "neutral" | "standard" | "verbose"
     |
     v
OutputRenderer.render(reports, format, context)
  -> RenderedOutput[] (target + content + contentType)
```

**Dependencies:**

- Depends on: Formatter implementations, Common schema literals
- Used by: ReporterLive, CliLive, McpLive (via OutputPipelineLive)

---

## Component 22: MCP Server

**Location:** `packages/mcp/` (own pnpm workspace, Phase 6)

**Status:** COMPLETE (Phase 5c, extracted to its own package in Phase 6)

**Purpose:** Model Context Protocol server providing 24 tools for agent
integration. Uses `@modelcontextprotocol/sdk` with stdio transport and
tRPC for routing.

**Package structure (Phase 6):**

The MCP server is now its own publishable package
(`vitest-agent-reporter-mcp`) with `bin: { "vitest-agent-reporter-mcp":
"./src/bin.ts" }`. It depends on `vitest-agent-reporter-shared` for
services, and on `@modelcontextprotocol/sdk`, `@trpc/server`, and
`zod`. The reporter package declares this MCP package as a required
`peerDependency` so installing the reporter pulls the MCP server with
it.

**Entry point:** `packages/mcp/src/bin.ts` -- resolves the user's
`projectDir` via the precedence
`VITEST_AGENT_REPORTER_PROJECT_DIR` (set by the plugin loader, see
Component 24) > `CLAUDE_PROJECT_DIR` > `process.cwd()`. Then resolves
`dbPath` via `resolveDataPath(projectDir)` under
`PathResolutionLive(projectDir) + NodeContext.layer`, creates
`ManagedRuntime.make(McpLive(dbPath, logLevel, logFile))`, and calls
`startMcpServer({ runtime, cwd: projectDir })`.

**Files:**

- `bin.ts` -- bin entry (above)
- `index.ts` -- programmatic entry (callable by other tools)
- `context.ts` -- tRPC context definition with `ManagedRuntime` carrying
  DataReader, DataStore, ProjectDiscovery, OutputRenderer services
- `router.ts` -- tRPC router aggregating all 24 tool procedures
- `server.ts` -- `startMcpServer()` registers all tools with the MCP SDK
- `layers/McpLive.ts` -- `McpLive(dbPath, logLevel?, logFile?)`
  composition layer
- `tools/help.ts` -- `help` tool (list all available tools)
- `tools/status.ts` -- `test_status` tool
- `tools/overview.ts` -- `test_overview` tool
- `tools/coverage.ts` -- `test_coverage` tool
- `tools/history.ts` -- `test_history` tool
- `tools/trends.ts` -- `test_trends` tool
- `tools/errors.ts` -- `test_errors` tool
- `tools/test-for-file.ts` -- `test_for_file` tool
- `tools/test-get.ts` -- `test_get` tool (single test detail)
- `tools/file-coverage.ts` -- `file_coverage` tool (per-file coverage)
- `tools/run-tests.ts` -- `run_tests` tool (executes `vitest run` via
  `spawnSync`)
- `tools/cache-health.ts` -- `cache_health` tool
- `tools/configure.ts` -- `configure` tool (view captured settings)
- `tools/notes.ts` -- `note_create`, `note_list`, `note_get`,
  `note_update`, `note_delete`, `note_search` tools
- `tools/project-list.ts` -- `project_list` tool
- `tools/test-list.ts` -- `test_list` tool
- `tools/module-list.ts` -- `module_list` tool
- `tools/suite-list.ts` -- `suite_list` tool
- `tools/settings-list.ts` -- `settings_list` tool

**Tool categories:**

- **Meta tools** (return markdown): `help`
- **Read-only query tools** (return markdown): `test_status`,
  `test_overview`, `test_coverage`, `test_history`, `test_trends`,
  `test_errors`, `test_for_file`, `test_get`, `file_coverage`,
  `cache_health`, `configure`
- **Discovery tools** (return markdown): `project_list`, `test_list`,
  `module_list`, `suite_list`, `settings_list`
- **Mutation tools** (return text): `run_tests`
- **Note CRUD tools** (return markdown for list/search, JSON for
  create/get/update/delete): `note_create`, `note_list`, `note_get`,
  `note_update`, `note_delete`, `note_search`

**Bug-fix notes (post-2.0):**

- `module_list`, `suite_list`, and `test_list` now enumerate every
  project from `DataReader.getRunsByProject()` when `project` is
  unspecified, grouping output under per-project `### project` headers.
  The previous behavior defaulted to a literal project named
  `"default"`, which matched no projects in real multi-project Vitest
  configs (where names are typically `unit`, `integration`, etc.) and
  the tools returned empty
- `test_coverage` and `file_coverage` benefit from the
  `DataReader.getCoverage` fall-back to `coverage_trends` totals
  described above -- a passing project with full coverage no longer
  reports "no coverage data"
- `cache_health`, `test_for_file`, and `suite_list` benefit from the
  corresponding `DataReader` / reporter fixes (real `cacheDir` from
  `PRAGMA database_list`, deduplicated test-for-file results, real
  per-suite test counts from `test_cases.suite_id`)

**Dependencies:**

- Depends on: `vitest-agent-reporter-shared` (for DataReader,
  DataStore, ProjectDiscovery, OutputRenderer, path resolution),
  `@modelcontextprotocol/sdk`, `@trpc/server`, `zod`,
  `@effect/platform-node`, `@effect/sql-sqlite-node`
- Used by: Claude Code plugin (via the inline `mcpServers` config in
  `plugin.json`, which spawns the bin through the user's package
  manager -- see Component 24; the plugin also auto-allows all 24
  tools via a `PreToolUse` hook so they don't trigger permission
  prompts -- see Component 24), and any MCP-compatible agent

---

## Component 23: tRPC Router

**Location:** `packages/mcp/src/router.ts`,
`packages/mcp/src/context.ts`

**Status:** COMPLETE (Phase 5c, moved with the MCP package in Phase 6)

**Purpose:** tRPC router aggregating all 24 MCP tool procedures. The context
carries a `ManagedRuntime` for Effect service access, allowing tRPC
procedures to call Effect services via `ctx.runtime.runPromise(effect)`.

**Key interface:**

```typescript
interface McpContext {
  readonly runtime: ManagedRuntime<
    DataReader | DataStore | ProjectDiscovery | OutputRenderer,
    never
  >;
  readonly cwd: string;
}
```

---

## Component 24: Claude Code Plugin

**Location:** `plugin/`

**Status:** COMPLETE (Phase 5d, loader rewritten in Phase 6)

**Purpose:** File-based Claude Code plugin providing MCP server
auto-registration, lifecycle hooks, skills, and commands for Vitest
integration in Claude Code sessions.

**Structure:**

- `.claude-plugin/plugin.json` -- plugin manifest (name, version, author)
  with inline `mcpServers` configuration (unchanged from Phase 5d --
  still declares a `vitest-reporter` server with `command: "node"` and
  `args: ["${CLAUDE_PLUGIN_ROOT}/bin/mcp-server.mjs"]`)
- `bin/mcp-server.mjs` (Phase 6 -- **completely rewritten**) -- now a
  zero-deps PM-detect-and-spawn script. Reads
  `process.env.CLAUDE_PROJECT_DIR` (or falls back to `process.cwd()`).
  Detects the user's package manager via the `packageManager` field in
  `package.json` or by lockfile presence (`pnpm-lock.yaml`, `bun.lock`,
  `bun.lockb`, `yarn.lock`, `package-lock.json`; defaults to `npm`).
  Spawns `<pm exec> vitest-agent-reporter-mcp` (`pnpm exec`,
  `npx --no-install`, `yarn run`, or `bun x`) with `stdio: "inherit"`
  and `cwd: projectDir`. Forwards `CLAUDE_PROJECT_DIR` through a new
  `VITEST_AGENT_REPORTER_PROJECT_DIR` env var so the spawned MCP
  subprocess sees the right project root (Claude Code does not
  reliably propagate `CLAUDE_PROJECT_DIR` to MCP server subprocesses).
  Forwards exit code; on non-zero exit prints PM-specific install
  instructions (e.g. `pnpm add -D vitest-agent-reporter`,
  `npm install --save-dev vitest-agent-reporter`). Re-raises termination
  signals on the parent so kill semantics propagate. The script is
  zero-deps (`node:child_process`, `node:fs`, `node:path` only) so it
  runs before the user has installed anything
- `hooks/hooks.json` -- hook configuration (SessionStart, PreToolUse,
  PostToolUse)
- `hooks/session-start.sh` -- SessionStart hook: injects test context
  into the session via bash
- `hooks/pre-tool-use-mcp.sh` -- PreToolUse hook (post-2.0) matching
  `mcp__vitest-agent-reporter__.*`. Reads the PreToolUse envelope,
  strips the `mcp__vitest-agent-reporter__` prefix from `tool_name`,
  and emits a `permissionDecision: "allow"` JSON response when the
  remaining suffix appears in `lib/safe-mcp-vitest-agent-reporter-ops.txt`.
  Tools not in the allowlist (including any future MCP tool added
  before the allowlist is updated) fall through to the standard
  permission prompt. 5-second hook timeout
- `hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt` -- enumerates all
  24 MCP tools to auto-allow (one operation suffix per line, with `#`
  comments for category headings: meta `help`; 11 read-only queries;
  5 discovery tools; `run_tests`; 6 note CRUD ops). The script strips
  blank lines and comments before doing an exact match
- `hooks/post-test-run.sh` -- PostToolUse hook on Bash tool: detects
  test runs and triggers post-run actions
- `skills/tdd/SKILL.md` -- TDD workflow skill
- `skills/debugging/SKILL.md` -- test debugging skill
- `skills/configuration/SKILL.md` -- Vitest configuration skill
- `skills/coverage-improvement/SKILL.md` -- coverage improvement skill
- `commands/setup.md` -- setup command
- `commands/configure.md` -- configure command

**Note:** The `plugin/` directory is NOT a pnpm workspace. It is a
file-based plugin consumed by Claude Code directly.

**Phase 6 retired Decision 29:**

The previous loader (Phase 5d / bug/startup branch) walked
`node_modules` looking for `vitest-agent-reporter`, read its
`exports['./mcp']` from `package.json`, and dynamically imported it
via a `file://` URL to bypass Node's strict-exports CJS rejection.
That approach is gone. The new spawn-via-PM design is the correct one
because (a) `vitest-agent-reporter-mcp` is now its own package with
its own bin, so the user's PM can resolve and execute it directly --
no `file://` dance required; (b) a missing peer dependency now
surfaces as a PM-level error with PM-native install instructions
instead of a confusing "couldn't find ./mcp export" message; and (c)
the loader does not need to understand Effect, exports maps, or
better-sqlite3 native bindings -- it just spawns a process and
forwards stdio. See Decision 30 (Phase 6) for the full rationale.

**Dependencies:**

- Depends on: a project-level install of `vitest-agent-reporter` (which
  in turn pulls `vitest-agent-reporter-mcp` via its required
  `peerDependency`). The MCP server is not bundled with the plugin
  because both packages depend on the shared package, which depends on
  `better-sqlite3` -- a native module that must match the user's
  platform/Node version
- Used by: Claude Code (automatic plugin discovery)

---

## Component 25: LoggerLive

**Location:** `packages/shared/src/layers/LoggerLive.ts`

**Status:** COMPLETE (post-Phase-5, moved to shared in Phase 6)

**Purpose:** Effect-based structured logging layer factory. Provides
NDJSON logging to stderr plus optional file logging via `Logger.zip`.
Replaces the previous `debug` boolean option with fine-grained
`logLevel` and `logFile` controls.

**Configuration:**

- `logLevel` option: `"Debug"`, `"Info"`, `"Warning"`, `"Error"`,
  `"None"` (default). Case-insensitive via `resolveLogLevel()` helper
  (exported from `LoggerLive.ts`; lowercase "debug" normalized to "Debug")
- `logFile` option: optional file path for NDJSON log output, resolved
  via `resolveLogFile()` helper (exported from `LoggerLive.ts`)
- Environment variable fallback: `VITEST_REPORTER_LOG_LEVEL`,
  `VITEST_REPORTER_LOG_FILE`
- Uses `Logger.structuredLogger` for NDJSON format
- `Logger.zip` combines stderr + file loggers when `logFile` is set

**Usage:** `Effect.logDebug` calls on all 30+ DataStore and DataReader
methods for comprehensive I/O tracing.

**Dependencies:**

- Depends on: `effect` (Logger, LogLevel)
- Used by: ReporterLive, CliLive (included in composition layers)

---

## Component 26: ensureMigrated

**Location:** `packages/shared/src/utils/ensure-migrated.ts`

**Status:** COMPLETE (bug/startup branch, moved to shared in Phase 6)

**Phase 6 investigation:** The original 2.0 plan flagged an open
question about whether `xdg-effect`'s `SqliteState.Live` could replace
the homemade `SqliteClient` + `SqliteMigrator` + `ensureMigrated`
pattern. The investigation concluded **keep our pattern**:
`SqliteState.Live` re-runs migrations on each Layer construction
without process-level coordination, so multi-project Vitest configs
sharing one DB would reintroduce the SQLITE_BUSY race that Decision 28
was created to fix. The migration tracking tables also differ
(`_xdg_migrations` vs `effect_sql_migrations`), so a swap would need
a one-time bootstrap. See Decision 32 for the full rationale.

**Purpose:** Process-level migration coordinator that ensures the SQLite
database at a given `dbPath` is migrated exactly once per process before
any reporter instance attempts to read or write.

**Background:** In multi-project Vitest configurations, a single Vitest
process creates multiple `AgentReporter` instances (one per project)
that all share the same `data.db`. With a fresh database, each reporter
previously ran migrations through its own `SqliteClient` connection.
Two connections both starting deferred transactions and then upgrading
to write produced `SQLITE_BUSY` (database is locked) -- SQLite's busy
handler is not invoked for write-write upgrade conflicts in deferred
transactions. After this fix, migration runs exactly once per `dbPath`;
subsequent concurrent writes work normally under WAL mode plus
better-sqlite3's 5s `busy_timeout`.

**Key API:**

```typescript
function ensureMigrated(
  dbPath: string,
  logLevel?: LogLevel.LogLevel,
  logFile?: string,
): Promise<void>;

function _resetMigrationCacheForTesting(): void; // @internal
```

**Implementation:**

- Uses a `globalThis`-keyed cache
  (`Symbol.for("vitest-agent-reporter/migration-promises")`) of
  `Map<string, Promise<void>>` to serialize migrations across reporter
  instances. The promise cache lives on `globalThis` because Vite's
  multi-project pipeline can load this module under separate module
  instances even in the same process; a module-local Map would result
  in independent caches per project, defeating the coordination
- Builds a one-shot Effect program that acquires `SqlClient` (forcing
  the SQLite layer to set WAL mode and the Migrator layer to apply
  migrations), provides `MigratorLayer`, `SqliteClient`, NodeContext,
  and `LoggerLive(logLevel, logFile)`, then runs it via
  `Effect.runPromise`
- Caches the in-flight promise by `dbPath`. Concurrent calls share the
  same promise; subsequent calls (after resolution) are no-ops
- Suppresses `unhandledRejection` on the cached reference; callers await
  the returned promise and handle rejection themselves

**Dependencies:**

- Depends on: `@effect/sql-sqlite-node` (SqliteClient, SqliteMigrator),
  `@effect/sql/SqlClient`, `@effect/platform-node/NodeContext`,
  `effect` (Effect, Layer), `LoggerLive`, `migrations/0001_initial`
- Used by: `AgentReporter.onTestRunEnd` (called via `await` before the
  main `Effect.runPromise`); errors are caught and printed via
  `formatFatalError` to stderr with an early return

---

## Component 27: vitest-agent-reporter-shared package

**Location:** `packages/shared/` (entry: `packages/shared/src/index.ts`)

**Status:** COMPLETE (Phase 6)

**Purpose:** The no-internal-dependencies base package that the
reporter, CLI, and MCP packages all depend on. Owns the data layer,
all shared services and layers, formatters, error types, schemas,
SQLite migrations, SQL helpers, and the new XDG path-resolution
stack. Anything used by more than one of the three runtime packages
lives here. Anything used by exactly one of them stays in that package.

**npm name:** `vitest-agent-reporter-shared`

**Key external dependencies (Phase 6 additions):**

- `xdg-effect ^1.0.1` -- `AppDirs` namespace, `XdgLive` layer,
  optionally `SqliteState.Live` (not currently used -- see Component
  26 / Decision 32)
- `config-file-effect ^0.2.0` -- `ConfigFile.Tag`, `ConfigFile.Live`,
  `TomlCodec`, `FirstMatch` strategy, `WorkspaceRoot` / `GitRoot` /
  `UpwardWalk` resolvers
- `workspaces-effect ^0.5.1` -- `WorkspacesLive`,
  `WorkspaceDiscovery`, `WorkspaceRoot`, `WorkspaceRootNotFoundError`

Plus the existing `effect`, `@effect/platform`,
`@effect/platform-node`, `@effect/sql`, `@effect/sql-sqlite-node`,
`std-env`.

**Internal dependents:** the reporter, cli, and mcp packages (each via
`workspace:*`).

**External consumers:** none directly. Although `vitest-agent-reporter-
shared` is published to npm so pnpm/npm/yarn can hoist it correctly,
end users install it transitively as a dependency of the reporter.

---

## Component 28: vitest-agent-reporter-cli package

**Location:** `packages/cli/` (entry: `packages/cli/src/bin.ts`)

**Status:** COMPLETE (Phase 6)

**Purpose:** Houses the `vitest-agent-reporter` bin and the
`CliLive(dbPath, logLevel?, logFile?)` composition layer. See
Component 7 for the command list, lib functions, and bin behavior.

**npm name:** `vitest-agent-reporter-cli`
**bin:** `vitest-agent-reporter`

**Dependencies:** `vitest-agent-reporter-shared`, `@effect/cli`,
`@effect/platform`, `@effect/platform-node`, `@effect/sql`,
`@effect/sql-sqlite-node`, `effect`.

**Why a separate package:** Independent versioning, smaller install
footprint for users who only want the CLI bin without the reporter or
the MCP server, and clear ownership of `@effect/cli` (which the
reporter doesn't need at runtime).

---

## Component 29: vitest-agent-reporter-mcp package

**Location:** `packages/mcp/` (entry: `packages/mcp/src/bin.ts`)

**Status:** COMPLETE (Phase 6)

**Purpose:** Houses the `vitest-agent-reporter-mcp` bin and the
`McpLive(dbPath, logLevel?, logFile?)` composition layer. See
Component 22 for the tool list, file structure, and dependency graph.

**npm name:** `vitest-agent-reporter-mcp`
**bin:** `vitest-agent-reporter-mcp`

**Dependencies:** `vitest-agent-reporter-shared`,
`@modelcontextprotocol/sdk`, `@trpc/server`, `zod`,
`@effect/platform`, `@effect/platform-node`, `@effect/sql`,
`@effect/sql-sqlite-node`, `effect`.

**Why a separate package:** Independent versioning is the headline
reason -- the MCP tool surface evolves on a different cadence than
the reporter and breaking MCP changes shouldn't force a reporter
major. Also: the MCP server's transitive dependency footprint
(MCP SDK, tRPC, zod) is large enough that users who don't run an MCP
server should not pay for it. The reporter declares
`vitest-agent-reporter-mcp` as a required `peerDependency` so it gets
installed alongside, but that gives lockfile-level version
coordination without bundling the dependency tree.

---

## Component 30: XDG path resolution

**Locations:**

- `packages/shared/src/utils/resolve-data-path.ts` -- the headline
  `resolveDataPath(projectDir, options?)` orchestrator
- `packages/shared/src/utils/resolve-workspace-key.ts` --
  `resolveWorkspaceKey(projectDir)` walks `WorkspaceDiscovery` to
  find the root workspace and normalize its `name`
- `packages/shared/src/utils/normalize-workspace-key.ts` --
  pure `normalizeWorkspaceKey(name)` (the path-segment normalizer)
- `packages/shared/src/layers/PathResolutionLive.ts` --
  `PathResolutionLive(projectDir)` composite layer

**Status:** COMPLETE (Phase 6 -- new)

**Purpose:** Replace the artifact-probing `resolveDbPath` with
deterministic XDG-based resolution. Closes
[issue #39](https://github.com/spencerbeggs/agent-reporter/issues/39).
The path is now a function of workspace identity, not filesystem
layout.

**`resolveDataPath` precedence (highest first):**

1. `options.cacheDir` (programmatic). Used by the reporter's
   `ensureDbPath` short-circuit when `reporter.cacheDir` is set on the
   plugin or reporter -- skips the heavy XDG/workspace layer stack
   entirely (since `WorkspacesLive` eagerly scans lockfiles and walks
   the package graph at layer construction). Returns
   `<cacheDir>/data.db` after `mkdirSync(<cacheDir>, { recursive:
   true })`.
2. `cacheDir` from `vitest-agent-reporter.config.toml`. Same shape:
   `<cacheDir>/data.db` after `mkdirSync`.
3. `projectKey` from the same config TOML. Used as the
   `<workspaceKey>` segment under the XDG data root. Normalized via
   `normalizeWorkspaceKey`.
4. Workspace name from the root `package.json` `name`, resolved via
   `resolveWorkspaceKey(projectDir)` -> `WorkspaceDiscovery` -> root
   `WorkspacePackage.name` -> `normalizeWorkspaceKey(name)`.
5. Fail with `WorkspaceRootNotFoundError` (from `workspaces-effect`)
   if no root workspace is discoverable. **No silent fallback to a
   path hash** -- silent fallbacks make the DB location depend on
   filesystem layout rather than identity.

The XDG data root is `AppDirs.ensureData` from `xdg-effect` with
`namespace: "vitest-agent-reporter"`. On systems with `XDG_DATA_HOME`
that resolves to `$XDG_DATA_HOME/vitest-agent-reporter`; otherwise it
falls back to `~/.local/share/vitest-agent-reporter` per `xdg-effect`'s
`AppDirs` semantics. `ensureData` creates the directory if missing so
better-sqlite3 can open the DB without separately mkdir'ing the
parent.

**`normalizeWorkspaceKey` rules:**

1. Replace `/` with `__` so `@org/pkg` collapses to `@org__pkg`
   instead of introducing a subdirectory boundary.
2. Replace any character outside `[A-Za-z0-9._@-]` with `_` (catches
   Windows-reserved chars, control chars, whitespace).
3. Collapse runs of underscores produced by step 2 (`_{3,}`) into
   `__` so the output stays compact.

**`PathResolutionLive(projectDir)` composition:**

Merges three layers in one shot:

- `XdgLive(new AppDirsConfig({ namespace: "vitest-agent-reporter" }))`
  -- provides `AppDirs`
- `ConfigLive(projectDir)` -- provides
  `VitestAgentReporterConfigFile` (see Component 31)
- `WorkspacesLive` from `workspaces-effect` -- provides
  `WorkspaceDiscovery` and `WorkspaceRoot`

Callers still need to provide `FileSystem` and `Path` (typically via
`NodeContext.layer` or `NodeFileSystem.layer`). All three runtime
packages use this composite when calling `resolveDataPath`:

- Reporter: `AgentReporter.ensureDbPath()` runs
  `Effect.provide(PathResolutionLive(projectDir)).pipe(
    Effect.provide(NodeContext.layer))`
- CLI: `packages/cli/src/bin.ts` provides the same combo at the top
  of the program
- MCP: `packages/mcp/src/bin.ts` provides the same combo

**Why workspace-name keying (vs path-hash):**

- **Worktree consistency:** two checkouts of the same repo
  (`~/code/my-app` vs `~/worktrees/my-app-branch`) resolve to the
  same workspace name and share history.
- **Disk-move resilience:** moving a project preserves the workspace
  name; the DB follows the project identity rather than its
  filesystem coordinates.
- **Human-readable layout:** `ls
  ~/.local/share/vitest-agent-reporter/` shows package names instead
  of opaque hashes.
- **Forks:** a fork that renames its package gets its own DB
  automatically.

The collision case -- two unrelated projects sharing the same root
`name` -- is handled by the `projectKey` config override.

---

## Component 31: TOML config file

**Locations:**

- `packages/shared/src/schemas/Config.ts` --
  `VitestAgentReporterConfig` schema (see Component 6)
- `packages/shared/src/services/Config.ts` --
  `VitestAgentReporterConfigFile` typed `Context.Tag` and the
  `VitestAgentReporterConfigFileService` type alias
- `packages/shared/src/layers/ConfigLive.ts` --
  `ConfigLive(projectDir)` factory

**Status:** COMPLETE (Phase 6 -- new)

**Purpose:** Optional `vitest-agent-reporter.config.toml` lets users
override the default XDG data location without code changes. Both
fields are optional. When the file is absent or both fields are
unset, `resolveDataPath` falls back to deriving the path from the
workspace's `package.json` `name`.

**Schema (`Config.ts`):**

```typescript
class VitestAgentReporterConfig extends Schema.Class<...>(...)({
  cacheDir: Schema.optional(Schema.String),
  projectKey: Schema.optional(Schema.String),
}) {}
```

- `cacheDir` -- absolute path overriding the entire data directory.
  Highest precedence after the programmatic option.
- `projectKey` -- overrides the workspace key segment under the XDG
  data directory. Use this for the "two unrelated `my-app`s"
  collision case, or when you want a stable key independent of
  `name` changes.

**Service tag (`Config.ts`):**

```typescript
type VitestAgentReporterConfigFileService =
  ConfigFileService<VitestAgentReporterConfig>;
const VitestAgentReporterConfigFile =
  ConfigFile.Tag<VitestAgentReporterConfig>("vitest-agent-reporter/Config");
```

**Live layer (`ConfigLive.ts`):**

`ConfigLive(projectDir)` builds a `ConfigFile.Live` with:

- `tag: VitestAgentReporterConfigFile`
- `schema: VitestAgentReporterConfig`
- `codec: TomlCodec` (from `config-file-effect`)
- `strategy: FirstMatch` (first found resolver wins)
- `resolvers:` `WorkspaceRoot({ filename:
  "vitest-agent-reporter.config.toml", cwd: projectDir })` ->
  `GitRoot({ filename: "vitest-agent-reporter.config.toml", cwd:
  projectDir })` -> `UpwardWalk({ filename: "vitest-agent-reporter.
  config.toml", cwd: projectDir })`

Resolvers anchor at `projectDir` rather than `process.cwd()` so the
plugin-spawned MCP server sees the right config when invoked from
elsewhere.

When no file is present, downstream callers use
`config.loadOrDefault(new VitestAgentReporterConfig({}))` to get an
empty config (both fields undefined) -- never an error.

---

## Component 32: PathResolutionError

**Location:** `packages/shared/src/errors/PathResolutionError.ts`

**Status:** COMPLETE (Phase 6 -- new)

See Component 5 for the full description.
