---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-03-20
last-synced: 2026-03-20
completeness: 85
related: []
dependencies: []
---

# Vitest LLM Reporter - Architecture

A Vitest reporter that outputs structured markdown to console and persistent
JSON to disk for LLM coding agents, with optional GFM output for GitHub
Actions check runs and agent-oriented tooling for test suite discovery.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Data Flow](#data-flow)
6. [Integration Points](#integration-points)
7. [Testing Strategy](#testing-strategy)
8. [Implementation Phases](#implementation-phases)
9. [Related Documentation](#related-documentation)

---

## Overview

`vitest-agent-reporter` provides exports targeting LLM coding agents and CI
systems, implemented across three phases:

1. **`AgentReporter`** (Phase 1, COMPLETE) -- a Vitest `Reporter`
   (requires Vitest >= 3.2.0) that produces structured markdown to console,
   persistent JSON to disk, and optional GFM output for GitHub Actions
   check runs. A single reporter instance handles both single-package repos
   and monorepos by grouping results via Vitest's native `TestProject` API.
2. **`AgentPlugin`** (Phase 1, COMPLETE) -- a Vitest plugin (uses
   `configureVitest` hook from Vitest 3.1+) that injects `AgentReporter`
   into the reporter chain with environment-aware behavior. More than a
   convenience layer -- it handles three-environment detection, reporter
   chain management, cache directory resolution, and coverage threshold
   extraction from Vitest config.
3. **Test suite overview generator** (Phase 2, NOT STARTED) -- generates an
   LLM-friendly summary of the test landscape on init, including a copyable
   context doc snippet and file-to-test mapping.
4. **Suggested actions & failure history** (Phase 3, NOT STARTED) --
   actionable suggestions in console output and per-test failure persistence
   across runs for regression vs flake detection.

The package complements Vitest's built-in `agent` reporter. The built-in
handles console noise suppression in-process; this package adds persistence
across runs, coverage with uncovered line ranges, monorepo-aware caching via
a manifest file, GFM output for CI, and agent tooling for test discovery.

**Key Design Principles:**

- **Reporter-native project grouping** -- every `TestModule` carries a
  `.project` reference with `.name`; the reporter groups results by project
  natively without needing mirror projects or env-var gates
- **Three-environment detection** -- `AgentPlugin` auto-detects agent, CI,
  or human environments and adapts console output accordingly. The reporter
  always writes JSON cache regardless of environment
- **Three output targets** -- console markdown, JSON to disk, and GFM for
  GitHub Actions (auto-detected via `process.env.GITHUB_ACTIONS`)
- **Zod-first data structures** -- all report and manifest types are defined
  as Zod 4 schemas with `z.infer<>` for TypeScript types, plus `z.codec()`
  for JSON string encode/decode
- **Duck-type istanbul** -- structural interface avoids hard peer dependency;
  works with both `v8` and `istanbul` coverage providers
- **Manifest-first read pattern** -- agents read manifest once to find
  failing projects, then open only those cache files; never scan directory
- **Progressive enhancement** -- Phase 1 is a standalone reporter; Phases
  2-3 add agent tooling that builds on the same cache infrastructure

**When to reference this document:**

- When adding new output formats or reporter capabilities
- When modifying the Vitest reporter integration
- When working on the plugin convenience layer
- When adding agent tooling (overview, context doc, suggestions)
- When debugging output formatting or persistence issues

---

## Current State

### System Components

#### Component 1: AgentReporter

**Location:** `src/reporter.ts`

**Status:** COMPLETE (Phase 1)

**Purpose:** Vitest Reporter that produces three outputs: structured markdown
to console, persistent JSON to disk per project, and optional GFM for GitHub
Actions.

**Responsibilities:**

- Store `Vitest` instance in `onInit` for project enumeration
- Stash coverage data in `onCoverage` (fires before `onTestRunEnd`)
- In `onTestRunEnd`, group `TestModule[]` by `testModule.project.name`
- For each project: build report via `buildAgentReport()`, write per-project
  JSON cache file using `AgentReportCodec.encode()`
- Write/update cache manifest (`manifest.json`) using `CacheManifestCodec`
- Format and emit console markdown (respects `consoleOutput` mode)
- When `GITHUB_ACTIONS` detected or `githubActions` option enabled, append
  GFM summary to `GITHUB_STEP_SUMMARY` file
- Process coverage via `processCoverage()` duck-typing function
- Compress uncovered line arrays to range strings via `compressLines()`

**Key interfaces/APIs:**

```typescript
// Zod schema (source of truth) -- see AgentReporterOptionsSchema in schemas.ts
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

- Depends on: Vitest Reporter v2 API (>= 3.2.0)
- Used by: `AgentPlugin`, direct consumer configuration

#### Component 2: AgentPlugin

**Location:** `src/plugin.ts`

**Status:** COMPLETE (Phase 1)

**Purpose:** Vitest plugin that injects `AgentReporter` into the reporter
chain via the `configureVitest` hook. Manages environment detection,
reporter chain manipulation, cache directory resolution, and coverage
threshold extraction.

**Responsibilities:**

- Detect runtime environment via `detectEnvironment()`: agent, CI, or human
- In agent mode: strip built-in console reporters from the chain, set
  `consoleOutput` to `"failures"` for structured markdown
- In CI mode: keep existing reporters, enable GFM output, silence console
- In human mode: keep existing reporters, silence console (cache-only)
- Resolve cache directory with priority: explicit option > `outputFile`
  config > `vite.cacheDir + "/vitest-agent-reporter"`
- Extract coverage threshold from Vitest's resolved coverage config
  (minimum of configured metrics)
- Push `AgentReporter` instance into `vitest.config.reporters`

**Key interfaces/APIs:**

```typescript
// Zod schema (source of truth) -- see AgentPluginOptionsSchema in schemas.ts
interface AgentPluginOptions {
  mode?: "auto" | "agent" | "silent";             // default: "auto"
  reporter?: Omit<AgentReporterOptions, "consoleOutput" | "githubActions">;
}
```

**Environment detection checks (in order):**

- `AI_AGENT` -- emerging cross-tool standard (any truthy value)
- `AUGMENT_AGENT=1` -- Augment Code
- `CLAUDECODE=1` -- Claude Code (Anthropic)
- `CLINE_ACTIVE=true` -- Cline (VS Code extension)
- `CODEX_SANDBOX` -- OpenAI Codex CLI (any value)
- `CURSOR_TRACE_ID` -- Cursor IDE agent (any value)
- `CURSOR_AGENT=1` -- Cursor CLI agent
- `GEMINI_CLI=1` -- Gemini CLI (Google)
- `AGENT` -- Goose, Amp, generic convention
- `GITHUB_ACTIONS` / `CI=true` -- CI detection
- Falls back to `"human"` if nothing matches

**Console reporters stripped in agent mode:**

`default`, `verbose`, `tree`, `dot`, `tap`, `tap-flat`, `hanging-process`,
`agent`. Custom reporters (class instances, file paths) and non-console
built-in reporters (`json`, `junit`, `html`, `blob`, `github-actions`) are
preserved.

**Dependencies:**

- Depends on: Vitest Plugin API (`configureVitest`, Vitest 3.1+),
  `AgentReporter`, `detectEnvironment`, `stripConsoleReporters`
- Used by: Consumer `vitest.config.ts`

#### Component 3: Zod Schemas and Codecs

**Location:** `src/schemas.ts`

**Status:** COMPLETE (Phase 1)

**Purpose:** Single source of truth for all data structures. Defines Zod 4
schemas, inferred TypeScript types (in `types.ts`), and JSON codecs for
report and manifest file serialization.

**Key exports:**

- `AgentReportSchema` / `AgentReportCodec` -- per-project test report
- `CacheManifestSchema` / `CacheManifestCodec` -- project index
- `AgentReporterOptionsSchema` -- reporter configuration
- `AgentPluginOptionsSchema` -- plugin configuration (omits managed fields)
- Istanbul duck-type interfaces (`IstanbulCoverageMap`, `IstanbulFileCoverage`,
  `IstanbulSummary`)
- All schema enums: `TestStateSchema`, `TestRunReasonSchema`,
  `TestClassificationSchema`, `ConsoleOutputModeSchema`, `PluginModeSchema`,
  `PackageManagerSchema`

#### Component 4: Coverage Processor

**Location:** `src/coverage.ts`

**Status:** COMPLETE (Phase 1)

**Purpose:** Duck-types an istanbul CoverageMap and produces a structured
`CoverageReport`. Isolated from the reporter for testability.

**Key functions:**

- `isIstanbulCoverageMap()` -- runtime duck-type guard
- `processCoverage()` -- transforms CoverageMap to `CoverageReport`,
  filtering bare-zero files and sorting by worst coverage

#### Component 5: Console Markdown Formatter

**Location:** `src/formatters/console.ts`

**Status:** COMPLETE (Phase 1)

**Purpose:** Pure function that formats an `AgentReport` as compact,
actionable console markdown for LLM agent consumption.

**Output format:**

- Compact header: `## [check/cross] Vitest -- N failed, N passed (Nms)`
- Failed test details with error messages and diffs
- Coverage gaps (only low-coverage files, no totals table)
- Next steps section with re-run commands and cache file pointer
- Relative file paths throughout (not absolute)
- ANSI color codes that no-op when `NO_COLOR` is set

#### Component 6: JSON Report Builder

**Location:** `src/formatters/json.ts`

**Status:** COMPLETE (Phase 1)

**Purpose:** Pure data transformation function that converts Vitest
`TestModule`/`TestCase` objects into an `AgentReport`. No I/O.

**Implementation note:** Uses duck-typed Vitest interfaces (`VitestTestModule`,
`VitestTestCase`, etc.) rather than importing Vitest types directly, keeping
the formatter independent of the Vitest runtime.

#### Component 7: GFM Formatter

**Location:** `src/formatters/gfm.ts`

**Status:** COMPLETE (Phase 1)

**Purpose:** Formats `AgentReport` array as GitHub-Flavored Markdown for
`GITHUB_STEP_SUMMARY`. Handles both single-project and multi-project output.

**GFM features:**

- Summary table with pass/fail counts
- Collapsible `<details>` blocks for per-project results (monorepo)
- Coverage metrics table
- Diff-fenced code blocks for expected/received comparisons
- GitHub Alert callouts (`[!WARNING]`) for coverage threshold violations

#### Component 8: Package Manager Detection

**Location:** `src/detect-pm.ts`

**Status:** COMPLETE (Phase 1)

**Purpose:** Detects the project's package manager for generating correct
run commands. Uses a `FileSystemAdapter` interface for testability.

**Detection order:**

1. `packageManager` field in `package.json` (e.g., `"pnpm@10.32.1"`)
2. Lockfile presence: `pnpm-lock.yaml` > `package-lock.json` > `yarn.lock`
   > `bun.lock`
3. Falls back to `null` (caller defaults to `npx`)

#### Component 9: Test Suite Overview Generator (Phase 2)

**Location:** `src/overview.ts` (NOT YET CREATED)

**Status:** NOT STARTED

**Purpose:** Generates an LLM-friendly summary of the test landscape on
`onInit`, providing project discovery, file-to-test mapping, and a
copyable context doc snippet.

#### Component 10: Suggested Actions & Failure History (Phase 3)

**Location:** `src/suggestions.ts`, `src/history.ts` (NOT YET CREATED)

**Status:** NOT STARTED

**Purpose:** Actionable suggestions in console output and per-test failure
persistence across runs.

### Architecture Diagram

```text
                        vitest run
                            |
                            v
               ┌─────────────────────────────┐
               │  AgentPlugin (optional)      │
               │  configureVitest hook        │
               │                              │
               │  1. detectEnvironment()      │
               │     agent / ci / human       │
               │  2. Strip console reporters  │
               │     (agent mode only)        │
               │  3. Resolve cacheDir         │
               │  4. Extract coverage thresh  │
               │  5. Push AgentReporter       │
               └──────────┬──────────────────┘
                          |
                          v
     ┌────────────────────────────────────────────┐
     │              AgentReporter                 │
     │                                            │
     │  onInit(vitest)                            │
     │    ├── store vitest instance               │
     │    └── [Phase 2: generate overview]        │
     │                                            │
     │  onCoverage(coverage)                      │
     │    └── stash istanbul CoverageMap          │
     │                                            │
     │  onTestRunEnd(modules, errors, reason)     │
     │    ├── group modules by project.name       │
     │    ├── processCoverage() duck-typing       │
     │    ├── buildAgentReport() per project      │
     │    ├── AgentReportCodec.encode() → JSON    │
     │    ├── CacheManifestCodec.encode()         │
     │    ├── formatConsoleMarkdown() → stdout     │
     │    └── formatGfm() → GITHUB_STEP_SUMMARY   │
     └────────────────────────────────────────────┘
               |              |              |
               v              v              v
          ┌─────────┐  ┌──────────────┐  ┌──────────┐
          │ stdout   │  │  cacheDir/   │  │ GITHUB_  │
          │ (md)     │  │  reports/    │  │ STEP_    │
          └─────────┘  │  manifest    │  │ SUMMARY  │
                       └──────────────┘  └──────────┘
```

### Current Limitations

- **No streaming** -- all output written post-run in `onTestRunEnd`, not
  streamed during execution
- **Istanbul duck-typing** -- coverage integration relies on structural
  typing of istanbul's `CoverageMap`; unconventional providers may not work
- **Coverage not per-project** -- coverage data is shared across all
  projects (same CoverageMap attached to each project's report)

---

## Rationale

### Architectural Decisions

#### Decision 1: Dual Output Strategy (Markdown + JSON)

**Context:** LLM agents need both human-readable context (for reasoning)
and machine-parseable data (for programmatic analysis of failures).

**Options considered:**

1. **Dual output (Chosen):**
   - Pros: Markdown is natural for LLM reasoning; JSON enables
     programmatic access, persistence across runs, manifest-first reading
   - Cons: Two output paths to maintain
   - Why chosen: Each format serves a distinct purpose the other can't

2. **JSON only:**
   - Pros: Single format, simpler
   - Cons: LLMs reason better with natural language
   - Why rejected: Console output is the primary feedback loop for agents

3. **Markdown only:**
   - Pros: Single format, great readability
   - Cons: No persistence across runs
   - Why rejected: Manifest-first pattern requires structured data on disk

#### Decision 2: Reporter-Native Project Grouping

**Context:** Monorepo users need per-project test output. Original design
proposed creating `:ai` mirror projects via a Vite plugin.

**Original approach (rejected):** Vite plugin with `:ai` mirror projects.
Duplicated every project definition, required `VITEST_AI=1` env-var gate,
and was unnecessary since the Reporter API provides project info natively.

**Chosen approach:** Reporter-native grouping via `TestProject` API. Zero
configuration; works in monorepos and single repos; no mirror projects;
single reporter instance. Uses `testModule.project.name` for grouping.

#### Decision 3: Three-Environment Detection

**Context:** The reporter needs to behave differently depending on who is
running tests: an LLM agent, a CI system, or a human developer.

**Original approach (rejected):** Binary on/off via env var (`VITEST_AI=1`).

**Chosen approach:** Three-tier environment detection in `AgentPlugin`:

- **Agent** (9+ env vars checked): suppress console reporters, show
  structured markdown, write JSON cache
- **CI** (GITHUB_ACTIONS, CI): keep existing reporters, add GFM to
  GITHUB_STEP_SUMMARY, write JSON cache
- **Human**: keep existing reporters, reporter runs silently (JSON
  cache only)

The reporter always writes JSON cache regardless of environment. This
ensures agents can read cached results even if tests were run by a human.

#### Decision 4: Duck-typed Istanbul Interface

**Context:** Coverage integration needs to work with both
`@vitest/coverage-v8` and `@vitest/coverage-istanbul`.

**Why chosen:** The `onCoverage` hook receives an istanbul `CoverageMap`
directly. Both providers normalize to the same interface. We duck-type at
runtime via `isIstanbulCoverageMap()` to avoid forcing a specific coverage
provider peer dependency. Istanbul interfaces are kept as TypeScript
interfaces in `schemas.ts`, not Zod schemas.

#### Decision 5: Zod-First Data Structures

**Context:** Report and manifest data needs to be both type-safe in
TypeScript and serializable to/from JSON files on disk.

**Chosen approach:** All data structures defined as Zod 4 schemas in
`schemas.ts`. TypeScript types derived via `z.infer<>` in `types.ts`.
JSON encode/decode handled by `z.codec()` instances (`AgentReportCodec`,
`CacheManifestCodec`). Schemas are exported from the public API so
consumers can validate report files.

**Why chosen:** Single source of truth for both runtime validation and
static types. Codecs handle the JSON string boundary cleanly. Consumers
get schema exports for programmatic validation of cache files.

#### Decision 6: GFM Output for GitHub Actions

**Context:** Cloud-based agents and humans reviewing CI results need
structured test output in check run summaries.

**Chosen approach:** Auto-detect `process.env.GITHUB_ACTIONS`, append GFM
to `process.env.GITHUB_STEP_SUMMARY`. Allow override via options. Same
data structures serve both local and CI output -- conditional formatting
is simpler than a separate reporter class.

#### Decision 7: Cache Directory Resolution

**Context:** The cache directory needs to work in multiple contexts:
standalone reporter, plugin with Vite, and consumer-specified paths.

**Chosen approach:** Three-priority resolution in `AgentPlugin`:

1. Explicit `reporter.cacheDir` option (user override)
2. `outputFile['vitest-agent-reporter']` from Vitest config (native pattern)
3. `vite.cacheDir + "/vitest-agent-reporter"` (default, typically
   `node_modules/.vite/.../vitest-agent-reporter/`)

When using `AgentReporter` standalone (without the plugin), the default is
`.vitest-agent-reporter` in the project root.

#### Decision 8: Compact Console Output

**Context:** LLM agents have limited context windows. Console output
should maximize signal-to-noise ratio.

**Chosen approach:**

- Single-line header with pass/fail counts and duration
- No summary tables (counts are in the header)
- No coverage totals table (only files below threshold with uncovered lines)
- "Next steps" section with specific re-run commands
- Relative file paths throughout
- All-pass output collapses to one line with cache file pointer

### Design Patterns Used

#### Pattern: Manifest-First Read

- **Where used:** Cache directory output
- **Why used:** Agents read one file to discover all project states, then
  selectively read only failing project caches
- **Implementation:** `manifest.json` maps project names to cache file
  paths, last run timestamps, and pass/fail status

#### Pattern: Range Compression

- **Where used:** Coverage output (both console and JSON)
- **Why used:** Compact representation of uncovered lines for LLM
  consumption
- **Implementation:** `compressLines()` converts `[1,2,3,5,10,11,12]` to
  `"1-3,5,10-12"`

#### Pattern: Project-Keyed Accumulation

- **Where used:** `AgentReporter.onTestRunEnd` result collection
- **Why used:** Group test results by `TestProject.name` during the run,
  then emit per-project outputs
- **Implementation:** `Map<string, VitestTestModule[]>` keyed by
  `testModule.project.name`

#### Pattern: Duck-Typed External APIs

- **Where used:** Istanbul CoverageMap, Vitest TestModule/TestCase
- **Why used:** Avoid hard dependencies on external types that may change
- **Implementation:** Structural interfaces checked at runtime via type
  guards; formatters use duck-typed Vitest interfaces

#### Pattern: Codec Boundary

- **Where used:** JSON file I/O for reports and manifests
- **Why used:** Clean separation between in-memory types and on-disk format
- **Implementation:** `z.codec()` instances that parse JSON strings to
  validated objects and serialize objects to formatted JSON strings

### Constraints and Trade-offs

#### Constraint: Vitest >= 3.2.0

- **Description:** Requires stable Reporter v2 API with `TestProject`
- **Impact:** Limits adoption to Vitest 3.2+
- **Mitigation:** Vitest 3.2 is current stable; peer dep is explicit

#### Trade-off: `onCoverage` Ordering

- **What we gained:** Clean integration with coverage data
- **What we sacrificed:** Must stash coverage as instance state (fires
  before `onTestRunEnd`)
- **Why it's worth it:** Simple pattern; coverage and results merge in
  one output pass

#### Trade-off: Coverage Not Per-Project

- **What we gained:** Simpler implementation; coverage data from Vitest is
  a single CoverageMap
- **What we sacrificed:** Each project report gets the same coverage data;
  no per-project coverage filtering
- **Why it's acceptable:** Most consumers use coverage at the repo level;
  per-project splitting would require path-based heuristics

---

## System Architecture

### File Structure

```text
src/
  index.ts          -- public re-exports + @packageDocumentation
  schemas.ts        -- Zod 4 schemas, codecs, istanbul duck-type interfaces
  types.ts          -- z.infer<> type aliases + istanbul re-exports
  utils.ts          -- compressLines, safeFilename, ansi/stripAnsi,
                       isGitHubActions, detectEnvironment,
                       stripConsoleReporters, CONSOLE_REPORTERS
  detect-pm.ts      -- package manager detection (FileSystemAdapter,
                       detectPackageManager, getRunCommand)
  coverage.ts       -- isIstanbulCoverageMap, processCoverage
  reporter.ts       -- AgentReporter class (onInit, onCoverage, onTestRunEnd)
  plugin.ts         -- AgentPlugin function (configureVitest hook),
                       resolveOutputDir, extractCoverageThreshold
  formatters/
    json.ts         -- buildAgentReport pure function + duck-typed Vitest
                       interfaces (VitestTestModule, VitestTestCase, etc.)
    console.ts      -- formatConsoleMarkdown, relativePath, getWorstMetric
    gfm.ts          -- formatGfm for GitHub Actions GITHUB_STEP_SUMMARY
```

### Test Files

```text
src/
  utils.test.ts          -- compressLines, safeFilename, ansi, stripAnsi,
                            isGitHubActions, detectEnvironment,
                            stripConsoleReporters
  schemas.test.ts        -- Zod schema validation, codec encode/decode
  coverage.test.ts       -- processCoverage with mock istanbul CoverageMap
  detect-pm.test.ts      -- detectPackageManager, getRunCommand with mock FS
  reporter.test.ts       -- AgentReporter lifecycle integration tests
  plugin.test.ts         -- AgentPlugin environment detection + config mutation
  formatters/
    json.test.ts         -- buildAgentReport with mock Vitest objects
    console.test.ts      -- formatConsoleMarkdown output formatting
    gfm.test.ts          -- formatGfm output formatting
```

### Cache Directory Layout

Cache outputs are organized under a configurable root directory. When using
`AgentPlugin`, this defaults to Vite's `cacheDir` + `"/vitest-agent-reporter"`
(typically `node_modules/.vite/.../vitest-agent-reporter/`). When using
`AgentReporter` standalone, it defaults to `.vitest-agent-reporter/`.

```text
{cacheDir}/
  manifest.json                         -- project index (CacheManifest)
  reports/                              -- per-project test result JSON
    {safe-project-name}.json            -- AgentReport encoded via codec
    default.json                        -- single-repo fallback name
```

**Future subdirectories (Phase 2-3):**

```text
{cacheDir}/
  overview/                             -- Phase 2: discovery data
    test-overview.json
    context-snippet.md
  history/                              -- Phase 3: failure tracking
    {safe-project-name}.history.json
```

**`safeFilename()` examples:**

- `"@savvy-web/my-lib:unit"` -> `"@savvy-web__my-lib__unit"`
- `"core"` -> `"core"`
- `""` (root project) -> `"default"`

**Package manager detection:**

The overview generator (Phase 2) and suggested actions (Phase 3) need to
output correct run commands. Detection logic in `detect-pm.ts`:

1. Check `packageManager` field in root `package.json`
2. Fall back to lockfile detection
3. Default to `npx` if nothing detected

### Data Structures

All types are defined as Zod 4 schemas in `src/schemas.ts` with TypeScript
types inferred via `z.infer<>` in `src/types.ts`.

#### JSON Report (`AgentReport`)

```typescript
// From AgentReportSchema in schemas.ts
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

#### Coverage Report

```typescript
interface CoverageReport {
  totals: CoverageTotals;
  threshold: number;
  lowCoverage: FileCoverageReport[];
  lowCoverageFiles: string[];
}

interface CoverageTotals {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

interface FileCoverageReport {
  file: string;
  summary: CoverageTotals;
  uncoveredLines: string;                         // e.g. "42-50,99,120-135"
}
```

#### Cache Manifest

```typescript
interface CacheManifest {
  updatedAt: string;
  cacheDir: string;
  projects: CacheManifestEntry[];
}

interface CacheManifestEntry {
  project: string;                                // project name
  reportFile: string;                             // relative: reports/{name}.json
  historyFile?: string;                           // Phase 3
  lastRun: string | null;
  lastResult: "passed" | "failed" | "interrupted" | null;
}
```

### Console Output Format

Printed to `process.stdout`. Uses `ansi()` helper that no-ops when
`NO_COLOR` is set.

Three modes controlled by `consoleOutput` option:

- `"failures"` (default) -- compact header + failed tests with diffs +
  coverage gaps + next steps
- `"full"` -- same format, includes passing test details
- `"silent"` -- no console output, JSON only

**Example output (failures):**

````markdown
## X Vitest -- 2 failed, 8 passed (340ms)

### X `src/utils.test.ts`

- X **compressLines > handles empty array**
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

- Re-run: `vitest run src/utils.test.ts`
- Full report: `node_modules/.vite/.../vitest-agent-reporter/reports/default.json`
````

**Example output (all passing):**

```markdown
## [checkmark] Vitest -- 10 passed (120ms)

[checkmark] All tests passed

-> Cache: `node_modules/.vite/.../vitest-agent-reporter/reports/default.json`
```

### Error Handling Strategy

- **File write failures:** Log warning to stderr, don't crash the test run
- **Coverage duck-type mismatch:** `processCoverage()` returns `undefined`,
  coverage section silently skipped
- **Missing `GITHUB_STEP_SUMMARY`:** Skip GFM output (no warning)
- **Cache directory creation:** Uses `mkdir({ recursive: true })`, catches
  errors silently

---

## Data Flow

### Flow 1: AgentReporter Lifecycle

```text
onInit(vitest)
  ├── store vitest instance as this._vitest
  └── [Phase 2: generate overview]

onCoverage(coverage)
  └── stash as this.coverage

onTestRunEnd(testModules, unhandledErrors, reason)
  │
  ├── mkdir reports/ (recursive)
  │
  ├── Group testModules by testModule.project.name
  │     └── Map<string, VitestTestModule[]>
  │
  ├── processCoverage(this.coverage, options)
  │     └── Returns CoverageReport | undefined
  │
  ├── For each project group:
  │     ├── buildAgentReport(modules, errors, reason, options, name)
  │     │     └── Pure function: tallies, extracts errors, builds report
  │     ├── Attach coverageReport if present
  │     ├── AgentReportCodec.encode(report) → JSON string
  │     └── writeFile(reports/{safeFilename}.json)
  │
  ├── Build CacheManifest from entries
  │     └── CacheManifestCodec.encode(manifest) → JSON string
  │           └── writeFile(manifest.json)
  │
  ├── Console output (if not "silent")
  │     └── formatConsoleMarkdown(report, options) → stdout
  │
  └── GFM output (if GitHub Actions detected)
        └── formatGfm(reports) → appendFile(GITHUB_STEP_SUMMARY)
```

### Flow 2: AgentPlugin (configureVitest)

```text
configureVitest({ vitest })
  │
  ├── detectEnvironment() → "agent" | "ci" | "human"
  │
  ├── Switch on environment:
  │     agent  → consoleOutput="failures", githubActions=false,
  │              stripConsoleReporters(vitest.config.reporters)
  │     ci     → consoleOutput="silent",   githubActions=true
  │     human  → consoleOutput="silent",   githubActions=false
  │
  ├── Resolve cacheDir:
  │     option.cacheDir ?? resolveOutputDir(outputFile) ?? vite.cacheDir/...
  │
  ├── Extract coverage threshold:
  │     option.coverageThreshold ?? extractCoverageThreshold(coverage.thresholds)
  │
  └── vitest.config.reporters.push(new AgentReporter({...}))
```

---

## Integration Points

### Integration 1: Vitest Reporter v2 API

**Hooks used:**

- `onInit(vitest: Vitest)` -- store instance for project enumeration
- `onCoverage(coverage: unknown)` -- receives istanbul CoverageMap
- `onTestRunEnd(testModules, unhandledErrors, reason)` -- final results

**Key types from Vitest (duck-typed in `formatters/json.ts`):**

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
- Mutate `vitest.config.reporters` to inject `AgentReporter`
- Access `vitest.vite.config.cacheDir` for cache directory resolution
- Access `vitest.config.coverage.thresholds` for coverage threshold

### Integration 3: GitHub Actions

**Detection:** `process.env.GITHUB_ACTIONS === "true"` or `=== "1"`

**Output target:** `process.env.GITHUB_STEP_SUMMARY` -- a file path.
GFM content is appended (not overwritten) to support multiple steps.

### Integration 4: Consumer LLM Agents

**Read pattern:** Manifest-first (monorepo) or single-file (single repo)

1. Read `{cacheDir}/manifest.json` for project states
2. Filter entries where `lastResult === "failed"`
3. Read only those `reports/{name}.json` files
4. Key fields: `failed[].tests[].errors[].diff`,
   `coverage.lowCoverage[].uncoveredLines`
5. Fix, re-run using commands from console "Next steps" section

---

## Testing Strategy

### Unit Tests

**Location:** `src/**/*.test.ts`

**Implemented tests (Phase 1):**

- `utils.test.ts` -- `compressLines()` edge cases, `safeFilename()`
  sanitization, `ansi()`/`stripAnsi()`, `isGitHubActions()`,
  `detectEnvironment()` (all 9+ agent env vars, CI, human fallback),
  `stripConsoleReporters()` (string, tuple, class instance filtering)
- `schemas.test.ts` -- Zod schema validation for all report types,
  codec encode/decode round-trips, edge cases (empty arrays, optionals)
- `coverage.test.ts` -- `processCoverage()` with mock istanbul
  CoverageMap, bare-zero filtering, threshold logic, sort order
- `detect-pm.test.ts` -- `detectPackageManager()` with mock FS adapter,
  `getRunCommand()` for all package managers
- `formatters/json.test.ts` -- `buildAgentReport()` with mock Vitest
  objects, tallying, error extraction, omitPassingTests behavior
- `formatters/console.test.ts` -- `formatConsoleMarkdown()` output
  formatting, all three modes, coverage gaps, next steps
- `formatters/gfm.test.ts` -- `formatGfm()` single and multi-project
  output, coverage tables, details blocks
- `reporter.test.ts` -- `AgentReporter` lifecycle integration tests
- `plugin.test.ts` -- `AgentPlugin` environment detection, reporter
  injection, cache directory resolution, coverage threshold extraction

### Integration Tests

**What to test:**

- End-to-end reporter behavior with actual Vitest test runs
- Per-project cache file generation in multi-project setup
- Manifest creation and correctness
- GFM output written to GITHUB_STEP_SUMMARY mock file
- Reporter injection via `AgentPlugin`

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
- Public API exports via `src/index.ts` (reporter, plugin, schemas, types)
- Comprehensive unit and integration tests for all modules

**Source files:**

- `src/reporter.ts`, `src/plugin.ts`, `src/schemas.ts`, `src/types.ts`,
  `src/utils.ts`, `src/coverage.ts`, `src/detect-pm.ts`
- `src/formatters/console.ts`, `src/formatters/json.ts`,
  `src/formatters/gfm.ts`
- `src/index.ts`

### Phase 2: Test Suite Overview and Context Template -- NOT STARTED

**Goal:** Agent-oriented discovery tooling that helps LLMs understand the
test landscape without manual exploration.

**Deliverables:**

- Overview generator in `onInit` hook
- `test-overview.json` with structured project data
- `context-snippet.md` with copyable markdown block
- File-to-test mapping from project globs
- Context snippet updated with latest results after each run
- Unit tests for overview generation

**Source files:**

- `src/overview.ts`

**Depends on:** Phase 1 (cache directory structure, reporter lifecycle)

### Phase 3: Suggested Actions and Failure History -- NOT STARTED

**Goal:** Actionable intelligence in reporter output -- what to do next,
and whether failures are new, persistent, or flaky.

**Deliverables:**

- Suggested actions engine (re-run commands, coverage gaps, flaky flags)
- Failure history tracker with sliding window
- Test classification (`new-failure`, `persistent`, `flaky`, `recovered`)
- History data surfaced in both console output and JSON reports
- History file management (read, update, prune)
- Unit tests for suggestion generation and history classification

**Source files:**

- `src/suggestions.ts`, `src/history.ts`

**Depends on:** Phase 1 (report data structures), Phase 2 (project
discovery for scoped re-run commands)

---

## Related Documentation

**Internal Design Docs:**

- None yet (first design document)

**Package Documentation:**

- `README.md` -- Package overview
- [GitHub Issue #1](https://github.com/spencerbeggs/vitest-agent-reporter/issues/1)
  -- Original specification

**External Resources:**

- [Vitest Reporter API](https://vitest.dev/api/advanced/reporters.html)
- [Vitest Plugin API](https://vitest.dev/api/advanced/plugin.html)
- [Vitest Metadata API](https://vitest.dev/api/advanced/metadata.html)
- [GitHub Actions Job Summaries](https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/workflow-commands-for-github-actions#adding-a-job-summary)

---

**Document Status:** Current -- reflects Phase 1 implementation as built.
Phases 2-3 remain as planned but not yet started. Updated from pre-
implementation draft to match actual code, including: three-environment
detection, Zod-first data structures, cache directory resolution priority,
compact console output format, and AgentPlugin PascalCase naming.
