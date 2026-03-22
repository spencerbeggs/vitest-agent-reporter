---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-03-22
last-synced: 2026-03-22
completeness: 90
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

**Status:** COMPLETE (Phase 1-2-3-4)

**Purpose:** Vitest Reporter that produces three outputs: structured markdown
to console, persistent JSON to disk per project, and optional GFM for GitHub
Actions. Uses Effect services for file I/O, coverage processing, failure
history tracking, and coverage baselines/trends.

**Responsibilities:**

- Store `Vitest` instance in `onInit` for project enumeration
- Stash coverage data in `onCoverage` (fires before `onTestRunEnd`)
- In `onTestRunEnd`, group `TestModule[]` by `testModule.project.name`
- For each project: build report via `buildAgentReport()`, write per-project
  JSON cache file via CacheWriter service
- Attach `unhandledErrors` to ALL project reports (not just "default")
- Extract `TestOutcome[]` from `VitestTestModule` objects
- Classify tests via `HistoryTracker.classify(outcomes)`, attach resulting
  classifications to `TestReport.classification` fields
- Write per-project history JSON via `CacheWriter.writeHistory()`
- Read existing baselines via `CacheReader.readBaselines()`, compute updated
  baselines after coverage processing, write via `CacheWriter.writeBaselines()`
- Compute coverage trends via `computeTrend()` on full (non-scoped) runs,
  write per-project trends via `CacheWriter.writeTrends()`
- Populate `historyFile` field in manifest entries
- Write/update cache manifest (`manifest.json`) via CacheWriter service
- Format and emit tiered console markdown (green/yellow/red based on run
  health); includes `[new-failure]` classification labels on failed tests
  and trend summary line when trend data available
- When `GITHUB_ACTIONS` detected or `githubActions` option enabled, append
  GFM summary to `GITHUB_STEP_SUMMARY` file via FileSystem service
- Process coverage via CoverageAnalyzer service with scoped coverage support
  and Vitest-native threshold format
- Each lifecycle hook builds a scoped effect and runs it with
  `Effect.runPromise`, providing the `ReporterLive` layer inline

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
}
```

**Dependencies:**

- Depends on: Vitest Reporter v2 API (>= 3.2.0), CacheWriter service,
  CoverageAnalyzer service, HistoryTracker service, CacheReader service,
  `@effect/platform` FileSystem
- Used by: `AgentPlugin`, direct consumer configuration

---

## Component 2: AgentPlugin

**Location:** `package/src/plugin.ts`

**Status:** COMPLETE (Phase 1-2-4)

**Purpose:** Vitest plugin that injects `AgentReporter` into the reporter
chain via the `configureVitest` hook. Manages environment detection via
AgentDetection service, hybrid console strategy, reporter chain
manipulation, cache directory resolution, and coverage threshold/target
resolution.

**Responsibilities:**

- Detect runtime environment via AgentDetection Effect service (backed by
  `std-env`): agent, CI, or human
- Apply `consoleStrategy` behavior:
  - `"complement"` (default): let Vitest's built-in agent reporter handle
    console suppression and GFM. Our reporter adds JSON cache and manifest
    only. Warns if `agent` reporter missing from chain
  - `"own"`: strip built-in console reporters (including `agent`), use our
    formatter, write our own GFM. Phase 1 behavior
- Resolve cache directory with priority: explicit option > `outputFile`
  config > `vite.cacheDir + "/vitest-agent-reporter"`
- Resolve coverage thresholds from Vitest's resolved coverage config via
  `resolveThresholds()` utility (replaces `extractCoverageThreshold`)
- Resolve coverage targets from plugin options via `resolveThresholds()`
- Disable Vitest's native `autoUpdate` when our targets are set (prevents
  Vitest from auto-ratcheting thresholds independently)
- Push `AgentReporter` instance into `vitest.config.reporters`
- `configureVitest` is async (runs `Effect.runPromise` for detection)

**Key interfaces/APIs:**

```typescript
// Effect Schema (source of truth) -- see Options.ts in schemas/
interface AgentPluginOptions {
  mode?: "auto" | "agent" | "silent";             // default: "auto"
  consoleStrategy?: "own" | "complement";         // default: "complement"
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

**Console strategy behavior matrix:**

| mode | consoleStrategy | Console | Reporters stripped? | GFM | JSON cache |
| ---- | --------------- | ------- | ------------------- | --- | ---------- |
| agent | complement | Vitest built-in | No | Vitest built-in | Yes |
| agent | own | Our markdown | Yes | Ours | Yes |
| silent | complement | None from us | No | No | Yes |
| silent | own | None | No | No | Yes |
| auto (agent) | complement | Vitest built-in | No | Vitest built-in | Yes |
| auto (agent) | own | Our markdown | Yes | Ours | Yes |
| auto (CI) | complement | Vitest built-in | No | Vitest built-in | Yes |
| auto (CI) | own | Silent | No | Ours | Yes |
| auto (human) | either | Silent | No | No | Yes |

**Console reporters stripped in "own" mode (agent environment):**

`default`, `verbose`, `tree`, `dot`, `tap`, `tap-flat`, `hanging-process`,
`agent`. Custom reporters (class instances, file paths) and non-console
built-in reporters (`json`, `junit`, `html`, `blob`, `github-actions`) are
preserved.

**Dependencies:**

- Depends on: Vitest Plugin API (`configureVitest`, Vitest 3.1+),
  `AgentReporter`, AgentDetection service, `stripConsoleReporters`
- Used by: Consumer `vitest.config.ts`

---

## Component 3: Effect Services

**Location:** `package/src/services/`

**Status:** COMPLETE (Phase 2-3)

**Purpose:** Effect `Context.Tag` definitions for all shared functionality.
Each service is a tag with a typed interface. Live implementations use
`@effect/platform` for file I/O; test implementations use mock state
containers.

**Services:**

- **AgentDetection** (`package/src/services/AgentDetection.ts`) -- wraps `std-env`
  for environment detection. Provides `isAgent`, `agentName`, `isCI`, and
  `environment` effects. Replaces the hand-rolled `detectEnvironment()`
  utility from Phase 1
- **CacheWriter** (`package/src/services/CacheWriter.ts`) -- writes reports,
  history, baselines, trends, and manifest to disk via `@effect/platform`
  FileSystem. Provides `writeReport`, `writeHistory`, `writeBaselines`,
  `writeTrends`, `writeManifest`, and `ensureDir` effects. `writeHistory`
  writes to `{cacheDir}/history/{safeFilename(project)}.history.json`.
  `writeBaselines` writes to `{cacheDir}/baselines.json`. `writeTrends`
  writes to `{cacheDir}/trends/{safeFilename(project)}.trends.json`
- **CacheReader** (`package/src/services/CacheReader.ts`) -- reads manifest,
  reports, history, baselines, and trends from disk. Provides `readManifest`,
  `readReport`, `readHistory`, `readBaselines`, `readTrends`, and
  `listReports` effects. `readHistory` returns an empty record for missing
  or corrupt files (logs a warning for corruption). `readBaselines` and
  `readTrends` return `Option.none()` for missing files. Shared between
  reporter and CLI. Exported from public API for programmatic cache access
- **CoverageAnalyzer** (`package/src/services/CoverageAnalyzer.ts`) -- processes
  istanbul CoverageMap with optional scoping. Provides `process` (full
  analysis) and `processScoped` (filtered to tested source files) effects.
  Replaces the standalone `processCoverage()` function from Phase 1
- **ProjectDiscovery** (`package/src/services/ProjectDiscovery.ts`) -- glob-based
  test file discovery for the CLI. Provides `discoverTestFiles` and
  `mapTestToSource` effects. Uses convention-based mapping (strip
  `.test.`/`.spec.` suffix) with existence check via FileSystem. Live
  layer uses a `SKIP_DIRS` set (`node_modules`, `.git`, `dist`,
  `coverage`, `.turbo`, `.vite`) to exclude non-source directories from
  recursive `walkDir` traversal
- **HistoryTracker** (`package/src/services/HistoryTracker.ts`) -- classifies test
  outcomes against stored history. Provides a `classify` method accepting
  `TestOutcome[]` and returning history records plus a classifications map
  (`Map<string, TestClassification>`). Uses a 10-entry sliding window.
  Depends on CacheReader to load prior history

---

## Component 4: Effect Layers

**Location:** `package/src/layers/`

**Status:** COMPLETE (Phase 2-3)

**Purpose:** Live and test implementations for all Effect services, plus
merged composition layers.

**Live layers:**

- `AgentDetectionLive` -- reads `std-env` exports plus CI env vars
- `CacheWriterLive` -- depends on `FileSystem` from `@effect/platform`
- `CacheReaderLive` -- depends on `FileSystem` from `@effect/platform`.
  Uses `Effect.try` to wrap `Schema.decodeUnknownSync` + `JSON.parse`
  so corrupt or invalid cache files produce typed `CacheError` instead
  of unhandled defects
- `CoverageAnalyzerLive` -- pure computation (duck-typed CoverageMap)
- `ProjectDiscoveryLive` -- depends on `FileSystem` for glob and stat
- `HistoryTrackerLive` -- classification logic with 10-entry sliding window.
  Depends on CacheReader for loading prior history

**Test layers:**

- `AgentDetectionTest` -- accepts a fixed environment value
- `CacheWriterTest` -- accumulates writes into mutable state container
- `CacheReaderTest` -- returns canned data
- `CoverageAnalyzerTest` -- returns canned data
- `ProjectDiscoveryTest` -- returns canned data
- `HistoryTrackerTest` -- returns canned classifications

**Merged layers:**

- `ReporterLive` (`package/src/layers/ReporterLive.ts`) -- CacheWriterLive +
  CoverageAnalyzerLive + CacheReaderLive + HistoryTrackerLive +
  NodeFileSystem. Used by AgentReporter via `Effect.runPromise`
- `CliLive` (`package/src/layers/CliLive.ts`) -- CacheReaderLive +
  ProjectDiscoveryLive + HistoryTrackerLive + NodeFileSystem. Used by CLI
  via `NodeRuntime.runMain`

---

## Component 5: Effect Error Types

**Location:** `package/src/errors/`

**Status:** COMPLETE (Phase 2)

**Purpose:** Tagged error types for Effect service failure channels.

- **CacheError** (`package/src/errors/CacheError.ts`) -- `Data.TaggedError`
  for file I/O failures (read, write, mkdir operations)
- **DiscoveryError** (`package/src/errors/DiscoveryError.ts`) --
  `Data.TaggedError` for project discovery failures (glob, read, stat
  operations)

---

## Component 6: Effect Schemas

**Location:** `package/src/schemas/`

**Status:** COMPLETE (Phase 2-3-4)

**Purpose:** Single source of truth for all data structures. Defines Effect
Schema definitions with `typeof Schema.Type` for TypeScript types and
`Schema.decodeUnknown`/`Schema.encodeUnknown` for JSON encode/decode.
Replaces the Zod 4 schemas from Phase 1.

**Files:**

- `Common.ts` -- shared literals: `TestState`, `TestRunReason`,
  `TestClassification`, `ConsoleOutputMode`, `PluginMode`,
  `ConsoleStrategy`, `PackageManager`
- `AgentReport.ts` -- `AgentReport`, `ModuleReport`, `TestReport`,
  `ReportError` schemas
- `Coverage.ts` -- `CoverageReport`, `CoverageTotals`,
  `FileCoverageReport` schemas. `CoverageReport.thresholds` is now an
  object with `global: MetricThresholds` and `patterns: PatternThresholds[]`
  (replaces the previous `threshold: number`). Optional `targets` and
  `baselines` fields with same shape. `scoped` (boolean, defaults false),
  `scopedFiles` (optional string array)
- `Thresholds.ts` -- `MetricThresholds` (per-metric optional numbers),
  `PatternThresholds` (glob + metrics tuple), `ResolvedThresholds` (global
  - perFile + patterns). Supports Vitest-native format including per-metric,
  per-glob, negative numbers, `100` shorthand
- `Baselines.ts` -- `CoverageBaselines` (updatedAt + global + patterns).
  Stores auto-ratcheting high-water marks in the cache directory
- `Trends.ts` -- `TrendEntry` (timestamp, coverage totals, delta, direction,
  targetsHash), `TrendRecord` (entries array). Per-project trend data with
  50-entry sliding window
- `CacheManifest.ts` -- `CacheManifest`, `CacheManifestEntry` schemas
- `Options.ts` -- `AgentReporterOptions`, `AgentPluginOptions`,
  `CoverageOptions`, `FormatterOptions` schemas. `AgentReporterOptions` now
  has `coverageThresholds` and `coverageTargets` (Vitest-native format,
  `Record<string, unknown>`) and `autoUpdate` (boolean, default true)
  replacing the previous `coverageThreshold: number`
- `History.ts` -- `TestRun`, `TestHistory`, `HistoryRecord` schemas.
  `TestRun` captures a single test execution outcome. `TestHistory` holds
  the sliding window of runs (up to 10) for a single test. `HistoryRecord`
  is a `Record<string, TestHistory>` keyed by test `fullName`

Istanbul duck-type interfaces remain as TypeScript interfaces, not schemas.

---

## Component 7: CLI Bin

**Location:** `package/src/cli/`

**Status:** COMPLETE (Phase 2-3-4)

**Purpose:** On-demand test landscape queries for LLM agents. Reads cached
test data (manifest + reports) and project structure. Does not run tests or
call AI providers.

**Entry point:** `package/src/cli/index.ts` exports `runCli()`. Bin wrapper
at `package/bin/vitest-agent-reporter.js` is a thin shebang wrapper.

**Commands:**

- `status` (`package/src/cli/commands/status.ts`) -- reads manifest, shows
  per-project pass/fail state with re-run commands
- `overview` (`package/src/cli/commands/overview.ts`) -- test landscape
  summary with file-to-test mapping, project discovery, and run commands
- `coverage` (`package/src/cli/commands/coverage.ts`) -- coverage gap
  analysis from cached reports. Reads thresholds from each project's cached
  `report.coverage.thresholds` value
- `history` (`package/src/cli/commands/history.ts`) -- surfaces flaky
  tests, persistent failures, and recovered tests with pass/fail run
  visualization
- `trends` (`package/src/cli/commands/trends.ts`) -- per-project coverage
  trend display with direction, metrics table, and trajectory sparkline
- `cache path` (`package/src/cli/commands/cache.ts`) -- prints resolved
  cache directory path
- `cache clean` (`package/src/cli/commands/cache.ts`) -- deletes entire
  cache directory (idempotent)
- `doctor` (`package/src/cli/commands/doctor.ts`) -- 5-point cache health
  diagnostic: cache resolution, manifest presence, report integrity,
  history integrity, staleness check

**Lib functions (testable pure logic):**

- `format-status.ts` -- formats status data as markdown
- `format-overview.ts` -- formats overview data as markdown
- `format-coverage.ts` -- formats coverage data as markdown
- `format-history.ts` -- formats history data as markdown
- `format-trends.ts` -- formats trends data as markdown
- `format-doctor.ts` -- formats doctor diagnostic data as markdown
- `resolve-cache-dir.ts` -- resolves cache directory from common locations;
  now searches `node_modules/.vite/vitest/*/vitest-agent-reporter` for
  Vite's hash-based cache subdirectory

**Dependencies:**

- Depends on: `@effect/cli` for command framework, CacheReader service,
  ProjectDiscovery service, HistoryTracker service,
  `@effect/platform-node` for NodeRuntime
- Used by: `package/bin/vitest-agent-reporter.js`

---

## Component 8: Console Markdown Formatter

**Location:** `package/src/utils/format-console.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2, enhanced Phase 3-4)

**Purpose:** Pure function that formats an `AgentReport` as compact,
actionable console markdown for LLM agent consumption.

**Output format:**

Console output uses three tiers based on run health:

- **Green tier** (all pass, targets met): minimal one-line summary with
  cache file pointer
- **Yellow tier** (pass but below targets): shows improvements needed,
  CLI hint for `coverage` command
- **Red tier** (failures/threshold violations/regressions): full detail
  with failed test errors and diffs, coverage gaps, `[new-failure]`
  classification labels, CLI hints for `coverage` and `trends` commands

Common elements across tiers:

- Compact header: `## [check/cross] Vitest -- N failed, N passed (Nms)`
- Trend summary line after header when trend data available (e.g.,
  "Coverage improving over N runs")
- Prioritized suggestions in Next Steps section (e.g., "N new failures since
  last run", "N persistent failures across N runs")
- CLI command suggestions use detected package manager from `detect-pm.ts`
- Relative file paths throughout (not absolute)
- ANSI color codes that no-op when `NO_COLOR` is set

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

## Component 10: GFM Formatter

**Location:** `package/src/utils/format-gfm.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2)

**Purpose:** Formats `AgentReport` array as GitHub-Flavored Markdown for
`GITHUB_STEP_SUMMARY`. Handles both single-project and multi-project output.

**GFM features:**

- Summary table with pass/fail counts
- Collapsible `<details>` blocks for per-project results (monorepo)
- Coverage metrics table
- Diff-fenced code blocks for expected/received comparisons
- GitHub Alert callouts (`[!WARNING]`) for coverage threshold violations

---

## Component 11: Package Manager Detection

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

## Component 12: Utility Functions

**Location:** `package/src/utils/`

**Status:** COMPLETE (Phase 1, split into individual files Phase 2)

**Purpose:** Pure utility functions that don't warrant Effect service
wrapping.

**Files:**

- `compress-lines.ts` -- converts `[1,2,3,5,10,11,12]` to `"1-3,5,10-12"`
- `safe-filename.ts` -- sanitizes project names for cache file paths
- `ansi.ts` -- ANSI color helpers that no-op when `NO_COLOR` is set
- `strip-console-reporters.ts` -- removes console reporters from Vitest's
  reporter chain, plus `CONSOLE_REPORTERS` constant
- `resolve-thresholds.ts` -- parses Vitest-native coverage thresholds format
  (per-metric, per-glob, negative numbers, `100` shorthand, `perFile`) into
  `ResolvedThresholds`. Also provides `getMinThreshold()` for backward-
  compatible single-number threshold extraction
- `compute-trend.ts` -- computes coverage trend entries from current run
  data against existing trend records. Provides `computeTrend()` (sliding
  window management, target change detection via hash comparison),
  `hashTargets()`, and `getRecentDirection()`. 50-entry max window

---

## Component 13: Failure History & Classification

**Location:** `package/src/services/HistoryTracker.ts`,
`package/src/layers/HistoryTrackerLive.ts`,
`package/src/layers/HistoryTrackerTest.ts`,
`package/src/schemas/History.ts`

**Status:** COMPLETE (Phase 3)

**Purpose:** Per-test failure persistence across runs and classification-driven
suggestions in console output.

**Responsibilities:**

- `HistoryTracker` service (`package/src/services/HistoryTracker.ts`) --
  Context.Tag with `classify(outcomes: TestOutcome[]): Effect` returning
  history records and a `Map<string, TestClassification>` for the current run
- `HistoryTrackerLive` (`package/src/layers/HistoryTrackerLive.ts`) -- loads
  prior history via CacheReader, appends the current run to each test's sliding
  window (capped at 10 entries), then classifies each test:
  - `new-failure` -- first failure (no prior history or prior run passed)
  - `persistent` -- failed in two or more consecutive runs
  - `flaky` -- mixed pass/fail across recent history
  - `recovered` -- previously failed, now passing
  - `stable` -- consistently passing
- `HistoryTrackerTest` (`package/src/layers/HistoryTrackerTest.ts`) -- returns canned
  classifications for unit tests
- `History.ts` schema -- `TestRun` (single outcome), `TestHistory` (sliding
  window), `HistoryRecord` (`Record<string, TestHistory>`)

**Key interface:**

```typescript
interface TestOutcome {
  fullName: string;
  state: "passed" | "failed" | "skipped" | "pending";
}
```

**Dependencies:**

- Depends on: CacheReader service (to load prior history), CacheWriter
  service (called separately by AgentReporter to persist updated history)
- Used by: AgentReporter (classification), CLI `history` command

---

## Component 14: Coverage Thresholds

**Location:** `package/src/schemas/Thresholds.ts`,
`package/src/utils/resolve-thresholds.ts`

**Status:** COMPLETE (Phase 4)

**Purpose:** Vitest-native coverage threshold parsing and resolution.
Replaces the previous `coverageThreshold: number` with full Vitest format
support.

**Schemas:**

- `MetricThresholds` -- per-metric optional numbers (lines, functions,
  branches, statements)
- `PatternThresholds` -- `[globPattern, MetricThresholds]` tuple for
  per-file-pattern thresholds
- `ResolvedThresholds` -- fully resolved structure with `global`
  (MetricThresholds), `perFile` (boolean), and `patterns`
  (PatternThresholds[])

**Parser (`resolveThresholds`):**

- Handles Vitest thresholds input format: top-level metric numbers, `100`
  shorthand (sets all metrics to 100), `perFile` boolean, `autoUpdate`
  boolean (consumed by plugin, not stored in resolved), and arbitrary glob
  pattern keys with nested metric objects
- `getMinThreshold()` extracts a single minimum number for backward-
  compatible "low coverage" detection

**Dependencies:**

- Used by: AgentPlugin (threshold/target resolution), CoverageAnalyzer
  (threshold evaluation), console formatter (gap display)

---

## Component 15: Coverage Baselines

**Location:** `package/src/schemas/Baselines.ts`

**Status:** COMPLETE (Phase 4)

**Purpose:** Auto-ratcheting coverage baselines that persist high-water
marks per metric. Baselines advance toward targets but never past them.

**Schema (`CoverageBaselines`):**

- `updatedAt` -- ISO 8601 timestamp of last baseline update
- `global` -- `MetricThresholds` (high-water mark per metric)
- `patterns` -- `PatternThresholds[]` (per-glob high-water marks)

**Lifecycle:**

1. Reporter reads existing baselines via `CacheReader.readBaselines()`
2. After coverage processing, computes updated baselines (ratchet up only)
3. Writes updated baselines via `CacheWriter.writeBaselines()`
4. Baselines stored at `{cacheDir}/baselines.json`

**Dependencies:**

- Depends on: CacheReader (read), CacheWriter (write), Thresholds schema
- Used by: AgentReporter (baseline computation), CoverageReport (embedded)

---

## Component 16: Coverage Trends

**Location:** `package/src/schemas/Trends.ts`,
`package/src/utils/compute-trend.ts`

**Status:** COMPLETE (Phase 4)

**Purpose:** Per-project coverage trend tracking with sliding window for
direction analysis over time.

**Schemas:**

- `TrendEntry` -- single data point: timestamp, coverage totals, delta
  (change from previous), direction (`improving` | `regressing` | `stable`),
  optional `targetsHash` for change detection
- `TrendRecord` -- array of entries (50-entry max sliding window)

**Trend computation (`computeTrend`):**

- Only recorded on full (non-scoped) test runs
- Computes delta from previous entry's coverage totals
- Determines direction from aggregate delta (>0.1 = improving,
  <-0.1 = regressing, else stable)
- Detects target changes via `hashTargets()` -- if targets hash differs
  from last entry, trend history is cleared and current entry becomes first
  data point
- `getRecentDirection()` analyzes the last N entries for overall trajectory

**Storage:** `{cacheDir}/trends/{safe-project-name}.trends.json`

**Dependencies:**

- Depends on: CacheReader (read), CacheWriter (write), Coverage schema,
  Thresholds schema
- Used by: AgentReporter (trend computation), CLI `trends` command,
  console formatter (trend summary line)

---

## Component 17: CLI Diagnostics (cache, doctor, trends)

**Location:** `package/src/cli/commands/cache.ts`,
`package/src/cli/commands/doctor.ts`,
`package/src/cli/commands/trends.ts`,
`package/src/cli/lib/format-doctor.ts`,
`package/src/cli/lib/format-trends.ts`

**Status:** COMPLETE (Phase 4)

**Purpose:** Additional CLI commands for cache management, health
diagnostics, and coverage trend visualization.

**Commands:**

- **`cache path`** -- prints the resolved cache directory path. Uses
  `resolveCacheDir` which now searches Vite's hash-based subdirectories
  at `node_modules/.vite/vitest/*/vitest-agent-reporter`
- **`cache clean`** -- deletes the entire cache directory. Idempotent
  (succeeds even if directory does not exist)
- **`doctor`** -- runs 5-point cache health diagnostic:
  1. Cache directory resolution
  2. Manifest presence and validity
  3. Report file integrity (per-project)
  4. History file integrity (per-project)
  5. Staleness check (last run recency)
- **`trends`** -- per-project coverage trend display showing direction
  indicator, per-metric values with deltas, and trajectory sparkline
  visualization

**Dependencies:**

- Depends on: CacheReader service, `resolveCacheDir`, FileSystem
- Used by: LLM agents for cache diagnostics and coverage monitoring
