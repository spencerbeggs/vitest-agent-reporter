---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-04-23
last-synced: 2026-04-23
post-phase5-sync: 2026-04-23
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

```text
package/
  src/
    index.ts              -- sole re-export point for public API
    reporter.ts           -- AgentReporter class (Effect.runPromise + ReporterLive)
    plugin.ts             -- AgentPlugin function (async configureVitest hook)

    cli/
      index.ts            -- runCli entry point, Command.run() via @effect/cli
      commands/
        status.ts         -- thin wrapper, delegates to lib
        overview.ts       -- thin wrapper, delegates to lib
        coverage.ts       -- thin wrapper, delegates to lib
        history.ts        -- thin wrapper, delegates to lib
        trends.ts         -- thin wrapper, delegates to lib
        cache.ts          -- cache parent with path/clean subcommands
        doctor.ts         -- cache health diagnostic
      lib/
        format-status.ts  -- testable formatting logic
        format-overview.ts
        format-coverage.ts
        format-history.ts
        format-trends.ts  -- trend data formatting
        format-doctor.ts  -- doctor diagnostic formatting
        resolve-cache-dir.ts -- searches Vite hash-based subdirectories

    formatters/
      types.ts            -- Formatter, FormatterContext, RenderedOutput interfaces
      markdown.ts         -- tiered console markdown formatter
      gfm.ts              -- GitHub-Flavored Markdown formatter
      json.ts             -- raw JSON output formatter
      silent.ts           -- no-op formatter (database-only mode)

    mcp/
      index.ts            -- MCP server entry point (resolves DB, starts stdio)
      context.ts          -- tRPC context with ManagedRuntime
      router.ts           -- tRPC router aggregating 24 tool procedures
      server.ts           -- startMcpServer() registering tools with MCP SDK
      tools/
        help.ts           -- help tool (list all available tools)
        status.ts         -- test_status tool
        overview.ts       -- test_overview tool
        coverage.ts       -- test_coverage tool
        history.ts        -- test_history tool
        trends.ts         -- test_trends tool
        errors.ts         -- test_errors tool
        test-for-file.ts  -- test_for_file tool
        test-get.ts       -- test_get tool (single test detail)
        test-list.ts      -- test_list tool
        file-coverage.ts  -- file_coverage tool (per-file coverage)
        run-tests.ts      -- run_tests tool (vitest run via spawnSync)
        cache-health.ts   -- cache_health tool
        configure.ts      -- configure tool (view captured settings)
        notes.ts          -- note CRUD (create/list/get/update/delete/search)
        project-list.ts   -- project_list tool
        module-list.ts    -- module_list tool
        suite-list.ts     -- suite_list tool
        settings-list.ts  -- settings_list tool

    services/
      DataStore.ts        -- Context.Tag: write to SQLite
      DataReader.ts       -- Context.Tag: read from SQLite
      EnvironmentDetector.ts -- Context.Tag: std-env wrapper (4 environments)
      ExecutorResolver.ts -- Context.Tag: env -> executor mapping
      FormatSelector.ts   -- Context.Tag: format selection
      DetailResolver.ts   -- Context.Tag: detail level resolution
      OutputRenderer.ts   -- Context.Tag: formatter dispatch
      CoverageAnalyzer.ts -- Context.Tag: coverage processing
      ProjectDiscovery.ts -- Context.Tag: test file discovery
      HistoryTracker.ts   -- Context.Tag: test outcome classification

    layers/
      DataStoreLive.ts / DataStoreTest.ts
      DataReaderLive.ts
      EnvironmentDetectorLive.ts / EnvironmentDetectorTest.ts
      ExecutorResolverLive.ts
      FormatSelectorLive.ts
      DetailResolverLive.ts
      OutputRendererLive.ts
      OutputPipelineLive.ts   -- merged: all 5 output pipeline services
      CoverageAnalyzerLive.ts / CoverageAnalyzerTest.ts
      ProjectDiscoveryLive.ts / ProjectDiscoveryTest.ts
      HistoryTrackerLive.ts / HistoryTrackerTest.ts
      LoggerLive.ts       -- Effect structured logging (NDJSON, logLevel/logFile)
      ReporterLive.ts     -- merged layer for reporter (function of dbPath)
      CliLive.ts          -- merged layer for CLI (function of dbPath)
      McpLive.ts          -- merged layer for MCP server (function of dbPath)

    errors/
      DataStoreError.ts   -- Data.TaggedError (database I/O)
      DiscoveryError.ts   -- Data.TaggedError (project discovery)

    schemas/
      Common.ts           -- shared literals (TestState, Environment, Executor,
                             OutputFormat, DetailLevel, etc.)
      AgentReport.ts      -- report + module + test schemas
      CacheManifest.ts    -- manifest + entry schemas
      Coverage.ts         -- coverage report + totals + file coverage
      Thresholds.ts       -- MetricThresholds, PatternThresholds, ResolvedThresholds
      Baselines.ts        -- CoverageBaselines (auto-ratcheting high-water marks)
      Trends.ts           -- TrendEntry, TrendRecord (coverage trends)
      History.ts          -- TestRun, TestHistory, HistoryRecord schemas
      Options.ts          -- reporter + plugin + coverage + formatter options

    migrations/
      0001_initial.ts     -- 25-table SQLite schema (WAL mode, FK enabled)

    sql/
      rows.ts             -- row type definitions for SQLite queries
      assemblers.ts       -- functions to reconstruct domain types from rows

    utils/
      compress-lines.ts   -- range compression for uncovered lines
      safe-filename.ts    -- project name sanitization
      ansi.ts             -- ANSI color helpers (NO_COLOR aware)
      strip-console-reporters.ts -- reporter chain manipulation
      detect-pm.ts        -- package manager detection (FileSystemAdapter)
      resolve-thresholds.ts -- Vitest thresholds format parser
      compute-trend.ts    -- coverage trend computation + hash comparison
      split-project.ts    -- splits "project:subProject" into ProjectIdentity
      capture-env.ts      -- captures CI/GitHub/Runner env vars
      capture-settings.ts -- captures Vitest config + computes hash
      classify-test.ts    -- pure test classification function
      format-console.ts   -- legacy console formatter (delegates to markdown)
      format-gfm.ts       -- legacy GFM formatter (delegates to gfm)
      format-fatal-error.ts -- formats fatal error output for reporter errors
      build-report.ts     -- pure function: AgentReport builder + duck-typed
                             Vitest interfaces

plugin/
  .claude-plugin/
    plugin.json           -- Claude Code plugin manifest
  .mcp.json               -- MCP server auto-registration
  hooks/
    hooks.json            -- hook configuration (SessionStart, PostToolUse)
    session-start.sh      -- context injection on session start
    post-test-run.sh      -- test run detection on Bash tool use
  skills/
    tdd/SKILL.md          -- TDD workflow skill
    debugging/SKILL.md    -- test debugging skill
    configuration/SKILL.md -- Vitest configuration skill
    coverage-improvement/SKILL.md -- coverage improvement skill
  commands/
    setup.md              -- setup command
    configure.md          -- configure command
  README.md
```

---

## Test Files

```text
package/src/
  reporter.test.ts          -- AgentReporter lifecycle integration tests
  plugin.test.ts            -- AgentPlugin environment detection + config
  cli/lib/
    format-status.test.ts   -- status formatting logic
    format-overview.test.ts -- overview formatting logic
    format-coverage.test.ts -- coverage formatting logic
    format-history.test.ts  -- history formatting logic
    format-trends.test.ts   -- trends formatting logic
    format-doctor.test.ts   -- doctor diagnostic formatting
    resolve-cache-dir.test.ts -- cache dir resolution
  errors/
    errors.test.ts          -- DataStoreError, DiscoveryError tagged errors
  formatters/
    markdown.test.ts        -- markdown formatter (tiered output, coverage, trends)
    gfm.test.ts             -- GFM formatter (single/multi-project, coverage)
    json.test.ts            -- JSON formatter
  layers/
    EnvironmentDetectorLive.test.ts -- std-env integration, live layer
    DataStoreLive.test.ts       -- database write via SQLite
    DataReaderLive.test.ts      -- database read via SQLite
    CoverageAnalyzerLive.test.ts -- coverage processing, test layer
    ProjectDiscoveryLive.test.ts -- test file discovery
    HistoryTrackerLive.test.ts  -- classification logic, sliding window
    ReporterLive.test.ts        -- merged layer composition
    ExecutorResolverLive.test.ts -- executor resolution
    FormatSelectorLive.test.ts  -- format selection
    DetailResolverLive.test.ts  -- detail level resolution
    OutputRendererLive.test.ts  -- formatter dispatch
    LoggerLive.test.ts          -- structured logging layer
  mcp/
    router.test.ts          -- tRPC router integration tests
    tools/
      run-tests.test.ts     -- run_tests tool (spawnSync)
  migrations/
    0001_initial.test.ts    -- migration schema verification
  schemas/
    Common.test.ts          -- shared literal schemas
    AgentReport.test.ts     -- report schema validation
    CacheManifest.test.ts   -- manifest schema validation
    Coverage.test.ts        -- coverage schema validation
    Baselines.test.ts       -- baselines schema validation
    Trends.test.ts          -- TrendEntry, TrendRecord schema validation
    History.test.ts         -- TestRun, TestHistory, HistoryRecord schema
    Options.test.ts         -- reporter + plugin + coverage options schema
  services/
    services.test.ts        -- service Context.Tag definitions
  sql/
    assemblers.test.ts      -- assembler function tests
  utils/
    compress-lines.test.ts  -- range compression edge cases
    safe-filename.test.ts   -- sanitization edge cases
    ansi.test.ts            -- ANSI/stripAnsi, NO_COLOR
    strip-console-reporters.test.ts -- reporter chain manipulation
    detect-pm.test.ts       -- package manager detection
    resolve-thresholds.test.ts -- Vitest thresholds format parsing
    compute-trend.test.ts   -- trend computation, hash change detection
    format-console.test.ts  -- legacy console markdown formatting
    format-gfm.test.ts      -- legacy GFM formatting
    build-report.test.ts    -- report building with mock Vitest objects
    split-project.test.ts   -- project name splitting
    capture-env.test.ts     -- env var capture
    capture-settings.test.ts -- settings capture + hash computation
    format-fatal-error.test.ts -- fatal error formatting
```

**52 test files, 569 tests total.** All coverage metrics (statements,
branches, functions, lines) are above 80%.

---

## Cache Directory Layout

Cache outputs are stored in a SQLite database within a configurable root
directory. When using `AgentPlugin`, this defaults to Vite's `cacheDir` +
`"/vitest-agent-reporter"` (typically
`node_modules/.vite/.../vitest-agent-reporter/`). When using
`AgentReporter` standalone, it defaults to `.vitest-agent-reporter/`.

```text
{cacheDir}/
  data.db                               -- SQLite database (25 tables)
```

**Phase 1-4 JSON layout (removed in Phase 5):**

The previous JSON file cache (`manifest.json`, `baselines.json`,
`reports/*.json`, `history/*.json`, `trends/*.json`) has been replaced
entirely by the SQLite database.

**`splitProject()` examples:**

- `"my-app:unit"` -> `{ project: "my-app", subProject: "unit" }`
- `"core"` -> `{ project: "core", subProject: null }`
- `""` or `undefined` -> `{ project: "default", subProject: null }`

**Package manager detection:**

The CLI overview and history commands need to output correct run commands.
Detection logic in `package/src/utils/detect-pm.ts`:

1. Check `packageManager` field in root `package.json`
2. Fall back to lockfile detection
3. Default to `npx` if nothing detected

---

## SQLite Database Schema

The database schema is defined in `package/src/migrations/0001_initial.ts`
and managed via `@effect/sql-sqlite-node` SqliteMigrator. WAL journal mode
and foreign keys are enabled.

**25 tables:**

| # | Table | Purpose |
| - | ----- | ------- |
| 1 | `files` | Deduplicated file paths (shared FK target) |
| 2 | `settings` | Vitest config snapshots, keyed by hash |
| 3 | `settings_env_vars` | Environment variables per settings snapshot |
| 4 | `test_runs` | Per-project test run records with summary stats |
| 5 | `scoped_files` | Files included in scoped test runs |
| 6 | `test_modules` | Test modules (files) per run |
| 7 | `test_suites` | Test suites (describe blocks) per module |
| 8 | `test_cases` | Individual test cases per module |
| 9 | `test_errors` | Errors with diffs, expected/actual, stacks |
| 10 | `stack_frames` | Parsed stack frames per error |
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

**Plus:** `notes_fts` FTS5 virtual table with sync triggers for full-text
search across note titles and content.

For the full DDL, see `package/src/migrations/0001_initial.ts`.

---

## Data Structures

All types are defined as Effect Schema definitions in `package/src/schemas/`
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

### Phase 5 Data Types

```typescript
// DataStore input types
interface TestRunInput {
  invocationId: string;
  project: string;
  subProject: string | null;
  settingsHash: string;
  timestamp: string;
  commitSha: string | null;
  branch: string | null;
  reason: "passed" | "failed" | "interrupted";
  duration: number;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  scoped: boolean;
  // ... snapshot fields
}

interface ProjectIdentity {
  project: string;
  subProject: string | null;
}

// DataReader output types
interface ProjectRunSummary {
  project: string;
  subProject: string | null;
  lastRun: string | null;
  lastResult: "passed" | "failed" | "interrupted" | null;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

interface FlakyTest {
  fullName: string;
  project: string;
  subProject: string | null;
  passCount: number;
  failCount: number;
  lastState: "passed" | "failed";
  lastTimestamp: string;
}

interface PersistentFailure {
  fullName: string;
  project: string;
  subProject: string | null;
  consecutiveFailures: number;
  firstFailedAt: string;
  lastFailedAt: string;
  lastErrorMessage: string | null;
}

// DataReader discovery types
interface TestListEntry {
  id: number;
  fullName: string;
  state: string;
  duration: number | null;
  module: string;
  classification: string | null;
}

interface ModuleListEntry {
  id: number;
  file: string;
  state: string;
  testCount: number;
  duration: number | null;
}

interface SuiteListEntry {
  id: number;
  name: string;
  module: string;
  state: string;
  testCount: number;
}

interface SettingsListEntry {
  hash: string;
  capturedAt: string;
}

// Common schema literals (Phase 5)
type Environment = "agent-shell" | "terminal" | "ci-github" | "ci-generic";
type Executor = "human" | "agent" | "ci";
type OutputFormat = "markdown" | "json" | "vitest-bypass" | "silent";
type DetailLevel = "minimal" | "neutral" | "standard" | "verbose";

// Formatter types
interface RenderedOutput {
  target: "stdout" | "file" | "github-summary";
  content: string;
  contentType: string;
}

interface FormatterContext {
  detail: DetailLevel;
  noColor: boolean;
  coverageConsoleLimit: number;
  trendSummary?: { direction, runCount, firstMetric? };
  runCommand?: string;
  mcp?: boolean;
  githubSummaryFile?: string;
}

// MCP context
interface McpContext {
  runtime: ManagedRuntime<
    DataReader | DataStore | ProjectDiscovery | OutputRenderer,
    never
  >;
  cwd: string;
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

**Example output (green tier -- all passing, targets met):**

```markdown
## [checkmark] Vitest -- 10 passed (120ms)
```

**Example output (red tier -- failures):**

````markdown
## X Vitest -- 2 failed, 8 passed (340ms)

Coverage regressing over 3 runs

### X `src/utils.test.ts`

- X **compressLines > handles empty array** [new-failure]
  Expected [] to equal [""]

  ```diff
  - Expected
  + Received

  - [""]
  + []
  ```

### Coverage gaps

- `src/coverage.ts` -- Lines: 45% -- uncovered: 42-50,99,120-135

### Next steps

- 1 new failure since last run
- Re-run: `pnpm vitest run src/utils.test.ts`
- Run `pnpm vitest-agent-reporter coverage` for gap analysis
- Run `pnpm vitest-agent-reporter trends` for coverage trajectory
````

---

## Error Handling Strategy

- **Database write failures:** DataStoreError tagged error with `operation`,
  `table`, and `reason` fields. Logged to stderr, don't crash the test run
- **Database read failures:** DataReaderLive wraps SQL queries in
  `Effect.try`, catching failures as typed `DataStoreError`. History reads
  return empty records for missing data
- **Database migration failures:** DataStoreError with `operation: "migrate"`.
  Propagated as fatal on first access
- **Coverage duck-type mismatch:** CoverageAnalyzer returns `Option.none()`,
  coverage section silently skipped
- **Missing `GITHUB_STEP_SUMMARY`:** Skip GFM output (no warning)
- **Project discovery failures:** DiscoveryError tagged error, CLI reports
  the issue and continues with available data

---

## Data Flow

### Flow 1: AgentReporter Lifecycle

```text
onInit(vitest)
  +-- store vitest instance as this._vitest
  +-- captureSettings(vitest.config) -> SettingsInput
  +-- captureEnvVars(process.env) -> envVars
  +-- DataStore.writeSettings(hash, settings, envVars)

onCoverage(coverage)
  +-- stash as this.coverage

onTestRunEnd(testModules, unhandledErrors, reason)
  |
  +-- Filter testModules by projectFilter (if set)
  |
  +-- Build Effect program:
  |     +-- yield* DataStore
  |     +-- yield* DataReader
  |     +-- yield* CoverageAnalyzer
  |     +-- yield* HistoryTracker
  |     +-- yield* OutputRenderer
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
  |     +-- DataStore.writeErrors(runId, errors)
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

### Flow 2: AgentPlugin (async configureVitest)

```text
async configureVitest({ vitest })
  |
  +-- Effect.runPromise(EnvironmentDetector.detect())
  |     +-- Returns "agent-shell" | "terminal" | "ci-github" | "ci-generic"
  |
  +-- ExecutorResolver.resolve(env, mode)
  |     +-- Returns "human" | "agent" | "ci"
  |
  +-- Apply output behavior based on executor + strategy
  |
  +-- Resolve cacheDir:
  |     option.cacheDir ?? resolveOutputDir(outputFile) ?? vite.cacheDir/...
  |
  +-- Resolve coverage thresholds + targets
  |
  +-- Disable Vitest native autoUpdate if targets set
  |
  +-- Set coverage.reporter = [] in agent/own mode (suppress text table)
  |
  +-- vitest.config.reporters.push(new AgentReporter({
  |     ...options, projectFilter: project.name
  |   }))
```

### Flow 3: CLI Commands

```text
vitest-agent-reporter <command> [--format <format>] [options]
  |
  +-- NodeRuntime.runMain(cli.pipe(Effect.provide(CliLive(dbPath))))
  |
  +-- status:
  |     +-- DataReader.getRunsByProject()
  |     +-- DataReader.getLatestRun() for failing projects
  |     +-- OutputRenderer.render() -> stdout
  |
  +-- overview:
  |     +-- DataReader.getRunsByProject()
  |     +-- ProjectDiscovery.discoverTestFiles(rootDir)
  |     +-- ProjectDiscovery.mapTestToSource() for file mapping
  |     +-- OutputRenderer.render() -> stdout
  |
  +-- coverage:
  |     +-- DataReader.getLatestRun() for all projects
  |     +-- OutputRenderer.render() -> stdout
  |
  +-- history:
  |     +-- DataReader.getHistory() for all projects
  |     +-- DataReader.getFlaky() / getPersistentFailures()
  |     +-- OutputRenderer.render() -> stdout
  |
  +-- trends:
  |     +-- DataReader.getTrends() for all projects
  |     +-- OutputRenderer.render() -> stdout
  |
  +-- cache path:
  |     +-- resolveCacheDir -> stdout
  |
  +-- cache clean:
  |     +-- resolveCacheDir
  |     +-- FileSystem.remove(cacheDir, { recursive: true })
  |
  +-- doctor:
        +-- resolveCacheDir
        +-- DataReader.getManifest()
        +-- DataReader.getLatestRun() per project (integrity)
        +-- staleness check
        +-- OutputRenderer.render() -> stdout
```

### Flow 4: MCP Server

```text
vitest-agent-reporter-mcp
  |
  +-- resolveDbPath -> dbPath
  +-- ManagedRuntime.make(McpLive(dbPath)) -> runtime
  +-- startMcpServer({ runtime, cwd })
  |
  +-- StdioServerTransport connects
  |
  +-- Tool invocations:
  |     +-- createCallerFactory(appRouter) -> factory
  |     +-- factory(ctx) -> caller
  |     +-- caller.tool_name(args)
  |     |     +-- tRPC procedure
  |     |     +-- ctx.runtime.runPromise(effect)
  |     |     +-- Returns text (markdown) or JSON
  |
  +-- Read-only tools: query DataReader, format via OutputRenderer
  +-- run_tests: spawnSync("npx vitest run", { files, project, timeout })
  +-- Note CRUD: DataStore.writeNote/updateNote/deleteNote,
  |              DataReader.getNotes/getNoteById/searchNotes
```

---

## Integration Points

### Integration 1: Vitest Reporter v2 API

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
- Available since Vitest 3.1
- Runs before reporters are instantiated
- Now async (Vitest awaits plugin hooks)
- Mutate `vitest.config.reporters` to inject `AgentReporter`
- Access `vitest.vite.config.cacheDir` for cache directory resolution
- Access `vitest.config.coverage.thresholds` for coverage threshold
- Pass `project.name` as `projectFilter` for multi-project isolation

### Integration 3: GitHub Actions

**Detection:** `process.env.GITHUB_ACTIONS === "true"` or `=== "1"`,
now detected as `ci-github` environment by EnvironmentDetector.

**Output target:** `process.env.GITHUB_STEP_SUMMARY` -- a file path.
GFM content is appended (not overwritten) to support multiple steps.

### Integration 4: Consumer LLM Agents

**MCP pattern (preferred):** Agents connect via MCP stdio transport and
use the 24 tools for structured data access.

**CLI pattern:** Run `vitest-agent-reporter status` for quick overview,
`vitest-agent-reporter overview` for test landscape, or
`vitest-agent-reporter coverage` for gap analysis. All commands support
`--format` flag.

**Direct database access:** Agents can query `data.db` directly with
SQLite tools if needed.

### Integration 5: Effect Ecosystem

**Runtime dependencies:**

- `effect` -- core runtime, Schema, Context, Layer, Data
- `@effect/cli` -- CLI command framework
- `@effect/platform` -- FileSystem, Path abstractions
- `@effect/platform-node` -- Node.js live implementations
- `@effect/sql-sqlite-node` -- SQLite client and migrator
- `std-env` -- agent and CI runtime detection

**Phase 5 dependencies added:**

- `@effect/sql-sqlite-node` -- SQLite database layer
- `@modelcontextprotocol/sdk` -- MCP server (stdio transport)
- `@trpc/server` -- tRPC router for MCP tool procedures
- `zod` -- MCP tool input validation (required by tRPC)

### Integration 6: Model Context Protocol (Phase 5c)

**Transport:** stdio (standard input/output)

**Server:** `@modelcontextprotocol/sdk` McpServer with StdioServerTransport

**Router:** tRPC with `createCallerFactory` for testing

**Context:** `McpContext` carrying a `ManagedRuntime` with DataReader,
DataStore, ProjectDiscovery, and OutputRenderer services

**Registration:** Via `.mcp.json` in the Claude Code plugin, or manual
configuration pointing to `npx vitest-agent-reporter-mcp`

### Integration 7: Claude Code Plugin (Phase 5d)

**Plugin format:** File-based plugin at `plugin/` directory

**Discovery:** Claude Code discovers the plugin via `.claude-plugin/plugin.json`

**MCP registration:** `.mcp.json` auto-registers the MCP server

**Hooks:**

- `SessionStart` -> `hooks/session-start.sh` (context injection)
- `PostToolUse` on `Bash` -> `hooks/post-test-run.sh` (test detection)

**Skills:** TDD, debugging, configuration, coverage-improvement (markdown files)

**Commands:** setup, configure (markdown files)

---

**Document Status:** Current -- reflects Phase 1 through Phase 5
implementation plus post-Phase-5 refinements. All phases complete.
