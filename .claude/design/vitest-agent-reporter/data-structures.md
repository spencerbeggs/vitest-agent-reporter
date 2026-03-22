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
  - vitest-agent-reporter/components.md
dependencies: []
---

# Data Structures & System Layout -- vitest-agent-reporter

File structure, data schemas, cache layout, output formats, error handling,
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
        doctor.ts         -- 5-point cache health diagnostic
      lib/
        format-status.ts  -- testable formatting logic
        format-overview.ts
        format-coverage.ts
        format-history.ts
        format-trends.ts  -- trend data formatting
        format-doctor.ts  -- doctor diagnostic formatting
        resolve-cache-dir.ts -- searches Vite hash-based subdirectories

    services/
      AgentDetection.ts   -- Context.Tag: std-env wrapper
      CacheWriter.ts      -- Context.Tag: write reports/manifest/history
      CacheReader.ts      -- Context.Tag: read reports/manifest/history
      CoverageAnalyzer.ts -- Context.Tag: coverage processing
      ProjectDiscovery.ts -- Context.Tag: test file discovery
      HistoryTracker.ts   -- Context.Tag: test outcome classification

    layers/
      AgentDetectionLive.ts / AgentDetectionTest.ts
      CacheWriterLive.ts / CacheWriterTest.ts
      CacheReaderLive.ts / CacheReaderTest.ts
      CoverageAnalyzerLive.ts / CoverageAnalyzerTest.ts
      ProjectDiscoveryLive.ts / ProjectDiscoveryTest.ts
      HistoryTrackerLive.ts / HistoryTrackerTest.ts
      ReporterLive.ts     -- merged layer for reporter runtime
      CliLive.ts          -- merged layer for CLI runtime

    errors/
      CacheError.ts       -- Data.TaggedError (file I/O)
      DiscoveryError.ts   -- Data.TaggedError (project discovery)

    schemas/
      Common.ts           -- shared literals (TestState, ConsoleStrategy, etc.)
      AgentReport.ts      -- report + module + test schemas
      CacheManifest.ts    -- manifest + entry schemas
      Coverage.ts         -- coverage report + totals + file coverage
      Thresholds.ts       -- MetricThresholds, PatternThresholds, ResolvedThresholds
      Baselines.ts        -- CoverageBaselines (auto-ratcheting high-water marks)
      Trends.ts           -- TrendEntry, TrendRecord (coverage trends)
      History.ts          -- TestRun, TestHistory, HistoryRecord schemas
      Options.ts          -- reporter + plugin + coverage + formatter options

    utils/
      compress-lines.ts   -- range compression for uncovered lines
      safe-filename.ts    -- project name sanitization
      ansi.ts             -- ANSI color helpers (NO_COLOR aware)
      strip-console-reporters.ts -- reporter chain manipulation
      detect-pm.ts        -- package manager detection (FileSystemAdapter)
      resolve-thresholds.ts -- Vitest thresholds format parser
      compute-trend.ts    -- coverage trend computation + hash comparison
      format-console.ts   -- pure function: tiered console markdown
      format-gfm.ts       -- pure function: GitHub Actions GFM
      build-report.ts     -- pure function: AgentReport builder + duck-typed
                             Vitest interfaces

  bin/
    vitest-agent-reporter.js  -- shebang wrapper for CLI
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
    resolve-cache-dir.test.ts -- cache dir resolution (includes Vite hash paths)
  errors/
    errors.test.ts          -- CacheError, DiscoveryError tagged errors
  layers/
    AgentDetectionLive.test.ts  -- std-env integration, live layer
    CacheWriterLive.test.ts     -- file write via mock FileSystem
    CacheReaderLive.test.ts     -- file read via mock FileSystem,
                                   corrupt/invalid JSON error paths
    CoverageAnalyzerLive.test.ts -- coverage processing, test layer
    ProjectDiscoveryLive.test.ts -- test file discovery
    HistoryTrackerLive.test.ts  -- classification logic, sliding window
    ReporterLive.test.ts        -- merged layer composition
  schemas/
    Common.test.ts          -- shared literal schemas
    AgentReport.test.ts     -- report schema validation
    CacheManifest.test.ts   -- manifest schema validation
    Coverage.test.ts        -- coverage schema validation (thresholds object)
    Baselines.test.ts       -- baselines schema validation
    Trends.test.ts          -- TrendEntry, TrendRecord schema validation
    History.test.ts         -- TestRun, TestHistory, HistoryRecord schema validation
    Options.test.ts         -- reporter + plugin + coverage options schema validation
  services/
    services.test.ts        -- service Context.Tag definitions
  utils/
    compress-lines.test.ts  -- range compression edge cases
    safe-filename.test.ts   -- sanitization edge cases
    ansi.test.ts            -- ANSI/stripAnsi, NO_COLOR
    strip-console-reporters.test.ts -- reporter chain manipulation
    detect-pm.test.ts       -- package manager detection
    resolve-thresholds.test.ts -- Vitest thresholds format parsing
    compute-trend.test.ts   -- trend computation, hash change detection
    format-console.test.ts  -- tiered console markdown formatting
    format-gfm.test.ts      -- GFM formatting
    build-report.test.ts    -- report building with mock Vitest objects
```

**36 test files, 429 tests total.** All coverage metrics (statements,
branches, functions, lines) are above 80%.

---

## Cache Directory Layout

Cache outputs are organized under a configurable root directory. When using
`AgentPlugin`, this defaults to Vite's `cacheDir` + `"/vitest-agent-reporter"`
(typically `node_modules/.vite/.../vitest-agent-reporter/`). When using
`AgentReporter` standalone, it defaults to `.vitest-agent-reporter/`.

```text
{cacheDir}/
  manifest.json                         -- project index (CacheManifest)
  baselines.json                        -- auto-ratcheting coverage baselines
  reports/                              -- per-project test result JSON
    {safe-project-name}.json            -- AgentReport encoded via codec
    default.json                        -- single-repo fallback name
  history/                              -- per-project failure history JSON
    {safe-project-name}.history.json    -- HistoryRecord encoded via codec
  trends/                               -- per-project coverage trend JSON
    {safe-project-name}.trends.json     -- TrendRecord encoded via codec
```

**`safeFilename()` examples:**

- `"@savvy-web/my-lib:unit"` -> `"@savvy-web__my-lib__unit"`
- `"core"` -> `"core"`
- `""` (root project) -> `"default"`

**Package manager detection:**

The CLI overview and history commands need to output correct run commands.
Detection logic in `package/src/utils/detect-pm.ts`:

1. Check `packageManager` field in root `package.json`
2. Fall back to lockfile detection
3. Default to `npx` if nothing detected

---

## Data Structures

All types are defined as Effect Schema definitions in `package/src/schemas/` with
TypeScript types derived via `typeof Schema.Type`.

### JSON Report (`AgentReport`)

```typescript
// From AgentReport.ts in schemas/
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
  classification?: TestClassification;            // Phase 3
}

type TestClassification =
  | "stable"
  | "new-failure"
  | "persistent"
  | "flaky"
  | "recovered";

interface ReportError {
  message: string;
  stack?: string;                                 // from stacks[] array
  diff?: string;                                  // expected/received diff
}
```

### Coverage Report

```typescript
interface CoverageReport {
  totals: CoverageTotals;
  thresholds: {                                   // Phase 4: Vitest-native format
    global: MetricThresholds;                     // per-metric thresholds
    patterns?: PatternThresholds[];               // per-glob thresholds
  };
  targets?: {                                     // Phase 4: aspirational goals
    global: MetricThresholds;
    patterns?: PatternThresholds[];
  };
  baselines?: {                                   // Phase 4: high-water marks
    global: MetricThresholds;
    patterns?: PatternThresholds[];
  };
  scoped?: boolean;                               // Phase 2: filtered to subset
  scopedFiles?: string[];                         // Phase 2: files in scope
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

type PatternThresholds = [string, MetricThresholds];  // [glob, metrics]

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
  perFile?: boolean;                              // default: false
  patterns?: PatternThresholds[];                 // per-glob overrides
}
```

### Coverage Baselines (`CoverageBaselines`)

```typescript
interface CoverageBaselines {
  updatedAt: string;                              // ISO 8601
  global: MetricThresholds;                       // high-water marks
  patterns?: PatternThresholds[];                 // per-glob high-water marks
}
```

### Coverage Trends (`TrendRecord`)

```typescript
interface TrendEntry {
  timestamp: string;                              // ISO 8601
  coverage: CoverageTotals;                       // coverage at this point
  delta: CoverageTotals;                          // change from previous entry
  direction: "improving" | "regressing" | "stable";
  targetsHash?: string;                           // hash of targets for change detection
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
  project: string;                                // project name
  reportFile: string;                             // relative: reports/{name}.json
  historyFile?: string;                           // relative: history/{name}.history.json
  lastRun: string | null;
  lastResult: "passed" | "failed" | "interrupted" | null;
}
```

### Failure History (`HistoryRecord`)

```typescript
// From History.ts in schemas/
interface TestRun {
  timestamp: string;                              // ISO 8601
  state: "passed" | "failed" | "skipped" | "pending";
}

interface TestHistory {
  runs: TestRun[];                                // sliding window, max 10
}

type HistoryRecord = Record<string, TestHistory>; // keyed by test fullName
```

---

## Console Output Format

Printed to `process.stdout`. Uses `ansi()` helper that no-ops when
`NO_COLOR` is set.

Three modes controlled by `consoleOutput` option:

- `"failures"` (default) -- tiered output based on run health
- `"full"` -- same tiered format, includes passing test details
- `"silent"` -- no console output, JSON only

Console output uses three tiers based on run health:

- **Green** (all pass, targets met): minimal one-line summary
- **Yellow** (pass but below targets): improvements needed + CLI hint
- **Red** (failures/threshold violations/regressions): full detail +
  CLI hints

**Example output (green tier -- all passing, targets met):**

```markdown
## [checkmark] Vitest -- 10 passed (120ms)

[checkmark] All tests passed

-> Cache: `node_modules/.vite/.../vitest-agent-reporter/reports/default.json`
```

**Example output (yellow tier -- passing but below targets):**

```markdown
## [checkmark] Vitest -- 10 passed (120ms)

Coverage improving over 5 runs

[checkmark] All tests passed

### Coverage targets

- Lines: 78% (target: 90%)
- Branches: 65% (target: 80%)

-> Run `pnpm vitest-agent-reporter coverage` for gap analysis

-> Cache: `node_modules/.vite/.../vitest-agent-reporter/reports/default.json`
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
- Full report: `node_modules/.vite/.../vitest-agent-reporter/reports/default.json`
````

---

## Error Handling Strategy

- **File write failures:** CacheError tagged error, logged to stderr, don't
  crash the test run
- **File read failures (corrupt cache):** CacheReaderLive wraps
  `Schema.decodeUnknownSync` + `JSON.parse` in `Effect.try`, catching
  both malformed JSON and schema validation failures as typed `CacheError`
  rather than unhandled defects. `readHistory` logs a warning for corrupt
  history files and returns an empty record rather than propagating the error
- **Coverage duck-type mismatch:** CoverageAnalyzer returns `Option.none()`,
  coverage section silently skipped
- **Missing `GITHUB_STEP_SUMMARY`:** Skip GFM output (no warning)
- **Cache directory creation:** CacheWriter.ensureDir uses
  `mkdir({ recursive: true })`, wraps failures in CacheError
- **Project discovery failures:** DiscoveryError tagged error, CLI reports
  the issue and continues with available data

---

## Data Flow

### Flow 1: AgentReporter Lifecycle

```text
onInit(vitest)
  +-- store vitest instance as this._vitest

onCoverage(coverage)
  +-- stash as this.coverage

onTestRunEnd(testModules, unhandledErrors, reason)
  |
  +-- Build Effect program:
  |     +-- yield* CacheWriter
  |     +-- yield* CacheReader
  |     +-- yield* CoverageAnalyzer
  |     +-- yield* HistoryTracker
  |
  +-- Group testModules by testModule.project.name
  |     +-- Map<string, VitestTestModule[]>
  |
  +-- CoverageAnalyzer.process/processScoped(coverage, options)
  |     +-- Returns Option<CoverageReport>
  |     +-- processScoped used when partial test run detected
  |
  +-- CacheReader.readBaselines(cacheDir)
  |     +-- Returns Option<CoverageBaselines>
  |
  +-- For each project group:
  |     +-- buildAgentReport(modules, errors, reason, options, name)
  |     |     +-- Pure function: tallies, extracts errors, builds report
  |     +-- Attach unhandledErrors to ALL project reports
  |     +-- Attach coverageReport if present
  |     +-- Extract TestOutcome[] from VitestTestModule objects
  |     +-- HistoryTracker.classify(outcomes)
  |     |     +-- Returns { history: HistoryRecord, classifications: Map }
  |     +-- Attach classifications to TestReport.classification fields
  |     +-- computeTrend() on full (non-scoped) runs
  |     |     +-- CacheReader.readTrends(cacheDir, projectName)
  |     |     +-- computeTrend(totals, existing, targets)
  |     |     +-- CacheWriter.writeTrends(cacheDir, projectName, trends)
  |     +-- CacheWriter.writeReport(cacheDir, projectName, report)
  |     +-- CacheWriter.writeHistory(cacheDir, projectName, history)
  |
  +-- Compute updated baselines (ratchet up, capped at targets)
  +-- CacheWriter.writeBaselines(cacheDir, baselines)
  +-- CacheWriter.writeManifest(cacheDir, manifest)
  |     +-- historyFile field populated per project
  |
  +-- Console output (if not "silent")
  |     +-- formatConsoleMarkdown(report, options) -> stdout
  |     +-- [new-failure] labels on failed tests with classifications
  |
  +-- GFM output (if GitHub Actions detected and "own" strategy)
  |     +-- formatGfm(reports) -> FileSystem.appendFile(GITHUB_STEP_SUMMARY)
  |
  +-- Effect.runPromise(program.pipe(Effect.provide(ReporterLive)))
```

### Flow 2: AgentPlugin (async configureVitest)

```text
async configureVitest({ vitest })
  |
  +-- Effect.runPromise(AgentDetection.environment)
  |     +-- Effect.provide(AgentDetectionLive)
  |     +-- Returns "agent" | "ci" | "human"
  |
  +-- Resolve consoleStrategy (options.consoleStrategy ?? "complement")
  |
  +-- Switch on strategy + environment:
  |     complement + agent -> consoleOutput="silent", githubActions=false,
  |                           warn if 'agent' reporter missing
  |     complement + ci    -> consoleOutput="silent", githubActions=false
  |     own + agent        -> consoleOutput="failures", githubActions=false,
  |                           stripConsoleReporters()
  |     own + ci           -> consoleOutput="silent", githubActions=true
  |     * + human          -> consoleOutput="silent", githubActions=false
  |
  +-- Resolve cacheDir:
  |     option.cacheDir ?? resolveOutputDir(outputFile) ?? vite.cacheDir/...
  |
  +-- Resolve coverage thresholds:
  |     resolveThresholds(option.coverageThresholds ?? coverage.thresholds)
  |
  +-- Resolve coverage targets:
  |     resolveThresholds(option.coverageTargets)
  |
  +-- Disable Vitest native autoUpdate if targets set:
  |     coverage.thresholds.autoUpdate = false
  |
  +-- vitest.config.reporters.push(new AgentReporter({...}))
```

### Flow 3: CLI Commands

```text
vitest-agent-reporter <command> [options]
  |
  +-- NodeRuntime.runMain(cli.pipe(Effect.provide(CliLive)))
  |
  +-- status:
  |     +-- CacheReader.readManifest(cacheDir)
  |     +-- CacheReader.readReport() for failing projects
  |     +-- formatStatus() -> stdout
  |
  +-- overview:
  |     +-- CacheReader.readManifest(cacheDir)
  |     +-- ProjectDiscovery.discoverTestFiles(rootDir)
  |     +-- ProjectDiscovery.mapTestToSource() for file mapping
  |     +-- formatOverview() -> stdout
  |
  +-- coverage:
  |     +-- CacheReader.readManifest(cacheDir)
  |     +-- CacheReader.readReport() for all projects
  |     +-- formatCoverage() -> stdout
  |
  +-- history:
  |     +-- CacheReader.readManifest(cacheDir)
  |     +-- CacheReader.readHistory() for all projects
  |     +-- formatHistory() -> stdout (flaky, persistent, recovered tests)
  |
  +-- trends:
  |     +-- CacheReader.readManifest(cacheDir)
  |     +-- CacheReader.readTrends() for all projects
  |     +-- formatTrends() -> stdout (direction, metrics, sparkline)
  |
  +-- cache path:
  |     +-- resolveCacheDir -> stdout (absolute path)
  |
  +-- cache clean:
  |     +-- resolveCacheDir
  |     +-- FileSystem.remove(cacheDir, { recursive: true })
  |
  +-- doctor:
        +-- resolveCacheDir
        +-- CacheReader.readManifest(cacheDir)
        +-- CacheReader.readReport() per project (integrity)
        +-- CacheReader.readHistory() per project (integrity)
        +-- staleness check (last run recency)
        +-- formatDoctor() -> stdout
```

---

## Integration Points

### Integration 1: Vitest Reporter v2 API

**Hooks used:**

- `onInit(vitest: Vitest)` -- store instance for project enumeration
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

- Available since Vitest 3.1
- Runs before reporters are instantiated
- Now async (Vitest awaits plugin hooks)
- Mutate `vitest.config.reporters` to inject `AgentReporter`
- Access `vitest.vite.config.cacheDir` for cache directory resolution
- Access `vitest.config.coverage.thresholds` for coverage threshold

### Integration 3: GitHub Actions

**Detection:** `process.env.GITHUB_ACTIONS === "true"` or `=== "1"`

**Output target:** `process.env.GITHUB_STEP_SUMMARY` -- a file path.
GFM content is appended (not overwritten) to support multiple steps.

**In complement mode:** GFM output is left to Vitest's built-in reporter.
**In own mode:** Our formatter writes GFM via FileSystem service.

### Integration 4: Consumer LLM Agents

**Read pattern:** Manifest-first (monorepo) or single-file (single repo)

1. Read `{cacheDir}/manifest.json` for project states
2. Filter entries where `lastResult === "failed"`
3. Read only those `reports/{name}.json` files
4. Key fields: `failed[].tests[].errors[].diff`,
   `coverage.lowCoverage[].uncoveredLines`
5. Fix, re-run using commands from console "Next steps" section

**CLI pattern:** Run `vitest-agent-reporter status` for quick overview,
`vitest-agent-reporter overview` for test landscape, or
`vitest-agent-reporter coverage` for gap analysis.

### Integration 5: Effect Ecosystem

**Runtime dependencies:**

- `effect` -- core runtime, Schema, Context, Layer, Data
- `@effect/cli` -- CLI command framework
- `@effect/platform` -- FileSystem, Path abstractions
- `@effect/platform-node` -- Node.js live implementations (NodeFileSystem,
  NodeRuntime)
- `std-env` -- agent and CI runtime detection

**Public API exports for consumers:**

- `CacheReader` service + `CacheReaderLive` layer for programmatic cache
  access
- `CacheError` tagged error for handling service failures
- `HistoryRecord`, `TestHistory`, `TestRun` schemas for programmatic history
  access
- `HistoryTracker` service + `HistoryTrackerLive` layer for custom
  classification workflows
- `TestOutcome` type for constructing `HistoryTracker.classify` inputs
- `AgentDetection` service (exported for consumers needing environment
  detection)
- `ResolvedThresholds`, `MetricThresholds`, `PatternThresholds` schemas for
  threshold data access
- `CoverageBaselines` schema for baseline data access
- `TrendEntry`, `TrendRecord` schemas for trend data access

---

**Document Status:** Current -- reflects Phase 1, Phase 2, Phase 3, and
Phase 4 implementation as built. All phases complete.
