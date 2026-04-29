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
  - vitest-agent-reporter/components.md
dependencies: []
---

# Data Structures & System Layout -- vitest-agent-reporter

File structure, data schemas, SQLite schema, output formats, error handling,
and data flow diagrams.

**Parent document:** [architecture.md](./architecture.md)

---

## File Structure

As of 2.0 (Phase 6) the source lives in four pnpm workspaces under
`packages/` instead of a single `package/`. The plugin directory is
unchanged. `examples/` adds an integration target that doubles as a
Vitest project.

```text
packages/
  shared/                 -- vitest-agent-reporter-shared (no internal deps)
    src/
      index.ts            -- public re-exports

      formatters/
        types.ts          -- Formatter, FormatterContext, RenderedOutput
        markdown.ts       -- tiered console markdown formatter
        gfm.ts            -- GitHub-Flavored Markdown formatter
        json.ts           -- raw JSON output formatter
        silent.ts         -- no-op formatter (database-only mode)

      services/
        DataStore.ts      -- Context.Tag: write to SQLite (+ SettingsInput)
        DataReader.ts     -- Context.Tag: read from SQLite
        EnvironmentDetector.ts -- Context.Tag: std-env wrapper (4 envs)
        ExecutorResolver.ts -- Context.Tag: env -> executor mapping
        FormatSelector.ts -- Context.Tag: format selection
        DetailResolver.ts -- Context.Tag: detail level resolution
        OutputRenderer.ts -- Context.Tag: formatter dispatch
        ProjectDiscovery.ts -- Context.Tag: test file discovery
        HistoryTracker.ts -- Context.Tag: test outcome classification
        Config.ts         -- Context.Tag: VitestAgentReporterConfigFile (Phase 6)

      layers/
        DataStoreLive.ts / DataStoreTest.ts
        DataReaderLive.ts
        EnvironmentDetectorLive.ts / EnvironmentDetectorTest.ts
        ExecutorResolverLive.ts
        FormatSelectorLive.ts
        DetailResolverLive.ts
        OutputRendererLive.ts
        OutputPipelineLive.ts   -- merged: all 5 output pipeline services
        ProjectDiscoveryLive.ts / ProjectDiscoveryTest.ts
        HistoryTrackerLive.ts / HistoryTrackerTest.ts
        LoggerLive.ts       -- Effect structured logging (NDJSON, logLevel/logFile)
        ConfigLive.ts       -- ConfigFile.Live for vitest-agent-reporter.config.toml (Phase 6)
        PathResolutionLive.ts -- composite: AppDirs + ConfigFile + Workspaces (Phase 6)

      errors/
        DataStoreError.ts   -- Data.TaggedError (database I/O)
        DiscoveryError.ts   -- Data.TaggedError (project discovery)
        PathResolutionError.ts -- Data.TaggedError (path resolution) (Phase 6)

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
        Config.ts           -- VitestAgentReporterConfig (TOML config file) (Phase 6)

      migrations/
        0001_initial.ts     -- 25-table SQLite schema (WAL mode, FK enabled)

      sql/
        rows.ts             -- row type definitions for SQLite queries
        assemblers.ts       -- functions to reconstruct domain types from rows

      utils/
        compress-lines.ts   -- range compression for uncovered lines
        safe-filename.ts    -- project name sanitization
        ansi.ts             -- ANSI color helpers (NO_COLOR aware)
        detect-pm.ts        -- package manager detection (Effect-aware)
        compute-trend.ts    -- coverage trend computation + hash comparison
        split-project.ts    -- splits "project:subProject" into ProjectIdentity
        classify-test.ts    -- pure test classification function
        ensure-migrated.ts  -- process-level migration coordinator
                               (globalThis-keyed promise cache,
                               one-shot per dbPath)
        format-console.ts   -- legacy console formatter (delegates to markdown)
        format-gfm.ts       -- legacy GFM formatter (delegates to gfm)
        format-fatal-error.ts -- formats fatal error output for reporter errors
        build-report.ts     -- pure function: AgentReport builder + duck-typed
                               Vitest interfaces
        normalize-workspace-key.ts -- normalize package name as path segment (Phase 6)
        resolve-workspace-key.ts -- resolve workspace key from projectDir (Phase 6)
        resolve-data-path.ts -- resolveDataPath orchestrator (Phase 6)

  reporter/               -- vitest-agent-reporter (depends on shared)
    src/
      index.ts            -- public re-exports
      reporter.ts         -- AgentReporter class (async onInit, ensureDbPath)
      plugin.ts           -- AgentPlugin function (async configureVitest hook)
      services/
        CoverageAnalyzer.ts -- only the reporter exercises istanbul data
      layers/
        CoverageAnalyzerLive.ts / CoverageAnalyzerTest.ts
        ReporterLive.ts   -- (dbPath, logLevel?, logFile?) composition
      utils/
        capture-env.ts      -- captures CI/GitHub/Runner env vars
        capture-settings.ts -- captures Vitest config + computes hash
        resolve-thresholds.ts -- Vitest thresholds format parser
        strip-console-reporters.ts -- reporter chain manipulation

  cli/                    -- vitest-agent-reporter-cli (depends on shared)
    src/
      bin.ts              -- bin entry: vitest-agent-reporter
      index.ts            -- runCli re-export
      commands/
        status.ts overview.ts coverage.ts history.ts trends.ts cache.ts doctor.ts
      lib/
        format-status.ts format-overview.ts format-coverage.ts
        format-history.ts format-trends.ts format-doctor.ts
      layers/
        CliLive.ts        -- (dbPath, logLevel?, logFile?) composition

  mcp/                    -- vitest-agent-reporter-mcp (depends on shared)
    src/
      bin.ts              -- bin entry: vitest-agent-reporter-mcp
      index.ts            -- programmatic entry
      context.ts          -- tRPC context with ManagedRuntime
      router.ts           -- tRPC router aggregating 24 tool procedures
      server.ts           -- startMcpServer() registering tools with MCP SDK
      layers/
        McpLive.ts        -- (dbPath, logLevel?, logFile?) composition
      tools/
        help.ts status.ts overview.ts coverage.ts history.ts trends.ts
        errors.ts test-for-file.ts test-get.ts test-list.ts file-coverage.ts
        run-tests.ts cache-health.ts configure.ts notes.ts
        project-list.ts module-list.ts suite-list.ts settings-list.ts

examples/
  basic/                  -- minimal example app with tests (5th Vitest project)
    src/math.ts
    src/math.test.ts

plugin/                   -- file-based Claude Code plugin (NOT a workspace)
  .claude-plugin/
    plugin.json           -- plugin manifest with inline mcpServers config
  bin/
    mcp-server.mjs        -- Phase 6 rewrite: zero-deps PM-detect + spawn
                             vitest-agent-reporter-mcp through user's PM.
                             Forwards CLAUDE_PROJECT_DIR via
                             VITEST_AGENT_REPORTER_PROJECT_DIR env var
  hooks/
    hooks.json            -- hook configuration (SessionStart, PreToolUse,
                             PostToolUse)
    session-start.sh      -- context injection on session start
    pre-tool-use-mcp.sh   -- auto-allow MCP tools matching
                             mcp__vitest-agent-reporter__.* whose
                             operation suffix is in the allowlist
    lib/
      safe-mcp-vitest-agent-reporter-ops.txt
                          -- one MCP operation suffix per line; covers
                             all 24 tools (meta + read-only + discovery
                             + run_tests + notes CRUD)
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

**Removed in Phase 6:**

- `package/` -- replaced by the four `packages/*/` workspaces
- `package/src/cli/lib/resolve-cache-dir.ts` -- the artifact-probing
  `resolveDbPath` is gone. Replaced by `packages/shared/src/utils/
  resolve-data-path.ts` (deterministic XDG resolver). The `cache path`
  CLI command now prints the resolved XDG path directly

---

## Test Files

Tests are co-located with their sources, distributed across the four
package workspaces. The root `vitest.config.ts` declares five named
projects (one per package + `example-basic`) with explicit `include`
globs per project.

```text
packages/reporter/src/
  reporter.test.ts          -- AgentReporter lifecycle integration tests
  plugin.test.ts            -- AgentPlugin environment detection + config
  layers/
    CoverageAnalyzerLive.test.ts -- coverage processing, test layer
    ReporterLive.test.ts        -- merged layer composition
  services/
    services.test.ts        -- service Context.Tag (CoverageAnalyzer)
  utils/
    capture-env.test.ts      -- env var capture
    capture-settings.test.ts -- settings capture + hash computation
    resolve-thresholds.test.ts -- Vitest thresholds format parsing
    strip-console-reporters.test.ts -- reporter chain manipulation

packages/shared/src/
  errors/
    errors.test.ts          -- DataStoreError, DiscoveryError, PathResolutionError
  formatters/
    markdown.test.ts        -- markdown formatter (tiered output, coverage, trends)
    gfm.test.ts             -- GFM formatter (single/multi-project, coverage)
    json.test.ts            -- JSON formatter
  layers/
    EnvironmentDetectorLive.test.ts -- std-env integration, live layer
    DataStoreLive.test.ts       -- database write via SQLite
    DataReaderLive.test.ts      -- database read via SQLite
    ProjectDiscoveryLive.test.ts -- test file discovery
    HistoryTrackerLive.test.ts  -- classification logic, sliding window
    ExecutorResolverLive.test.ts -- executor resolution
    FormatSelectorLive.test.ts  -- format selection
    DetailResolverLive.test.ts  -- detail level resolution
    OutputRendererLive.test.ts  -- formatter dispatch
    LoggerLive.test.ts          -- structured logging layer
    ConfigLive.test.ts          -- TOML config loader (Phase 6)
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
    Config.test.ts          -- VitestAgentReporterConfig schema (Phase 6)
  services/
    services.test.ts        -- service Context.Tag definitions
  sql/
    assemblers.test.ts      -- assembler function tests
  utils/
    compress-lines.test.ts  -- range compression edge cases
    safe-filename.test.ts   -- sanitization edge cases
    ansi.test.ts            -- ANSI/stripAnsi, NO_COLOR
    detect-pm.test.ts       -- package manager detection
    compute-trend.test.ts   -- trend computation, hash change detection
    format-console.test.ts  -- legacy console markdown formatting
    format-gfm.test.ts      -- legacy GFM formatting
    build-report.test.ts    -- report building with mock Vitest objects
    split-project.test.ts   -- project name splitting
    ensure-migrated.test.ts -- migration coordinator (4 tests: fresh DB,
                               concurrent same dbPath sharing, distinct
                               dbPaths independent, race serialization)
    format-fatal-error.test.ts -- fatal error formatting
    normalize-workspace-key.test.ts -- workspace key normalization (Phase 6)
    resolve-workspace-key.test.ts -- workspace key resolution (Phase 6)
    resolve-data-path.test.ts -- resolveDataPath orchestrator (Phase 6)

packages/cli/src/
  lib/
    format-status.test.ts   -- status formatting logic
    format-overview.test.ts -- overview formatting logic
    format-coverage.test.ts -- coverage formatting logic
    format-history.test.ts  -- history formatting logic
    format-trends.test.ts   -- trends formatting logic
    format-doctor.test.ts   -- doctor diagnostic formatting

packages/mcp/src/
  router.test.ts            -- tRPC router integration tests
  tools/
    run-tests.test.ts       -- run_tests tool (spawnSync)

examples/basic/src/
  math.test.ts              -- minimal example tests (8 tests)
```

**618 tests total** across 5 named Vitest projects:

| Project | Tests |
| --- | --- |
| `vitest-agent-reporter` | 102 |
| `vitest-agent-reporter-shared` | 429 |
| `vitest-agent-reporter-mcp` | 40 |
| `vitest-agent-reporter-cli` | 39 |
| `example-basic` | 8 |

All coverage metrics (statements, branches, functions, lines) are
above 80%. The root `vitest.config.ts` `coverage.exclude` rewrites
target the new `packages/`-prefixed paths (bin entries, command glue,
the layer composition factories, and a couple of pure types-only
modules are excluded as not separately testable).

---

## Data Path Layout

In 2.0 (Phase 6) the SQLite database lives at a deterministic
XDG-derived location keyed by the workspace's identity, not its
filesystem path:

```text
$XDG_DATA_HOME/vitest-agent-reporter/<workspaceKey>/data.db
```

On systems without `XDG_DATA_HOME` set, this falls back to:

```text
~/.local/share/vitest-agent-reporter/<workspaceKey>/data.db
```

`<workspaceKey>` is derived from the root `package.json` `name` via
`normalizeWorkspaceKey`. Examples:

| Root `package.json` `name` | `<workspaceKey>` (path segment) |
| --- | --- |
| `my-app` | `my-app` |
| `@org/pkg` | `@org__pkg` |
| `weird name with spaces!` | `weird_name_with_spaces_` |

`AppDirs.ensureData` from `xdg-effect` creates the directory if
missing so better-sqlite3 can open the DB without separately mkdir'ing
the parent.

### Resolution precedence

`resolveDataPath(projectDir, options?)` in
`packages/shared/src/utils/resolve-data-path.ts` consults these
sources in order (highest-precedence first):

1. **`options.cacheDir`** (programmatic override). The plugin's
   `reporter.cacheDir` option flows through here. Returns
   `<cacheDir>/data.db` after `mkdirSync(<cacheDir>, { recursive:
   true })`. Skips the heavy XDG/workspace layer stack
2. **`cacheDir` from `vitest-agent-reporter.config.toml`**. Same
   shape: `<cacheDir>/data.db` after `mkdirSync`
3. **`projectKey` from the same config TOML**. Used as the
   `<workspaceKey>` segment under the XDG data root. Normalized via
   `normalizeWorkspaceKey`
4. **Workspace name from root `package.json`**. Resolved via
   `WorkspaceDiscovery` from `workspaces-effect`, then normalized
5. **Fail with `WorkspaceRootNotFoundError`** if no root workspace is
   discoverable. **No silent fallback to a path hash** -- silent
   fallbacks are the bug class 2.0 leaves behind

### Optional config file: `vitest-agent-reporter.config.toml`

If present, the file is loaded by `ConfigLive(projectDir)` via
`config-file-effect`'s `FirstMatch` strategy with this resolver chain:

1. `WorkspaceRoot` (looks for the file at the pnpm/npm/yarn workspace root)
2. `GitRoot` (looks at the git repo root)
3. `UpwardWalk` (walks upward from `projectDir`)

The first file found wins. Both fields are optional:

```toml
# vitest-agent-reporter.config.toml

# Override the entire data directory. Highest precedence after the
# programmatic `reporter.cacheDir` plugin option.
cacheDir = "/abs/path/to/cache"

# Override just the workspace key segment under the XDG data dir.
# Use this when two unrelated projects on the same machine share a
# package.json `name` (collision case) or when you want a stable
# key independent of `name` changes.
projectKey = "my-app"
```

### Removed in Phase 6

The 1.x `node_modules/.vite/.../vitest-agent-reporter/data.db`
location is gone. So is the `node_modules/.vite/vitest/<hash>/...`
walking that the artifact-probing `resolveDbPath` did. There is no
migration code: existing 1.x users have history reset on first 2.0
run. The break is documented in the changeset and changelog.

### Phase 1-4 JSON layout (removed in Phase 5)

The previous JSON file cache (`manifest.json`, `baselines.json`,
`reports/*.json`, `history/*.json`, `trends/*.json`) has been
replaced entirely by the SQLite database.

### `splitProject()` examples (per-Vitest-sub-project keying inside the DB)

The DB itself is one-per-workspace; Vitest sub-projects (the
`projects` array inside `vitest.config.ts`) are differentiated within
that DB via the `(project, subProject)` columns and the
`splitProject()` utility (Decision 23):

- `"my-app:unit"` -> `{ project: "my-app", subProject: "unit" }`
- `"core"` -> `{ project: "core", subProject: null }`
- `""` or `undefined` -> `{ project: "default", subProject: null }`

### Package manager detection

The CLI overview and history commands need to output correct run
commands. Canonical detection logic lives in
`packages/shared/src/utils/detect-pm.ts` (`FileSystemAdapter`
interface for testability). The plugin's `bin/mcp-server.mjs` ships a
zero-deps inline copy with the same detection order:

1. Check `packageManager` field in root `package.json`
2. Fall back to lockfile detection (`pnpm-lock.yaml`, `bun.lock`,
   `bun.lockb`, `yarn.lock`, `package-lock.json`)
3. Default to `npx` (in the shared utility) or `npm` (in the loader)

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
  `table`, and `reason` fields. The `reason` is extracted via
  `extractSqlReason(e)` to surface the underlying SQLite message
  (e.g. `"SQLITE_BUSY: database is locked"`,
  `"UNIQUE constraint failed: ..."`) rather than the generic
  `"Failed to execute statement"` SqlError wrapper. The error's
  `message` property is set to `[operation table] reason` so
  `Cause.pretty()` produces useful output. Logged to stderr; doesn't
  crash the test run
- **Database read failures:** DataReaderLive wraps SQL queries in
  `Effect.try`, catching failures as typed `DataStoreError` with
  `extractSqlReason`-derived reason. History reads return empty records
  for missing data
- **Database migration failures:** Migrations run via `ensureMigrated`
  before the main reporter Effect. If the migration promise rejects,
  AgentReporter prints `formatFatalError(err)` to stderr and returns
  early without writing data. DataStoreError uses `operation: "migrate"`
- **Coverage duck-type mismatch:** CoverageAnalyzer returns `Option.none()`,
  coverage section silently skipped
- **Missing `GITHUB_STEP_SUMMARY`:** Skip GFM output (no warning)
- **Project discovery failures:** DiscoveryError tagged error (with the
  same derived `[operation path] reason` message format as
  DataStoreError); CLI reports the issue and continues with available
  data

---

## Data Flow

### Flow 1: AgentReporter Lifecycle

```text
async onInit(vitest)
  +-- store vitest instance as this._vitest
  +-- await ensureDbPath()
  |     +-- if this.dbPath already set: return it (memoized)
  |     +-- if options.cacheDir set:
  |     |     mkdirSync(options.cacheDir, recursive: true)
  |     |     this.dbPath = `${options.cacheDir}/data.db`
  |     |     return this.dbPath
  |     +-- else:
  |           projectDir = process.cwd()
  |           this.dbPath = await Effect.runPromise(
  |             resolveDataPath(projectDir).pipe(
  |               Effect.provide(PathResolutionLive(projectDir)),
  |               Effect.provide(NodeContext.layer)))
  |           return this.dbPath
  +-- (settings + envVars are captured later inside onTestRunEnd's
      Effect program, not in onInit)

onCoverage(coverage)
  +-- stash as this.coverage

async onTestRunEnd(testModules, unhandledErrors, reason)
  |
  +-- dbPath = await ensureDbPath() (defensive for tests that bypass onInit)
  |     +-- on rejection: stderr.write(formatFatalError(err)) and return
  |
  +-- mkdirSync(dirname(dbPath), recursive: true) (defensive no-op)
  |
  +-- await ensureMigrated(dbPath, logLevel, logFile)
  |     +-- on rejection: stderr.write(formatFatalError(err))
  |     |   and return early
  |     +-- otherwise: migration cached on globalThis Symbol;
  |         concurrent reporter instances share the same promise
  |
  +-- Filter testModules by projectFilter (if set)
  |
  +-- Build Effect program:
  |     +-- yield* DataStore
  |     +-- yield* DataReader
  |     +-- yield* CoverageAnalyzer
  |     +-- yield* HistoryTracker
  |     +-- yield* OutputRenderer
  |     +-- captureSettings(vitestConfig, vitestVersion) -> settings
  |     +-- hashSettings(settings) -> settingsHash
  |     +-- captureEnvVars(process.env) -> envVars
  |     +-- DataStore.writeSettings(hash, settings, envVars)
  |         (idempotent INSERT OR IGNORE)
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
async configureVitest({ vitest, project })
  |
  +-- Effect.runPromise(EnvironmentDetector.detect())
  |     +-- Returns "agent-shell" | "terminal" | "ci-github" | "ci-generic"
  |
  +-- ExecutorResolver.resolve(env, mode)
  |     +-- Returns "human" | "agent" | "ci"
  |
  +-- Apply output behavior based on executor + strategy
  |
  +-- Resolve cacheDir (Phase 6 dropped the third Vite-cacheDir fallback):
  |     options.reporter.cacheDir
  |     ?? outputFile["vitest-agent-reporter"]
  |     ?? undefined
  |   When undefined, AgentReporter falls through to XDG-based
  |   resolution via resolveDataPath in ensureDbPath() (see Flow 1)
  |
  +-- Resolve coverage thresholds + targets
  |
  +-- Disable Vitest native autoUpdate if targets set
  |
  +-- Set coverage.reporter = [] in agent/own mode (suppress text table)
  |
  +-- vitest.config.reporters.push(new AgentReporter({
  |     ...options, projectFilter: project.name,
  |     ...(cacheDir !== undefined ? { cacheDir } : {})
  |   }))
```

### Flow 3: CLI Commands (packages/cli/src/bin.ts)

```text
vitest-agent-reporter <command> [--format <format>] [options]
  |
  +-- projectDir = process.cwd()
  +-- main = resolveDataPath(projectDir).pipe(
  |     Effect.flatMap((dbPath) =>
  |       Effect.suspend(() => cli(process.argv)).pipe(
  |         Effect.provide(CliLive(dbPath, logLevel, logFile)))),
  |     Effect.provide(PathResolutionLive(projectDir)),
  |     Effect.provide(NodeContext.layer))
  +-- NodeRuntime.runMain(main)
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
  |     +-- prints the resolved XDG path (deterministic; no probing)
  |
  +-- cache clean:
  |     +-- FileSystem.remove(dirname(dbPath), { recursive: true })
  |
  +-- doctor:
        +-- DataReader.getManifest()
        +-- DataReader.getLatestRun() per project (integrity)
        +-- staleness check
        +-- OutputRenderer.render() -> stdout
```

### Flow 4: MCP Server (packages/mcp/src/bin.ts)

```text
vitest-agent-reporter-mcp
  |
  +-- projectDir = resolveProjectDir() ::=
  |     VITEST_AGENT_REPORTER_PROJECT_DIR  (set by plugin loader)
  |     | CLAUDE_PROJECT_DIR
  |     | process.cwd()
  |
  +-- dbPath = await Effect.runPromise(
  |     resolveDataPath(projectDir).pipe(
  |       Effect.provide(PathResolutionLive(projectDir)),
  |       Effect.provide(NodeContext.layer)))
  |
  +-- runtime = ManagedRuntime.make(McpLive(dbPath, logLevel, logFile))
  +-- startMcpServer({ runtime, cwd: projectDir })
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

### Flow 5: Plugin -> MCP Server spawn (Phase 6)

```text
Claude Code spawns plugin/bin/mcp-server.mjs (zero-deps Node script)
  |
  +-- projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  |
  +-- detectPm(projectDir):
  |     +-- read packageManager field in package.json
  |     +-- else check lockfiles in order:
  |     |     pnpm-lock.yaml -> "pnpm"
  |     |     bun.lock | bun.lockb -> "bun"
  |     |     yarn.lock -> "yarn"
  |     |     package-lock.json -> "npm"
  |     +-- default: "npm"
  |
  +-- spawn(<pm-cmd>, [...exec-args, "vitest-agent-reporter-mcp"], {
  |     cwd: projectDir,
  |     stdio: "inherit",
  |     env: { ...process.env,
  |       VITEST_AGENT_REPORTER_PROJECT_DIR: projectDir }
  |   })
  |
  +-- on child.error -> print PM-specific install hint, exit 1
  +-- on child.exit(code, signal):
  |     code === 0 -> exit 0
  |     signal -> process.kill(self, signal)  (re-raise on parent)
  |     code !== 0 -> print install hint, exit code
  |
  +-- The spawned MCP subprocess uses
      VITEST_AGENT_REPORTER_PROJECT_DIR as its highest-precedence
      projectDir source (Flow 4)
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
- Access `vitest.config.outputFile` for cache directory resolution
  (Phase 6 dropped the `vitest.vite.config.cacheDir` fallback in
  favor of XDG-based default)
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

**Runtime dependencies (distributed across the four 2.0 packages):**

In `vitest-agent-reporter-shared`:

- `effect` -- core runtime, Schema, Context, Layer, Data
- `@effect/platform` -- FileSystem, Path abstractions
- `@effect/platform-node` -- Node.js live implementations
- `@effect/sql` + `@effect/sql-sqlite-node` -- SQLite client and migrator
- `std-env` -- agent and CI runtime detection
- `xdg-effect ^1.0.1` (Phase 6) -- XDG path resolution
- `config-file-effect ^0.2.0` (Phase 6) -- TOML config loading
- `workspaces-effect ^0.5.1` (Phase 6) -- workspace name discovery

In `vitest-agent-reporter`: shared + the Effect/SQL stack
(transitively via shared) + Vitest peer.

In `vitest-agent-reporter-cli`: shared + `@effect/cli` + Effect/SQL.

In `vitest-agent-reporter-mcp`: shared, `@modelcontextprotocol/sdk`,
`@trpc/server`, `zod`, and the Effect/SQL deps.

**Phase 5 dependencies added (now in the appropriate packages):**

- `@effect/sql-sqlite-node` -- SQLite database layer (in shared)
- `@modelcontextprotocol/sdk` -- MCP server (in mcp)
- `@trpc/server` -- tRPC router for MCP tool procedures (in mcp)
- `zod` -- MCP tool input validation, required by tRPC (in mcp)

### Integration 6: Model Context Protocol (Phase 5c)

**Transport:** stdio (standard input/output)

**Server:** `@modelcontextprotocol/sdk` McpServer with StdioServerTransport

**Router:** tRPC with `createCallerFactory` for testing

**Context:** `McpContext` carrying a `ManagedRuntime` with DataReader,
DataStore, ProjectDiscovery, and OutputRenderer services

**Registration (Phase 6):** Via the inline `mcpServers` config in
`plugin/.claude-plugin/plugin.json`. The plugin's
`bin/mcp-server.mjs` loader spawns `vitest-agent-reporter-mcp`
through the user's package manager (Flow 5). The 1.x `npx
vitest-agent-reporter-mcp` registration approach is gone (it could
fall back to a registry download and exceed Claude Code's MCP
startup window).

### Integration 7: Claude Code Plugin (Phase 5d, loader rewritten in Phase 6)

**Plugin format:** File-based plugin at `plugin/` directory

**Discovery:** Claude Code discovers the plugin via `.claude-plugin/plugin.json`

**MCP registration:** Inline `mcpServers` config in `plugin.json`
points at `${CLAUDE_PLUGIN_ROOT}/bin/mcp-server.mjs`. The Phase 6
rewrite of that loader detects the user's package manager and spawns
`vitest-agent-reporter-mcp` through it (`pnpm exec`,
`npx --no-install`, `yarn run`, or `bun x`). See Component 24 and
Decision 30 for details.

**Hooks:**

- `SessionStart` -> `hooks/session-start.sh` (context injection)
- `PreToolUse` matching `mcp__vitest-agent-reporter__.*` ->
  `hooks/pre-tool-use-mcp.sh` (auto-allow MCP tools whose operation
  suffix is enumerated in `hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt`;
  unknown ops fall through to the standard permission prompt)
- `PostToolUse` on `Bash` -> `hooks/post-test-run.sh` (test detection)

**Skills:** TDD, debugging, configuration, coverage-improvement (markdown files)

**Commands:** setup, configure (markdown files)

---

**Document Status:** Current -- reflects Phase 1 through Phase 6 (2.0
architectural restructure on `feat/db-issues`). 2.0 highlights:
four-package layout (`packages/shared`, `packages/reporter`,
`packages/cli`, `packages/mcp`); deterministic XDG-derived data path
(`$XDG_DATA_HOME/vitest-agent-reporter/<workspaceKey>/data.db`);
optional `vitest-agent-reporter.config.toml` (`cacheDir`/`projectKey`);
new `resolveDataPath` orchestrator with `WorkspaceRootNotFoundError`
fail-loud semantics; plugin's MCP loader rewritten as PM-detect +
spawn (Decision 30, Decision 29 retired). All phases complete.
