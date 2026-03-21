---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-03-20
last-synced: 2026-03-20
completeness: 90
related: []
dependencies: []
---

# Vitest LLM Reporter - Architecture

A Vitest reporter that outputs structured markdown to console and persistent
JSON to disk for LLM coding agents, with optional GFM output for GitHub
Actions check runs, a CLI bin for on-demand test landscape queries, and
Effect-based service architecture for testability.

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

1. **`AgentReporter`** (Phase 1-2, COMPLETE) -- a Vitest `Reporter`
   (requires Vitest >= 3.2.0) that produces structured markdown to console,
   persistent JSON to disk, and optional GFM output for GitHub Actions
   check runs. Uses Effect services (CacheWriter, CoverageAnalyzer) for
   file I/O and coverage processing. A single reporter instance handles
   both single-package repos and monorepos by grouping results via Vitest's
   native `TestProject` API.
2. **`AgentPlugin`** (Phase 1-2, COMPLETE) -- a Vitest plugin (uses
   `configureVitest` hook from Vitest 3.1+) that injects `AgentReporter`
   into the reporter chain with environment-aware behavior. Supports
   `consoleStrategy` option (`"own" | "complement"`) for hybrid mode with
   Vitest's built-in agent reporter. Uses AgentDetection Effect service
   backed by `std-env` for environment detection.
3. **CLI bin** (Phase 2, COMPLETE) -- `vitest-agent-reporter` CLI via
   `@effect/cli` with `status`, `overview`, and `coverage` subcommands.
   Reads cached test data on-demand for LLM-oriented test landscape
   queries. Uses ProjectDiscovery and CacheReader Effect services.
4. **Suggested actions & failure history** (Phase 3, NOT STARTED) --
   actionable suggestions in console output and per-test failure persistence
   across runs for regression vs flake detection.

The package complements Vitest's built-in `agent` reporter. The built-in
handles console noise suppression in-process; this package adds persistence
across runs, coverage with uncovered line ranges, monorepo-aware caching via
a manifest file, GFM output for CI, scoped coverage for partial test runs,
and agent tooling for test discovery via the CLI.

**Key Design Principles:**

- **Effect service architecture** -- all I/O and shared logic encapsulated
  in Effect services (CacheWriter, CacheReader, CoverageAnalyzer,
  ProjectDiscovery, AgentDetection) with live and test layer
  implementations for dependency injection
- **Reporter-native project grouping** -- every `TestModule` carries a
  `.project` reference with `.name`; the reporter groups results by project
  natively without needing mirror projects or env-var gates
- **Three-environment detection** -- `AgentPlugin` auto-detects agent, CI,
  or human environments via `std-env` and adapts console output accordingly.
  The reporter always writes JSON cache regardless of environment
- **Hybrid console strategy** -- `consoleStrategy` option lets the plugin
  either complement Vitest's built-in agent reporter (default) or take over
  console output entirely
- **Three output targets** -- console markdown, JSON to disk, and GFM for
  GitHub Actions (auto-detected via `process.env.GITHUB_ACTIONS`)
- **Effect Schema data structures** -- all report and manifest types are
  defined as Effect Schema definitions with `typeof Schema.Type` for
  TypeScript types, plus `Schema.decodeUnknown`/`Schema.encodeUnknown`
  for JSON encode/decode
- **Duck-type istanbul** -- structural interface avoids hard peer dependency;
  works with both `v8` and `istanbul` coverage providers
- **Manifest-first read pattern** -- agents read manifest once to find
  failing projects, then open only those cache files; never scan directory
- **CLI-first overview** -- overview/status generated on-demand by CLI, not
  on every test run. Keeps the reporter lean
- **Progressive enhancement** -- Phase 1 is a standalone reporter; Phase 2
  adds Effect services, CLI tooling, and hybrid mode; Phase 3 adds failure
  history

**When to reference this document:**

- When adding new output formats or reporter capabilities
- When modifying the Vitest reporter integration
- When working on the plugin convenience layer
- When adding agent tooling (overview, context doc, suggestions)
- When debugging output formatting or persistence issues
- When working with Effect services, layers, or error types
- When modifying the CLI bin

---

## Current State

### System Components

#### Component 1: AgentReporter

**Location:** `src/reporter.ts`

**Status:** COMPLETE (Phase 1-2)

**Purpose:** Vitest Reporter that produces three outputs: structured markdown
to console, persistent JSON to disk per project, and optional GFM for GitHub
Actions. Uses Effect services for file I/O and coverage processing.

**Responsibilities:**

- Store `Vitest` instance in `onInit` for project enumeration
- Stash coverage data in `onCoverage` (fires before `onTestRunEnd`)
- In `onTestRunEnd`, group `TestModule[]` by `testModule.project.name`
- For each project: build report via `buildAgentReport()`, write per-project
  JSON cache file via CacheWriter service
- Attach `unhandledErrors` to ALL project reports (not just "default")
- Write/update cache manifest (`manifest.json`) via CacheWriter service
- Format and emit console markdown (respects `consoleOutput` mode)
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
  CoverageAnalyzer service, `@effect/platform` FileSystem
- Used by: `AgentPlugin`, direct consumer configuration

#### Component 2: AgentPlugin

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

#### Component 3: Effect Services

**Location:** `src/services/`

**Status:** COMPLETE (Phase 2)

**Purpose:** Effect `Context.Tag` definitions for all shared functionality.
Each service is a tag with a typed interface. Live implementations use
`@effect/platform` for file I/O; test implementations use mock state
containers.

**Services:**

- **AgentDetection** (`src/services/AgentDetection.ts`) -- wraps `std-env`
  for environment detection. Provides `isAgent`, `agentName`, `isCI`, and
  `environment` effects. Replaces the hand-rolled `detectEnvironment()`
  utility from Phase 1
- **CacheWriter** (`src/services/CacheWriter.ts`) -- writes reports and
  manifest to disk via `@effect/platform` FileSystem. Provides `writeReport`,
  `writeManifest`, and `ensureDir` effects
- **CacheReader** (`src/services/CacheReader.ts`) -- reads manifest and
  reports from disk. Provides `readManifest`, `readReport`, and `listReports`
  effects. Shared between reporter (manifest updates) and CLI (all
  commands). Exported from public API for programmatic cache access
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

#### Component 4: Effect Layers

**Location:** `src/layers/`

**Status:** COMPLETE (Phase 2)

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

**Test layers:**

- `AgentDetectionTest` -- accepts a fixed environment value
- `CacheWriterTest` -- accumulates writes into mutable state container
- `CacheReaderTest` -- returns canned data
- `CoverageAnalyzerTest` -- returns canned data
- `ProjectDiscoveryTest` -- returns canned data

**Merged layers:**

- `ReporterLive` (`src/layers/ReporterLive.ts`) -- CacheWriterLive +
  CoverageAnalyzerLive + NodeFileSystem. Used by AgentReporter via
  `Effect.runPromise`
- `CliLive` (`src/layers/CliLive.ts`) -- CacheReaderLive +
  ProjectDiscoveryLive + NodeFileSystem. Used by CLI via `NodeRuntime.runMain`

#### Component 5: Effect Error Types

**Location:** `src/errors/`

**Status:** COMPLETE (Phase 2)

**Purpose:** Tagged error types for Effect service failure channels.

- **CacheError** (`src/errors/CacheError.ts`) -- `Data.TaggedError` for
  file I/O failures (read, write, mkdir operations)
- **DiscoveryError** (`src/errors/DiscoveryError.ts`) -- `Data.TaggedError`
  for project discovery failures (glob, read, stat operations)

#### Component 6: Effect Schemas

**Location:** `src/schemas/`

**Status:** COMPLETE (Phase 2)

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

Istanbul duck-type interfaces remain as TypeScript interfaces, not schemas.

#### Component 7: CLI Bin

**Location:** `src/cli/`

**Status:** COMPLETE (Phase 2)

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

**Lib functions (testable pure logic):**

- `format-status.ts` -- formats status data as markdown
- `format-overview.ts` -- formats overview data as markdown
- `format-coverage.ts` -- formats coverage data as markdown
- `resolve-cache-dir.ts` -- resolves cache directory from common locations

**Dependencies:**

- Depends on: `@effect/cli` for command framework, CacheReader service,
  ProjectDiscovery service, `@effect/platform-node` for NodeRuntime
- Used by: `bin/vitest-agent-reporter.js`

#### Component 8: Console Markdown Formatter

**Location:** `src/utils/format-console.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2)

**Purpose:** Pure function that formats an `AgentReport` as compact,
actionable console markdown for LLM agent consumption.

**Output format:**

- Compact header: `## [check/cross] Vitest -- N failed, N passed (Nms)`
- Failed test details with error messages and diffs
- Coverage gaps (only low-coverage files, no totals table)
- Next steps section with re-run commands and cache file pointer
- Relative file paths throughout (not absolute)
- ANSI color codes that no-op when `NO_COLOR` is set

#### Component 9: JSON Report Builder

**Location:** `src/utils/build-report.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2)

**Purpose:** Pure data transformation function that converts Vitest
`TestModule`/`TestCase` objects into an `AgentReport`. No I/O.

**Implementation note:** Uses duck-typed Vitest interfaces (`VitestTestModule`,
`VitestTestCase`, etc.) rather than importing Vitest types directly, keeping
the formatter independent of the Vitest runtime.

#### Component 10: GFM Formatter

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

#### Component 11: Package Manager Detection

**Location:** `src/utils/detect-pm.ts`

**Status:** COMPLETE (Phase 1, relocated Phase 2)

**Purpose:** Detects the project's package manager for generating correct
run commands. Uses a `FileSystemAdapter` interface for testability.

**Detection order:**

1. `packageManager` field in `package.json` (e.g., `"pnpm@10.32.1"`)
2. Lockfile presence: `pnpm-lock.yaml` > `package-lock.json` > `yarn.lock`
   > `bun.lock`
3. Falls back to `null` (caller defaults to `npx`)

#### Component 12: Utility Functions

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

#### Component 13: Suggested Actions & Failure History (Phase 3)

**Location:** `src/suggestions.ts`, `src/history.ts` (NOT YET CREATED)

**Status:** NOT STARTED

**Purpose:** Actionable suggestions in console output and per-test failure
persistence across runs.

### Architecture Diagram

```text
                        vitest run
                            |
                            v
               +-----------------------------+
               |  AgentPlugin (optional)     |
               |  async configureVitest hook |
               |                             |
               |  1. AgentDetection service  |
               |     (std-env) -> env        |
               |  2. Apply consoleStrategy   |
               |     complement / own        |
               |  3. Resolve cacheDir        |
               |  4. Extract coverage thresh |
               |  5. Push AgentReporter      |
               +-----------+-----------------+
                           |
                           v
     +--------------------------------------------+
     |              AgentReporter                  |
     |     (Effect.runPromise + ReporterLive)      |
     |                                             |
     |  onInit(vitest)                             |
     |    +-- store vitest instance                |
     |                                             |
     |  onCoverage(coverage)                       |
     |    +-- stash istanbul CoverageMap           |
     |                                             |
     |  onTestRunEnd(modules, errors, reason)      |
     |    +-- group modules by project.name        |
     |    +-- CoverageAnalyzer.process/Scoped()    |
     |    +-- buildAgentReport() per project        |
     |    +-- attach unhandledErrors to ALL reports |
     |    +-- CacheWriter.writeReport() per project |
     |    +-- CacheWriter.writeManifest()           |
     |    +-- formatConsoleMarkdown() -> stdout      |
     |    +-- formatGfm() -> FileSystem.append       |
     +--------------------------------------------+
               |              |              |
               v              v              v
          +---------+  +--------------+  +----------+
          | stdout  |  |  cacheDir/   |  | GITHUB_  |
          | (md)    |  |  reports/    |  | STEP_    |
          +---------+  |  manifest   |  | SUMMARY  |
                       +--------------+  +----------+
                              ^
                              |
     +--------------------------------------------+
     |           CLI Bin (on-demand)               |
     |     (NodeRuntime.runMain + CliLive)         |
     |                                             |
     |  status  -- manifest + per-project state    |
     |  overview -- test landscape + file mapping  |
     |  coverage -- gap analysis from cached data  |
     |                                             |
     |  Uses: CacheReader, ProjectDiscovery        |
     +--------------------------------------------+
```

### Current Limitations

- **No streaming** -- all output written post-run in `onTestRunEnd`, not
  streamed during execution
- **Istanbul duck-typing** -- coverage integration relies on structural
  typing of istanbul's `CoverageMap`; unconventional providers may not work
- **Convention-based source mapping** -- file-to-test mapping uses naming
  convention (strip `.test.`/`.spec.`); no import analysis yet
- **Coverage not per-project** -- coverage data is shared across all
  projects (same CoverageMap attached to each project's report), though
  scoped coverage filters to relevant files within a project

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

**Original approach (Phase 1):** Hand-rolled `detectEnvironment()` checking
9+ individual env vars (`AI_AGENT`, `CLAUDECODE`, `CURSOR_TRACE_ID`, etc.).

**Chosen approach (Phase 2):** AgentDetection Effect service backed by
`std-env`. `std-env` maintains agent detection upstream (currently covers
Claude, Cursor, Devin, Replit, Gemini, Codex, Auggie, OpenCode, Kiro,
Goose, Pi). CI detection stays custom because we need the specific
`GITHUB_ACTIONS` check for GFM behavior. Three tiers:

- **Agent**: structured markdown or complement mode, write JSON cache
- **CI** (GITHUB_ACTIONS, CI): keep existing reporters, GFM, JSON cache
- **Human**: keep existing reporters, reporter runs silently (JSON
  cache only)

The reporter always writes JSON cache regardless of environment.

#### Decision 4: Duck-typed Istanbul Interface

**Context:** Coverage integration needs to work with both
`@vitest/coverage-v8` and `@vitest/coverage-istanbul`.

**Why chosen:** The `onCoverage` hook receives an istanbul `CoverageMap`
directly. Both providers normalize to the same interface. We duck-type at
runtime via `isIstanbulCoverageMap()` to avoid forcing a specific coverage
provider peer dependency. Istanbul interfaces are kept as TypeScript
interfaces, not schemas.

#### Decision 5: Effect Schema Data Structures (Phase 2)

**Context:** Report and manifest data needs to be both type-safe in
TypeScript and serializable to/from JSON files on disk.

**Phase 1 approach:** Zod 4 schemas in `schemas.ts`, types via
`z.infer<>` in `types.ts`, codecs via `z.codec()`.

**Phase 2 approach (current):** Effect Schema definitions split across
`src/schemas/` directory. TypeScript types derived via
`typeof Schema.Type`. JSON encode/decode via `Schema.decodeUnknown` /
`Schema.encodeUnknown`. Schemas are exported from the public API so
consumers can validate report files.

**Why migrated:** Effect Schema integrates naturally with the Effect
service architecture. Eliminates the Zod dependency. Unified ecosystem
means schemas compose with Effect services without bridging.

#### Decision 6: Effect Services over Plain Functions (Phase 2)

**Context:** The reporter and CLI share functionality (cache reading,
coverage processing). Both need testable I/O without mocking Node APIs
directly.

**Chosen approach:** Five Effect services with `Context.Tag` definitions:
AgentDetection, CacheWriter, CacheReader, CoverageAnalyzer,
ProjectDiscovery. Live layers use `@effect/platform` FileSystem; test
layers swap in mock implementations.

**Why chosen:** Effect's dependency injection gives testable layers without
mocking Node APIs. `@effect/platform` provides the FileSystem abstraction.
The reporter and CLI compose different layer sets (ReporterLive vs CliLive)
from the same service definitions.

#### Decision 7: Scoped Effect.runPromise in Reporter (Phase 2)

**Context:** Vitest instantiates the reporter class -- we don't control
construction. We need to use Effect services inside class methods.

**Chosen approach:** Each lifecycle hook (`onTestRunEnd`) builds a scoped
effect and runs it with `Effect.runPromise`, providing the `ReporterLive`
layer inline. No `ManagedRuntime` needed.

**Why chosen:** The layer is lightweight (FileSystem + pure services), so
per-call construction is acceptable. Avoids `ManagedRuntime` lifecycle
concerns (no resource leak, no disposal needed). For the plugin,
`configureVitest` is async (Vitest awaits plugin hooks), so
`Effect.runPromise` is also safe there.

#### Decision 8: CLI-First Overview (Phase 2)

**Context:** Overview/status data could be generated on every test run
(in the reporter's `onInit` hook) or on-demand by a separate tool.

**Chosen approach:** The CLI generates overview/status on-demand. The
reporter writes test results and manifest; the CLI reads them plus does
its own project discovery when asked.

**Why chosen:** Keeps the reporter lean. Overview generation requires
filesystem discovery (globbing for test files, reading source files) that
would slow down every test run. On-demand generation is more appropriate
for discovery data that changes infrequently.

#### Decision 9: Hybrid Console Strategy (Phase 2)

**Context:** Vitest 4.1 added a built-in `agent` reporter. Our plugin
originally stripped all console reporters and took over output entirely.

**Chosen approach:** New `consoleStrategy` option:

- `"complement"` (default) -- layers on top of Vitest's built-in agent
  reporter. Does not strip reporters. Writes JSON cache and manifest only.
  Warns if `agent` reporter missing from chain
- `"own"` -- strips built-in console reporters, uses our formatter, writes
  our own GFM. Phase 1 behavior

**Why chosen:** Users who already have Vitest's built-in agent reporter
configured should not have it ripped out by our plugin. The complement
mode is additive. Users who need our specific output format can opt into
`"own"` mode.

#### Decision 10: GFM Output for GitHub Actions

**Context:** Cloud-based agents and humans reviewing CI results need
structured test output in check run summaries.

**Chosen approach:** Auto-detect `process.env.GITHUB_ACTIONS`, append GFM
to `process.env.GITHUB_STEP_SUMMARY`. Allow override via options. Same
data structures serve both local and CI output -- conditional formatting
is simpler than a separate reporter class. In complement mode, GFM is
left to Vitest's built-in reporter.

#### Decision 11: Cache Directory Resolution

**Context:** The cache directory needs to work in multiple contexts:
standalone reporter, plugin with Vite, CLI reading cached data, and
consumer-specified paths.

**Chosen approach:** Three-priority resolution in `AgentPlugin`:

1. Explicit `reporter.cacheDir` option (user override)
2. `outputFile['vitest-agent-reporter']` from Vitest config (native pattern)
3. `vite.cacheDir + "/vitest-agent-reporter"` (default, typically
   `node_modules/.vite/.../vitest-agent-reporter/`)

CLI cache dir resolution checks common locations: `.vitest-agent-reporter/`
in project root, then `node_modules/.vite/vitest-agent-reporter/`. Uses
the first location containing a `manifest.json`.

When using `AgentReporter` standalone (without the plugin), the default is
`.vitest-agent-reporter` in the project root.

#### Decision 12: Compact Console Output

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

- **Where used:** Cache directory output, CLI commands
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

#### Pattern: Effect Service / Layer Separation

- **Where used:** All Effect services (Phase 2)
- **Why used:** Clean separation between service interface (Context.Tag)
  and implementation (Layer). Enables swapping live I/O for test mocks
- **Implementation:** Service tags in `src/services/`, live and test
  layers in `src/layers/`, merged composition layers (`ReporterLive`,
  `CliLive`)

#### Pattern: Scoped Effect.runPromise

- **Where used:** AgentReporter lifecycle hooks, AgentPlugin configureVitest
- **Why used:** Bridge between imperative Vitest class API and Effect
  service architecture without ManagedRuntime lifecycle concerns
- **Implementation:** Each hook builds a self-contained effect, provides
  the layer inline, and runs via `Effect.runPromise`

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

#### Trade-off: Per-Call Layer Construction

- **What we gained:** No ManagedRuntime lifecycle concerns, no resource
  leaks, no disposal needed
- **What we sacrificed:** Layer constructed on each `onTestRunEnd` call
- **Why it's acceptable:** The layer is lightweight (FileSystem + pure
  services). Construction cost is negligible compared to test run duration

#### Trade-off: Convention-Based Source Mapping

- **What we gained:** Simple, predictable file-to-test mapping for scoped
  coverage
- **What we sacrificed:** Cannot detect tests that cover source files
  with non-matching names
- **Why it's acceptable:** Convention covers the vast majority of cases.
  Import analysis could be a Phase 3 enhancement

---

## System Architecture

### File Structure

```text
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
    lib/
      format-status.ts  -- testable formatting logic
      format-overview.ts
      format-coverage.ts
      resolve-cache-dir.ts

  services/
    AgentDetection.ts   -- Context.Tag: std-env wrapper
    CacheWriter.ts      -- Context.Tag: write reports/manifest
    CacheReader.ts      -- Context.Tag: read reports/manifest
    CoverageAnalyzer.ts -- Context.Tag: coverage processing
    ProjectDiscovery.ts -- Context.Tag: test file discovery

  layers/
    AgentDetectionLive.ts / AgentDetectionTest.ts
    CacheWriterLive.ts / CacheWriterTest.ts
    CacheReaderLive.ts / CacheReaderTest.ts
    CoverageAnalyzerLive.ts / CoverageAnalyzerTest.ts
    ProjectDiscoveryLive.ts / ProjectDiscoveryTest.ts
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
    Options.ts          -- reporter + plugin option schemas

  utils/
    compress-lines.ts   -- range compression for uncovered lines
    safe-filename.ts    -- project name sanitization
    ansi.ts             -- ANSI color helpers (NO_COLOR aware)
    strip-console-reporters.ts -- reporter chain manipulation
    detect-pm.ts        -- package manager detection (FileSystemAdapter)
    format-console.ts   -- pure function: console markdown
    format-gfm.ts       -- pure function: GitHub Actions GFM
    build-report.ts     -- pure function: AgentReport builder + duck-typed
                           Vitest interfaces

bin/
  vitest-agent-reporter.js  -- shebang wrapper for CLI
```

### Test Files

```text
src/
  reporter.test.ts          -- AgentReporter lifecycle integration tests
  plugin.test.ts            -- AgentPlugin environment detection + config
  cli/lib/
    format-status.test.ts   -- status formatting logic
    format-overview.test.ts -- overview formatting logic
    format-coverage.test.ts -- coverage formatting logic
    resolve-cache-dir.test.ts -- cache dir resolution
  errors/
    errors.test.ts          -- CacheError, DiscoveryError tagged errors
  layers/
    AgentDetectionLive.test.ts  -- std-env integration, live layer
    CacheWriterLive.test.ts     -- file write via mock FileSystem
    CacheReaderLive.test.ts     -- file read via mock FileSystem,
                                   corrupt/invalid JSON error paths
    CoverageAnalyzerLive.test.ts -- coverage processing, test layer
    ProjectDiscoveryLive.test.ts -- test file discovery
    ReporterLive.test.ts        -- merged layer composition
  schemas/
    Common.test.ts          -- shared literal schemas
    AgentReport.test.ts     -- report schema validation
    CacheManifest.test.ts   -- manifest schema validation
    Coverage.test.ts        -- coverage schema validation
    Options.test.ts         -- reporter + plugin options schema validation
  services/
    services.test.ts        -- service Context.Tag definitions
  utils/
    compress-lines.test.ts  -- range compression edge cases
    safe-filename.test.ts   -- sanitization edge cases
    ansi.test.ts            -- ANSI/stripAnsi, NO_COLOR
    strip-console-reporters.test.ts -- reporter chain manipulation
    detect-pm.test.ts       -- package manager detection
    format-console.test.ts  -- console markdown formatting
    format-gfm.test.ts      -- GFM formatting
    build-report.test.ts    -- report building with mock Vitest objects
```

**27 test files, 300 tests total.** All coverage metrics (statements,
branches, functions, lines) are above 80%.

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

**Future subdirectories (Phase 3):**

```text
{cacheDir}/
  history/                              -- Phase 3: failure tracking
    {safe-project-name}.history.json
```

**`safeFilename()` examples:**

- `"@savvy-web/my-lib:unit"` -> `"@savvy-web__my-lib__unit"`
- `"core"` -> `"core"`
- `""` (root project) -> `"default"`

**Package manager detection:**

The CLI overview command and suggested actions (Phase 3) need to output
correct run commands. Detection logic in `src/utils/detect-pm.ts`:

1. Check `packageManager` field in root `package.json`
2. Fall back to lockfile detection
3. Default to `npx` if nothing detected

### Data Structures

All types are defined as Effect Schema definitions in `src/schemas/` with
TypeScript types derived via `typeof Schema.Type`.

#### JSON Report (`AgentReport`)

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

#### Coverage Report

```typescript
interface CoverageReport {
  totals: CoverageTotals;
  threshold: number;
  scoped: boolean;                                // Phase 2: filtered to subset
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

- **File write failures:** CacheError tagged error, logged to stderr, don't
  crash the test run
- **File read failures (corrupt cache):** CacheReaderLive wraps
  `Schema.decodeUnknownSync` + `JSON.parse` in `Effect.try`, catching
  both malformed JSON and schema validation failures as typed `CacheError`
  rather than unhandled defects
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
  |     +-- yield* CoverageAnalyzer
  |
  +-- Group testModules by testModule.project.name
  |     +-- Map<string, VitestTestModule[]>
  |
  +-- CoverageAnalyzer.process/processScoped(coverage, options)
  |     +-- Returns Option<CoverageReport>
  |     +-- processScoped used when partial test run detected
  |
  +-- For each project group:
  |     +-- buildAgentReport(modules, errors, reason, options, name)
  |     |     +-- Pure function: tallies, extracts errors, builds report
  |     +-- Attach unhandledErrors to ALL project reports
  |     +-- Attach coverageReport if present
  |     +-- CacheWriter.writeReport(cacheDir, projectName, report)
  |
  +-- CacheWriter.writeManifest(cacheDir, manifest)
  |
  +-- Console output (if not "silent")
  |     +-- formatConsoleMarkdown(report, options) -> stdout
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
  +-- Extract coverage threshold:
  |     option.coverageThreshold ?? extractCoverageThreshold(coverage.thresholds)
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
        +-- CacheReader.readManifest(cacheDir)
        +-- CacheReader.readReport() for all projects
        +-- formatCoverage() -> stdout
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

---

## Testing Strategy

### Unit Tests

**Location:** `src/**/*.test.ts`

**Test structure mirrors source.** Services are tested through their layers.
CLI logic is tested through lib functions.

**Implemented tests (Phase 1-2):**

- `utils/compress-lines.test.ts` -- `compressLines()` edge cases
- `utils/safe-filename.test.ts` -- `safeFilename()` sanitization
- `utils/ansi.test.ts` -- `ansi()`/`stripAnsi()`, `NO_COLOR` behavior
- `utils/strip-console-reporters.test.ts` -- `stripConsoleReporters()`
  (string, tuple, class instance filtering)
- `utils/detect-pm.test.ts` -- `detectPackageManager()` with mock FS,
  `getRunCommand()` for all package managers
- `utils/build-report.test.ts` -- `buildAgentReport()` with mock Vitest
  objects, tallying, error extraction, omitPassingTests behavior
- `utils/format-console.test.ts` -- `formatConsoleMarkdown()` output
  formatting, all three modes, coverage gaps, next steps
- `utils/format-gfm.test.ts` -- `formatGfm()` single and multi-project
  output, coverage tables, details blocks
- `schemas/Common.test.ts` -- shared literal schema validation
- `schemas/AgentReport.test.ts` -- report schema validation and encoding
- `schemas/CacheManifest.test.ts` -- manifest schema validation
- `schemas/Coverage.test.ts` -- coverage schema validation, scoped fields
- `schemas/Options.test.ts` -- reporter and plugin options schema validation
- `services/services.test.ts` -- service Context.Tag definitions
- `errors/errors.test.ts` -- CacheError and DiscoveryError tagged error types
- `layers/AgentDetectionLive.test.ts` -- std-env integration, live layer
- `layers/CacheWriterLive.test.ts` -- file write via mock FileSystem
- `layers/CacheReaderLive.test.ts` -- file read via mock FileSystem,
  corrupt/invalid JSON error paths
- `layers/CoverageAnalyzerLive.test.ts` -- coverage processing, scoped
  coverage, bare-zero handling, test layer
- `layers/ProjectDiscoveryLive.test.ts` -- test file discovery, source
  mapping
- `layers/ReporterLive.test.ts` -- merged layer composition
- `cli/lib/format-status.test.ts` -- status formatting
- `cli/lib/format-overview.test.ts` -- overview formatting
- `cli/lib/format-coverage.test.ts` -- coverage formatting
- `cli/lib/resolve-cache-dir.test.ts` -- cache dir resolution
- `reporter.test.ts` -- `AgentReporter` lifecycle integration tests
- `plugin.test.ts` -- `AgentPlugin` environment detection, reporter
  injection, cache directory resolution, coverage threshold extraction,
  consoleStrategy behavior

**Test patterns:**

Each service test follows the state-container pattern:

```typescript
const run = <A, E>(effect: Effect.Effect<A, E, CacheReader>) =>
  Effect.runPromise(Effect.provide(effect, testLayer));

const readManifest = (dir: string) =>
  Effect.flatMap(CacheReader, (svc) => svc.readManifest(dir));
```

Test layers swap `@effect/platform` FileSystem for mock implementations.
Reporter integration tests compose test layers:

```typescript
const TestReporterLive = Layer.mergeAll(
  CacheWriterTest.layer(writeState),
  CoverageAnalyzerTest.layer(),
);
```

CLI commands are not tested directly (thin wrappers). Logic lives in
`cli/lib/` and is tested as pure functions.

### Integration Tests

**What to test:**

- End-to-end reporter behavior with actual Vitest test runs
- Per-project cache file generation in multi-project setup
- Manifest creation and correctness
- GFM output written to GITHUB_STEP_SUMMARY mock file
- Reporter injection via `AgentPlugin`
- CLI bin invocation with cached test data

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

**Note:** Phase 1 source files were restructured during Phase 2. See Phase
2 deliverables for current file locations.

### Phase 2: Effect Services, CLI Bin, and Hybrid Mode -- COMPLETE

**Goal:** Migrate to Effect service architecture, add CLI bin for on-demand
test landscape queries, introduce hybrid console strategy, and fix Phase 1
bugs.

**Deliverables (all implemented):**

- Migrated from Zod to Effect Schema (`src/schemas/` directory)
- Five Effect services: AgentDetection, CacheWriter, CacheReader,
  CoverageAnalyzer, ProjectDiscovery (`src/services/`)
- Live and test layers for all services (`src/layers/`)
- Merged composition layers: ReporterLive, CliLive
- Tagged error types: CacheError, DiscoveryError (`src/errors/`)
- CLI bin with `status`, `overview`, `coverage` commands (`src/cli/`)
- `consoleStrategy` option (`"own" | "complement"`, default `"complement"`)
- Scoped coverage support via CoverageAnalyzer.processScoped()
- `std-env` integration replacing hand-rolled environment detection
- Restructured utils from single file to `src/utils/` directory
- Relocated formatters from `src/formatters/` to `src/utils/`
- Bug fix: unhandledErrors now attached to ALL project reports
- Bug fix: `includeBareZero` works correctly at threshold 0

**Breaking changes from Phase 1:**

- Zod replaced by Effect Schema (all schema exports changed)
- `consoleStrategy` defaults to `"complement"` (Phase 1 was implicitly
  `"own"`)
- `detectEnvironment()` and `isGitHubActions()` utilities removed (replaced
  by AgentDetection service)
- `src/schemas.ts` and `src/types.ts` removed (replaced by `src/schemas/`)
- `src/coverage.ts` removed (replaced by CoverageAnalyzer service)

**Dependencies added:** `effect`, `@effect/cli`, `@effect/platform`,
`@effect/platform-node`, `std-env`

**Dependencies removed:** `zod`

**Source files:**

- `src/reporter.ts`, `src/plugin.ts`, `src/index.ts`
- `src/services/*.ts`, `src/layers/*.ts`, `src/errors/*.ts`
- `src/schemas/*.ts`, `src/utils/*.ts`
- `src/cli/index.ts`, `src/cli/commands/*.ts`, `src/cli/lib/*.ts`
- `bin/vitest-agent-reporter.js`

**Depends on:** Phase 1 (architecture, data structures, test patterns)

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

**Depends on:** Phase 1 (report data structures), Phase 2 (Effect services,
ProjectDiscovery for scoped re-run commands)

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

---

**Document Status:** Current -- reflects Phase 1 and Phase 2 implementation
as built, including post-Phase 2 fixes: `Effect.try` wrapping in
CacheReaderLive for corrupt cache resilience, `SKIP_DIRS` in
ProjectDiscoveryLive, coverage CLI threshold-from-cache, and expanded test
coverage (300 tests across 27 files, all metrics above 80%). Phase 3
remains as planned but not yet started.
