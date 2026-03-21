---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-03-21
last-synced: 2026-03-20
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

**Location:** `src/reporter.ts`

**Status:** COMPLETE (Phase 1-2-3)

**Purpose:** Vitest Reporter that produces three outputs: structured markdown
to console, persistent JSON to disk per project, and optional GFM for GitHub
Actions. Uses Effect services for file I/O, coverage processing, and failure
history tracking.

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
- Populate `historyFile` field in manifest entries
- Write/update cache manifest (`manifest.json`) via CacheWriter service
- Format and emit console markdown (respects `consoleOutput` mode); includes
  `[new-failure]` classification labels on failed tests
- When `GITHUB_ACTIONS` detected or `githubActions` option enabled, append
  GFM summary to `GITHUB_STEP_SUMMARY` file via FileSystem service
- Process coverage via CoverageAnalyzer service with scoped coverage support
- Each lifecycle hook builds a scoped effect and runs it with
  `Effect.runPromise`, providing the `ReporterLive` layer inline

**Key interfaces/APIs:**

```typescript
// Effect Schema (source of truth) -- see Options.ts in schemas/
interface AgentReporterOptions {
  cacheDir?: string;                              // default: ".vitest-agent-reporter"
  consoleOutput?: "failures" | "full" | "silent"; // default: "failures"
  omitPassingTests?: boolean;                     // default: true
  coverageThreshold?: number;                     // default: 0 (no threshold)
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

**Location:** `src/plugin.ts`

**Status:** COMPLETE (Phase 1-2)

**Purpose:** Vitest plugin that injects `AgentReporter` into the reporter
chain via the `configureVitest` hook. Manages environment detection via
AgentDetection service, hybrid console strategy, reporter chain
manipulation, cache directory resolution, and coverage threshold extraction.

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
- Extract coverage threshold from Vitest's resolved coverage config
  (minimum of configured metrics)
- Push `AgentReporter` instance into `vitest.config.reporters`
- `configureVitest` is async (runs `Effect.runPromise` for detection)

**Key interfaces/APIs:**

```typescript
// Effect Schema (source of truth) -- see Options.ts in schemas/
interface AgentPluginOptions {
  mode?: "auto" | "agent" | "silent";             // default: "auto"
  consoleStrategy?: "own" | "complement";         // default: "complement"
  reporter?: Omit<AgentReporterOptions, "consoleOutput" | "githubActions">;
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

**Location:** `src/services/`

**Status:** COMPLETE (Phase 2-3)

**Purpose:** Effect `Context.Tag` definitions for all shared functionality.
Each service is a tag with a typed interface. Live implementations use
`@effect/platform` for file I/O; test implementations use mock state
containers.

**Services:**

- **AgentDetection** (`src/services/AgentDetection.ts`) -- wraps `std-env`
  for environment detection. Provides `isAgent`, `agentName`, `isCI`, and
  `environment` effects. Replaces the hand-rolled `detectEnvironment()`
  utility from Phase 1
- **CacheWriter** (`src/services/CacheWriter.ts`) -- writes reports, history,
  and manifest to disk via `@effect/platform` FileSystem. Provides
  `writeReport`, `writeHistory`, `writeManifest`, and `ensureDir` effects.
  `writeHistory` writes to `{cacheDir}/history/{safeFilename(project)}.history.json`
- **CacheReader** (`src/services/CacheReader.ts`) -- reads manifest, reports,
  and history from disk. Provides `readManifest`, `readReport`, `readHistory`,
  and `listReports` effects. `readHistory` returns an empty record for
  missing or corrupt files (logs a warning for corruption). Shared between
  reporter and CLI. Exported from public API for programmatic cache access
- **CoverageAnalyzer** (`src/services/CoverageAnalyzer.ts`) -- processes
  istanbul CoverageMap with optional scoping. Provides `process` (full
  analysis) and `processScoped` (filtered to tested source files) effects.
  Replaces the standalone `processCoverage()` function from Phase 1
- **ProjectDiscovery** (`src/services/ProjectDiscovery.ts`) -- glob-based
  test file discovery for the CLI. Provides `discoverTestFiles` and
  `mapTestToSource` effects. Uses convention-based mapping (strip
  `.test.`/`.spec.` suffix) with existence check via FileSystem. Live
  layer uses a `SKIP_DIRS` set (`node_modules`, `.git`, `dist`,
  `coverage`, `.turbo`, `.vite`) to exclude non-source directories from
  recursive `walkDir` traversal
- **HistoryTracker** (`src/services/HistoryTracker.ts`) -- classifies test
  outcomes against stored history. Provides a `classify` method accepting
  `TestOutcome[]` and returning history records plus a classifications map
  (`Map<string, TestClassification>`). Uses a 10-entry sliding window.
  Depends on CacheReader to load prior history

---

## Component 4: Effect Layers

**Location:** `src/layers/`

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

- `ReporterLive` (`src/layers/ReporterLive.ts`) -- CacheWriterLive +
  CoverageAnalyzerLive + CacheReaderLive + HistoryTrackerLive +
  NodeFileSystem. Used by AgentReporter via `Effect.runPromise`
- `CliLive` (`src/layers/CliLive.ts`) -- CacheReaderLive +
  ProjectDiscoveryLive + HistoryTrackerLive + NodeFileSystem. Used by CLI
  via `NodeRuntime.runMain`

---

## Component 5: Effect Error Types

**Location:** `src/errors/`

**Status:** COMPLETE (Phase 2)

**Purpose:** Tagged error types for Effect service failure channels.

- **CacheError** (`src/errors/CacheError.ts`) -- `Data.TaggedError` for
  file I/O failures (read, write, mkdir operations)
- **DiscoveryError** (`src/errors/DiscoveryError.ts`) -- `Data.TaggedError`
  for project discovery failures (glob, read, stat operations)

---

## Component 6: Effect Schemas

**Location:** `src/schemas/`

**Status:** COMPLETE (Phase 2-3)

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
  `FileCoverageReport` schemas. New fields: `scoped` (boolean, defaults
  false), `scopedFiles` (optional string array)
- `CacheManifest.ts` -- `CacheManifest`, `CacheManifestEntry` schemas
- `Options.ts` -- `AgentReporterOptions`, `AgentPluginOptions` schemas.
  New field: `ConsoleStrategy` literal (`"own" | "complement"`)
- `History.ts` -- `TestRun`, `TestHistory`, `HistoryRecord` schemas.
  `TestRun` captures a single test execution outcome. `TestHistory` holds
  the sliding window of runs (up to 10) for a single test. `HistoryRecord`
  is a `Record<string, TestHistory>` keyed by test `fullName`

Istanbul duck-type interfaces remain as TypeScript interfaces, not schemas.

---

## Component 7: CLI Bin

**Location:** `src/cli/`

**Status:** COMPLETE (Phase 2-3)

**Purpose:** On-demand test landscape queries for LLM agents. Reads cached
test data (manifest + reports) and project structure. Does not run tests or
call AI providers.

**Entry point:** `src/cli/index.ts` exports `runCli()`. Bin wrapper at
`bin/vitest-agent-reporter.js` is a thin shebang wrapper.

**Commands:**

- `status` (`src/cli/commands/status.ts`) -- reads manifest, shows
  per-project pass/fail state with re-run commands
- `overview` (`src/cli/commands/overview.ts`) -- test landscape summary
  with file-to-test mapping, project discovery, and run commands
- `coverage` (`src/cli/commands/coverage.ts`) -- coverage gap analysis from
  cached reports. Reads threshold from each project's cached
  `report.coverage.threshold` value (no CLI `--threshold` option)
- `history` (`src/cli/commands/history.ts`) -- surfaces flaky tests,
  persistent failures, and recovered tests with pass/fail run visualization

**Lib functions (testable pure logic):**

- `format-status.ts` -- formats status data as markdown
- `format-overview.ts` -- formats overview data as markdown
- `format-coverage.ts` -- formats coverage data as markdown
- `format-history.ts` -- formats history data as markdown
- `resolve-cache-dir.ts` -- resolves cache directory from common locations

**Dependencies:**

- Depends on: `@effect/cli` for command framework, CacheReader service,
  ProjectDiscovery service, HistoryTracker service,
  `@effect/platform-node` for NodeRuntime
- Used by: `bin/vitest-agent-reporter.js`

---

## Component 8: Console Markdown Formatter

**Location:** `src/utils/format-console.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2, enhanced Phase 3)

**Purpose:** Pure function that formats an `AgentReport` as compact,
actionable console markdown for LLM agent consumption.

**Output format:**

- Compact header: `## [check/cross] Vitest -- N failed, N passed (Nms)`
- Failed test details with error messages and diffs; `[new-failure]`
  classification label rendered inline when `TestReport.classification` is set
- Prioritized suggestions in Next Steps section (e.g., "N new failures since
  last run", "N persistent failures across N runs")
- Coverage gaps (only low-coverage files, no totals table)
- Next steps section with re-run commands and cache file pointer
- Relative file paths throughout (not absolute)
- ANSI color codes that no-op when `NO_COLOR` is set

---

## Component 9: JSON Report Builder

**Location:** `src/utils/build-report.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2)

**Purpose:** Pure data transformation function that converts Vitest
`TestModule`/`TestCase` objects into an `AgentReport`. No I/O.

**Implementation note:** Uses duck-typed Vitest interfaces (`VitestTestModule`,
`VitestTestCase`, etc.) rather than importing Vitest types directly, keeping
the formatter independent of the Vitest runtime.

---

## Component 10: GFM Formatter

**Location:** `src/utils/format-gfm.ts`

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

**Location:** `src/utils/detect-pm.ts`

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

**Location:** `src/utils/`

**Status:** COMPLETE (Phase 1, split into individual files Phase 2)

**Purpose:** Pure utility functions that don't warrant Effect service
wrapping.

**Files:**

- `compress-lines.ts` -- converts `[1,2,3,5,10,11,12]` to `"1-3,5,10-12"`
- `safe-filename.ts` -- sanitizes project names for cache file paths
- `ansi.ts` -- ANSI color helpers that no-op when `NO_COLOR` is set
- `strip-console-reporters.ts` -- removes console reporters from Vitest's
  reporter chain, plus `CONSOLE_REPORTERS` constant

---

## Component 13: Failure History & Classification

**Location:** `src/services/HistoryTracker.ts`, `src/layers/HistoryTrackerLive.ts`,
`src/layers/HistoryTrackerTest.ts`, `src/schemas/History.ts`

**Status:** COMPLETE (Phase 3)

**Purpose:** Per-test failure persistence across runs and classification-driven
suggestions in console output.

**Responsibilities:**

- `HistoryTracker` service (`src/services/HistoryTracker.ts`) -- Context.Tag
  with `classify(outcomes: TestOutcome[]): Effect` returning history records
  and a `Map<string, TestClassification>` for the current run
- `HistoryTrackerLive` (`src/layers/HistoryTrackerLive.ts`) -- loads prior
  history via CacheReader, appends the current run to each test's sliding
  window (capped at 10 entries), then classifies each test:
  - `new-failure` -- first failure (no prior history or prior run passed)
  - `persistent` -- failed in two or more consecutive runs
  - `flaky` -- mixed pass/fail across recent history
  - `recovered` -- previously failed, now passing
  - `stable` -- consistently passing
- `HistoryTrackerTest` (`src/layers/HistoryTrackerTest.ts`) -- returns canned
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
