---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-03-25
last-synced: 2026-03-25
post-phase5-sync: 2026-03-25
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

**Location:** `package/src/reporter.ts`

**Status:** COMPLETE (Phase 1-2-3-4-5)

**Purpose:** Vitest Reporter that produces three outputs: formatted output
to console (via output pipeline), persistent data to SQLite database per
project, and optional GFM for GitHub Actions. Uses Effect services for
database I/O, coverage processing, failure history tracking, coverage
baselines/trends, and output rendering.

**Responsibilities:**

- Store `Vitest` instance in `onInit` for project enumeration
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

**Location:** `package/src/plugin.ts`

**Status:** COMPLETE (Phase 1-2-4-5)

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
- Resolve cache directory with priority: explicit option > `outputFile`
  config > `vite.cacheDir + "/vitest-agent-reporter"`
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

**Location:** `package/src/services/`

**Status:** COMPLETE (Phase 2-3-5)

**Purpose:** Effect `Context.Tag` definitions for all shared functionality.
Each service is a tag with a typed interface. Live implementations use
`@effect/platform` and `@effect/sql-sqlite-node` for I/O; test
implementations use mock state containers.

**Services (10 total):**

- **DataStore** (`package/src/services/DataStore.ts`) -- writes test runs,
  modules, suites, test cases, errors, coverage, history, baselines, trends,
  settings, source maps, and notes to SQLite via `@effect/sql-sqlite-node`.
  Provides `writeRun`, `writeModules`, `writeSuites`, `writeTestCases`,
  `writeErrors`, `writeCoverage`, `writeHistory`, `writeBaselines`,
  `writeTrends`, `writeSettings`, `writeSourceMap`, `ensureFile`,
  `writeNote`, `updateNote`, `deleteNote` effects. Replaces CacheWriter
  from Phase 2-4
- **DataReader** (`package/src/services/DataReader.ts`) -- reads test data
  from SQLite. Provides `getLatestRun`, `getRunsByProject`, `getHistory`,
  `getBaselines`, `getTrends`, `getFlaky`, `getPersistentFailures`,
  `getFileCoverage`, `getCoverage`, `getTestsForFile`, `getErrors`,
  `getNotes`, `getNoteById`, `searchNotes`, `getManifest`, `getSettings`,
  `getLatestSettings`, `listTests`, `listModules`, `listSuites`,
  `listSettings` effects. Returns `Option.none()` for missing data.
  Shared between reporter, CLI, and MCP server. Replaces CacheReader
  from Phase 2-4
- **EnvironmentDetector** (`package/src/services/EnvironmentDetector.ts`) --
  wraps `std-env` for four-environment detection. Provides `detect()`,
  `isAgent`, and `agentName` effects. Returns `Environment` type:
  `"agent-shell" | "terminal" | "ci-github" | "ci-generic"`. Replaces
  AgentDetection from Phase 2
- **ExecutorResolver** (`package/src/services/ExecutorResolver.ts`) -- maps
  environment + mode to an executor role. Provides `resolve(env, mode)`
  returning `Executor` type: `"human" | "agent" | "ci"`
- **FormatSelector** (`package/src/services/FormatSelector.ts`) -- selects
  output format based on executor and explicit override. Provides
  `select(executor, explicitFormat?)` returning `OutputFormat` type:
  `"markdown" | "json" | "vitest-bypass" | "silent"`
- **DetailResolver** (`package/src/services/DetailResolver.ts`) -- determines
  output detail level based on executor, run health, and explicit override.
  Provides `resolve(executor, health, explicit?)` returning `DetailLevel`
  type: `"minimal" | "neutral" | "standard" | "verbose"`. `RunHealth`
  interface carries `hasFailures`, `belowTargets`, `hasTargets` flags
- **OutputRenderer** (`package/src/services/OutputRenderer.ts`) -- renders
  reports using the selected formatter. Provides `render(reports, format,
  context)` returning `RenderedOutput[]` with target, content, and
  contentType
- **CoverageAnalyzer** (`package/src/services/CoverageAnalyzer.ts`) --
  processes istanbul CoverageMap with optional scoping. Provides `process`
  (full analysis) and `processScoped` (filtered to tested source files)
  effects. Unchanged from Phase 2
- **ProjectDiscovery** (`package/src/services/ProjectDiscovery.ts`) --
  glob-based test file discovery for the CLI. Provides `discoverTestFiles`
  and `mapTestToSource` effects. Unchanged from Phase 2
- **HistoryTracker** (`package/src/services/HistoryTracker.ts`) -- classifies
  test outcomes against stored history. Provides a `classify` method
  accepting `project`, `subProject`, `testOutcomes[]`, and `timestamp`,
  returning history records plus a classifications map
  (`Map<string, TestClassification>`). Uses a 10-entry sliding window.
  Depends on DataReader to load prior history. Phase 5 changed signature
  to include `project`/`subProject` parameters (removed `cacheDir`)

---

## Component 4: Effect Layers

**Location:** `package/src/layers/`

**Status:** COMPLETE (Phase 2-3-5)

**Purpose:** Live and test implementations for all Effect services, plus
merged composition layers.

**Live layers:**

- `DataStoreLive` -- writes to SQLite via `@effect/sql-sqlite-node`
- `DataReaderLive` -- reads from SQLite via `@effect/sql-sqlite-node`.
  Uses SQL assembler functions to reconstruct `AgentReport` and other
  domain types from normalized row data
- `EnvironmentDetectorLive` -- reads `std-env` exports plus CI env vars
- `ExecutorResolverLive` -- pure mapping logic
- `FormatSelectorLive` -- format selection logic
- `DetailResolverLive` -- detail level resolution logic
- `OutputRendererLive` -- dispatches to registered formatter instances
- `CoverageAnalyzerLive` -- pure computation (duck-typed CoverageMap)
- `ProjectDiscoveryLive` -- depends on `FileSystem` for glob and stat
- `HistoryTrackerLive` -- classification logic with 10-entry sliding window.
  Depends on DataReader for loading prior history. Uses `classifyTest()`
  pure function

**Test layers:**

- `DataStoreTest` -- accumulates writes into mutable state container
- `EnvironmentDetectorTest` -- accepts a fixed environment value
- `CoverageAnalyzerTest` -- returns canned data
- `ProjectDiscoveryTest` -- returns canned data
- `HistoryTrackerTest` -- returns canned classifications

**Merged layers (all functions of `dbPath: string`):**

- `ReporterLive(dbPath)` (`package/src/layers/ReporterLive.ts`) --
  DataStoreLive + CoverageAnalyzerLive + HistoryTrackerLive +
  OutputPipelineLive + DataReaderLive + SqliteClient + Migrator +
  NodeContext. Used by AgentReporter via `Effect.runPromise`
- `CliLive(dbPath)` (`package/src/layers/CliLive.ts`) -- DataReaderLive +
  ProjectDiscoveryLive + HistoryTrackerLive + OutputPipelineLive +
  SqliteClient + Migrator + NodeContext + NodeFileSystem. Used by CLI
  via `NodeRuntime.runMain`
- `McpLive(dbPath)` (`package/src/layers/McpLive.ts`) -- DataReaderLive +
  DataStoreLive + ProjectDiscoveryLive + OutputPipelineLive +
  SqliteClient + Migrator + NodeContext + NodeFileSystem. Used by MCP
  server via `ManagedRuntime`
- `OutputPipelineLive` (`package/src/layers/OutputPipelineLive.ts`) --
  EnvironmentDetectorLive + ExecutorResolverLive + FormatSelectorLive +
  DetailResolverLive + OutputRendererLive. Included in all three
  composition layers

**Removed in Phase 5:**

- `AgentDetectionLive` / `AgentDetectionTest` -- replaced by
  EnvironmentDetectorLive / EnvironmentDetectorTest
- `CacheWriterLive` / `CacheWriterTest` -- replaced by DataStoreLive /
  DataStoreTest
- `CacheReaderLive` / `CacheReaderTest` -- replaced by DataReaderLive

---

## Component 5: Effect Error Types

**Location:** `package/src/errors/`

**Status:** COMPLETE (Phase 2-5)

**Purpose:** Tagged error types for Effect service failure channels.

- **DataStoreError** (`package/src/errors/DataStoreError.ts`) --
  `Data.TaggedError` for database failures. Fields: `operation`
  (`"read" | "write" | "migrate"`), `table` (string), `reason` (string).
  Replaces CacheError from Phase 2-4
- **DiscoveryError** (`package/src/errors/DiscoveryError.ts`) --
  `Data.TaggedError` for project discovery failures (glob, read, stat
  operations). Unchanged from Phase 2

**Removed in Phase 5:**

- `CacheError` -- replaced by DataStoreError

---

## Component 6: Effect Schemas

**Location:** `package/src/schemas/`

**Status:** COMPLETE (Phase 2-3-4-5)

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

Istanbul duck-type interfaces remain as TypeScript interfaces, not schemas.

---

## Component 7: CLI Bin

**Location:** `package/src/cli/`

**Status:** COMPLETE (Phase 2-3-4-5)

**Purpose:** On-demand test landscape queries for LLM agents. Reads cached
test data from SQLite database and project structure. Does not run tests or
call AI providers. All commands support `--format` flag for output format
selection.

**Entry point:** `package/src/cli/index.ts` exports `runCli()`. Bin wrapper
at `package/bin/vitest-agent-reporter.js` is a thin shebang wrapper.

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

**Lib functions (testable pure logic):**

- `format-status.ts` -- formats status data as markdown
- `format-overview.ts` -- formats overview data as markdown
- `format-coverage.ts` -- formats coverage data as markdown
- `format-history.ts` -- formats history data as markdown
- `format-trends.ts` -- formats trends data as markdown
- `format-doctor.ts` -- formats doctor diagnostic data as markdown
- `resolve-cache-dir.ts` -- resolves cache directory from common locations;
  searches `node_modules/.vite/vitest/*/vitest-agent-reporter` for
  Vite's hash-based cache subdirectory

**Dependencies:**

- Depends on: `@effect/cli` for command framework, DataReader service,
  ProjectDiscovery service, HistoryTracker service, OutputRenderer service,
  `@effect/platform-node` for NodeRuntime
- Used by: `package/bin/vitest-agent-reporter.js`

---

## Component 8: Formatters

**Location:** `package/src/formatters/`

**Status:** COMPLETE (Phase 5b)

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

**Location:** `package/src/utils/build-report.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2)

**Purpose:** Pure data transformation function that converts Vitest
`TestModule`/`TestCase` objects into an `AgentReport`. No I/O.

**Implementation note:** Uses duck-typed Vitest interfaces (`VitestTestModule`,
`VitestTestCase`, etc.) rather than importing Vitest types directly, keeping
the formatter independent of the Vitest runtime.

---

## Component 10: Package Manager Detection

**Location:** `package/src/utils/detect-pm.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2)

**Purpose:** Detects the project's package manager for generating correct
run commands. Uses a `FileSystemAdapter` interface for testability.

**Detection order:**

1. `packageManager` field in `package.json` (e.g., `"pnpm@10.32.1"`)
2. Lockfile presence: `pnpm-lock.yaml` > `package-lock.json` > `yarn.lock`
   > `bun.lock`
3. Falls back to `null` (caller defaults to `npx`)

---

## Component 11: Utility Functions

**Location:** `package/src/utils/`

**Status:** COMPLETE (Phase 1-5)

**Purpose:** Pure utility functions that don't warrant Effect service
wrapping.

**Files:**

- `compress-lines.ts` -- converts `[1,2,3,5,10,11,12]` to `"1-3,5,10-12"`
- `safe-filename.ts` -- sanitizes project names for cache file paths
- `ansi.ts` -- ANSI color helpers that no-op when `NO_COLOR` is set
- `strip-console-reporters.ts` -- removes console reporters from Vitest's
  reporter chain, plus `CONSOLE_REPORTERS` constant
- `resolve-thresholds.ts` -- parses Vitest-native coverage thresholds format
  into `ResolvedThresholds`
- `compute-trend.ts` -- computes coverage trend entries from current run
  data against existing trend records
- `split-project.ts` (Phase 5) -- splits `"project:subProject"` into
  `{ project, subProject }` tuple for normalized SQLite storage
- `capture-env.ts` (Phase 5) -- captures relevant environment variables
  (CI, NODE_ENV, GITHUB_*, RUNNER_*) for settings storage
- `capture-settings.ts` (Phase 5) -- captures Vitest config settings
  (pool, environment, timeouts, coverage provider, etc.) and computes
  a deterministic hash
- `classify-test.ts` (Phase 5) -- pure classification function extracted
  from HistoryTrackerLive. Shared between live layer and CLI formatting
- `format-console.ts` -- legacy console formatter (kept for backward
  compatibility, delegates to markdown formatter)
- `format-gfm.ts` -- legacy GFM formatter (kept for backward
  compatibility, delegates to gfm formatter)
- `build-report.ts` -- AgentReport builder with duck-typed Vitest interfaces
- `detect-pm.ts` -- package manager detection

---

## Component 12: Failure History & Classification

**Location:** `package/src/services/HistoryTracker.ts`,
`package/src/layers/HistoryTrackerLive.ts`,
`package/src/layers/HistoryTrackerTest.ts`,
`package/src/schemas/History.ts`,
`package/src/utils/classify-test.ts`

**Status:** COMPLETE (Phase 3, updated Phase 5)

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

**Location:** `package/src/schemas/Thresholds.ts`,
`package/src/utils/resolve-thresholds.ts`

**Status:** COMPLETE (Phase 4)

**Purpose:** Vitest-native coverage threshold parsing and resolution.
Unchanged from Phase 4.

---

## Component 14: Coverage Baselines

**Location:** `package/src/schemas/Baselines.ts`

**Status:** COMPLETE (Phase 4, storage updated Phase 5)

**Purpose:** Auto-ratcheting coverage baselines that persist high-water
marks per metric.

**Phase 5 change:** Baselines stored in SQLite `coverage_baselines` table
instead of `baselines.json` file. Read via `DataReader.getBaselines()`,
written via `DataStore.writeBaselines()`.

---

## Component 15: Coverage Trends

**Location:** `package/src/schemas/Trends.ts`,
`package/src/utils/compute-trend.ts`

**Status:** COMPLETE (Phase 4, storage updated Phase 5)

**Purpose:** Per-project coverage trend tracking with sliding window for
direction analysis over time.

**Phase 5 change:** Trends stored in SQLite `coverage_trends` table instead
of per-project JSON files. Read via `DataReader.getTrends()`, written via
`DataStore.writeTrends()`.

---

## Component 16: CLI Diagnostics (cache, doctor, trends)

**Location:** `package/src/cli/commands/cache.ts`,
`package/src/cli/commands/doctor.ts`,
`package/src/cli/commands/trends.ts`

**Status:** COMPLETE (Phase 4-5)

**Purpose:** CLI commands for cache management, health diagnostics, and
coverage trend visualization. All support `--format` flag (Phase 5).

---

## Component 17: DataStore Service

**Location:** `package/src/services/DataStore.ts`,
`package/src/layers/DataStoreLive.ts`,
`package/src/layers/DataStoreTest.ts`

**Status:** COMPLETE (Phase 5a)

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
`FileCoverageInput`, `SuiteInput`, `NoteInput` -- all defined in
`DataStore.ts`.

**Dependencies:**

- Depends on: `@effect/sql-sqlite-node` SqlClient
- Used by: AgentReporter, MCP server (note CRUD)

---

## Component 18: DataReader Service

**Location:** `package/src/services/DataReader.ts`,
`package/src/layers/DataReaderLive.ts`

**Status:** COMPLETE (Phase 5a)

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
- `listTests(project?, subProject?, state?, limit?)` -- returns
  `TestListEntry[]` for test case discovery
- `listModules(project?, subProject?, state?, limit?)` -- returns
  `ModuleListEntry[]` for test module discovery
- `listSuites(project?, subProject?, limit?)` -- returns
  `SuiteListEntry[]` for test suite discovery
- `listSettings(limit?)` -- returns `SettingsListEntry[]` for settings
  snapshot discovery

**Key output types:**

`ProjectRunSummary`, `FlakyTest`, `PersistentFailure`, `TestError`,
`NoteRow`, `SettingsRow`, `TestListEntry`, `ModuleListEntry`,
`SuiteListEntry`, `SettingsListEntry` -- all defined in `DataReader.ts`.

**Dependencies:**

- Depends on: `@effect/sql-sqlite-node` SqlClient
- Used by: CLI commands, MCP tools, HistoryTracker, AgentReporter

---

## Component 19: SQLite Migration

**Location:** `package/src/migrations/0001_initial.ts`

**Status:** COMPLETE (Phase 5a)

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

**Location:** `package/src/sql/rows.ts`, `package/src/sql/assemblers.ts`

**Status:** COMPLETE (Phase 5a)

**Purpose:** Row type definitions and assembler functions for reconstructing
domain objects from normalized SQLite rows. Assemblers join data from
multiple tables to build `AgentReport`, `CoverageReport`, and other
composite types.

---

## Component 21: Output Pipeline

**Location:** `package/src/layers/OutputPipelineLive.ts` (composition),
`package/src/services/EnvironmentDetector.ts`,
`package/src/services/ExecutorResolver.ts`,
`package/src/services/FormatSelector.ts`,
`package/src/services/DetailResolver.ts`,
`package/src/services/OutputRenderer.ts`

**Status:** COMPLETE (Phase 5b)

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

**Location:** `package/src/mcp/`

**Status:** COMPLETE (Phase 5c)

**Purpose:** Model Context Protocol server providing 21 tools for agent
integration. Uses `@modelcontextprotocol/sdk` with stdio transport and
tRPC for routing.

**Entry point:** `package/src/mcp/index.ts` -- resolves database path,
creates `ManagedRuntime` with `McpLive(dbPath)`, starts stdio transport.

**Files:**

- `context.ts` -- tRPC context definition with `ManagedRuntime` carrying
  DataReader, DataStore, ProjectDiscovery, OutputRenderer services
- `router.ts` -- tRPC router aggregating all 21 tool procedures
- `server.ts` -- `startMcpServer()` registers all tools with the MCP SDK
- `tools/status.ts` -- `test_status` tool
- `tools/overview.ts` -- `test_overview` tool
- `tools/coverage.ts` -- `test_coverage` tool
- `tools/history.ts` -- `test_history` tool
- `tools/trends.ts` -- `test_trends` tool
- `tools/errors.ts` -- `test_errors` tool
- `tools/test-for-file.ts` -- `test_for_file` tool
- `tools/run-tests.ts` -- `run_tests` tool (executes `vitest run` via
  `spawnSync`)
- `tools/cache-health.ts` -- `cache_health` tool
- `tools/configure.ts` -- `configure` tool (view captured settings)
- `tools/notes.ts` -- `note_create`, `note_list`, `note_get`,
  `note_update`, `note_delete`, `note_search` tools
- `tools/discovery.ts` -- `project_list`, `test_list`, `module_list`,
  `suite_list`, `settings_list` tools

**Tool categories:**

- **Read-only query tools** (return markdown): `test_status`,
  `test_overview`, `test_coverage`, `test_history`, `test_trends`,
  `test_errors`, `test_for_file`, `cache_health`, `configure`
- **Discovery tools** (return markdown): `project_list`, `test_list`,
  `module_list`, `suite_list`, `settings_list`
- **Mutation tools** (return text): `run_tests`
- **Note CRUD tools** (return markdown for list/search, JSON for
  create/get/update/delete): `note_create`, `note_list`, `note_get`,
  `note_update`, `note_delete`, `note_search`

**Dependencies:**

- Depends on: `@modelcontextprotocol/sdk`, `@trpc/server`, `zod`,
  DataReader service, DataStore service, ProjectDiscovery service,
  OutputRenderer service, McpLive composition layer
- Used by: Claude Code plugin (via `.mcp.json` auto-registration),
  any MCP-compatible agent

---

## Component 23: tRPC Router

**Location:** `package/src/mcp/router.ts`, `package/src/mcp/context.ts`

**Status:** COMPLETE (Phase 5c)

**Purpose:** tRPC router aggregating all 21 MCP tool procedures. The context
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

**Status:** COMPLETE (Phase 5d)

**Purpose:** File-based Claude Code plugin providing MCP server
auto-registration, lifecycle hooks, skills, and commands for Vitest
integration in Claude Code sessions.

**Structure:**

- `.claude-plugin/plugin.json` -- plugin manifest (name, version, author)
- `.mcp.json` -- MCP server auto-registration (runs
  `npx vitest-agent-reporter-mcp` via stdio)
- `hooks/hooks.json` -- hook configuration
- `hooks/session-start.sh` -- SessionStart hook: injects test context
  into the session via bash
- `hooks/post-test-run.sh` -- PostToolUse hook on Bash tool: detects
  test runs and triggers post-run actions
- `skills/tdd/SKILL.md` -- TDD workflow skill
- `skills/debugging/SKILL.md` -- test debugging skill
- `skills/configuration/SKILL.md` -- Vitest configuration skill
- `commands/setup.md` -- setup command
- `commands/configure.md` -- configure command

**Note:** The `plugin/` directory is NOT a pnpm workspace. It is a
file-based plugin consumed by Claude Code directly.

**Dependencies:**

- Depends on: MCP server binary (`vitest-agent-reporter-mcp`)
- Used by: Claude Code (automatic plugin discovery)

---

## Component 25: LoggerLive

**Location:** `package/src/layers/LoggerLive.ts`

**Status:** COMPLETE (post-Phase-5)

**Purpose:** Effect-based structured logging layer factory. Provides
NDJSON logging to stderr plus optional file logging via `Logger.zip`.
Replaces the previous `debug` boolean option with fine-grained
`logLevel` and `logFile` controls.

**Configuration:**

- `logLevel` option: `"Debug"`, `"Info"`, `"Warning"`, `"Error"`,
  `"None"` (default). Case-insensitive via `resolveLogLevel` helper
  (lowercase "debug" normalized to "Debug")
- `logFile` option: optional file path for NDJSON log output
- Environment variable fallback: `VITEST_REPORTER_LOG_LEVEL`,
  `VITEST_REPORTER_LOG_FILE`
- Uses `Logger.structuredLogger` for NDJSON format
- `Logger.zip` combines stderr + file loggers when `logFile` is set

**Usage:** `Effect.logDebug` calls on all 30+ DataStore and DataReader
methods for comprehensive I/O tracing.

**Dependencies:**

- Depends on: `effect` (Logger, LogLevel)
- Used by: ReporterLive, CliLive (included in composition layers)
