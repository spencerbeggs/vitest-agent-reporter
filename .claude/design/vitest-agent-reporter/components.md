---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-04-30
last-synced: 2026-04-30
post-phase5-sync: 2026-04-23
post-2-0-sync: 2026-04-29
post-rc-sync: 2026-04-30
post-final-sync: 2026-04-30
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
the codebase, organized by package.

**Parent document:** [architecture.md](./architecture.md)

## How to read this document

The system ships as four pnpm workspaces under `packages/` plus a
file-based Claude Code plugin at `plugin/`. Each top-level section
covers one package; load only the section you need:

- **Reporter package** -- the Vitest-API-aware code: `AgentReporter`,
  `AgentPlugin`, `CoverageAnalyzer`, `ReporterLive`
- **Shared package** -- the no-internal-deps base: schemas, services,
  layers, formatters, errors, migrations, utilities, XDG path stack
- **CLI package** -- `vitest-agent-reporter` bin and `CliLive`
- **MCP package** -- `vitest-agent-reporter-mcp` bin, tRPC router, 41
  tools (24 from Phase 5/6 plus 7 read-only β tools over the α
  schema substrate plus 4 RC tools: `triage_brief`, `wrapup_prompt`,
  `hypothesis_record`, `hypothesis_validate`, plus 6 final tools:
  `tdd_session_start`, `tdd_session_end`, `tdd_session_resume`,
  `decompose_goal_into_behaviors`, `tdd_phase_transition_request`,
  `commit_changes`), the tRPC idempotency middleware, and `McpLive`
- **Claude Code plugin** -- file-based plugin with the MCP loader,
  hooks, skills, commands, and (final) the TDD orchestrator agent
  definition + `/tdd` slash command + 9 sub-skill primitives

The 11 Effect services are split: 10 services live in
`packages/shared/src/services/` (Config, DataReader, DataStore,
DetailResolver, EnvironmentDetector, ExecutorResolver, FormatSelector,
HistoryTracker, OutputRenderer, ProjectDiscovery), plus CoverageAnalyzer
in the reporter package -- 11 services in total.

---

## Reporter package (vitest-agent-reporter)

The reporter package owns everything Vitest-API-aware. It depends on
`vitest-agent-reporter-shared` for services, schemas, and utilities,
and declares `vitest-agent-reporter-cli` and `vitest-agent-reporter-mcp`
as required `peerDependencies` so the agent tooling story is always
installed alongside the reporter.

**npm name:** `vitest-agent-reporter`
**Location:** `packages/reporter/`
**Entry:** `packages/reporter/src/index.ts`
**Internal dependencies:** `vitest-agent-reporter-shared`
**Required peer dependencies:** `vitest-agent-reporter-cli`,
`vitest-agent-reporter-mcp`, `vitest >= 4.1.0`

### AgentReporter

**Location:** `packages/reporter/src/reporter.ts`

**Purpose:** Vitest Reporter that produces three outputs: formatted
output to console (via output pipeline), persistent data to SQLite
database per project, and optional GFM for GitHub Actions. Uses Effect
services for database I/O, coverage processing, failure history
tracking, coverage baselines/trends, and output rendering.

**Lifecycle hooks:**

- **`async onInit(vitest)`** -- stores the `Vitest` instance and
  resolves `dbPath` via the XDG-based path stack. The reporter holds
  `private dbPath: string | null = null` plus a
  `private async ensureDbPath()` helper. If `options.cacheDir` is
  set, the helper short-circuits to `<cacheDir>/data.db` (skipping the
  heavy XDG/workspace layer stack that would otherwise eagerly scan
  lockfiles). Otherwise it runs `resolveDataPath(process.cwd())` under
  `PathResolutionLive(projectDir) + NodeContext.layer` and memoizes
  the result on `this.dbPath`. On rejection, prints
  `formatFatalError(err)` to stderr and returns early. See **XDG Path
  Resolution** in the shared package
- **`onCoverage(coverage)`** -- stashes coverage data; fires before
  `onTestRunEnd`
- **`async onTestRunEnd(testModules, unhandledErrors, reason)`** --
  see the flow below

**`onTestRunEnd` flow:**

1. Calls `ensureDbPath()` defensively and `await ensureMigrated(...)`
   to serialize migration across reporter instances sharing a
   `dbPath`. Both bail with `formatFatalError(err)` to stderr on
   rejection
2. Captures Vitest settings + env vars and persists via
   `DataStore.writeSettings()`
3. Filters `testModules` by `projectFilter` if set, groups by
   `testModule.project.name`. Only the first project (alphabetically)
   processes global coverage; others skip to avoid duplication
4. For each project: `splitProject()` separates `project:subProject`,
   `buildAgentReport()` builds the report, `unhandledErrors` attach
   to all project reports, `HistoryTracker.classify(...)` produces
   classifications, and `DataStore.writeRun()` / `writeModules()` /
   `writeSuites()` / `writeTestCases()` / `writeErrors()` /
   `writeCoverage()` / `writeHistory()` / `writeSourceMap()` persist
   the data. **(2.0.0-β)** Before `writeErrors`, each error in the
   report passes through `processFailure(error, options)` (see
   **Reporter-only utilities** below) to source-map the top
   non-framework frame, run `findFunctionBoundary` on the
   resolved source, and call `computeFailureSignature`. The
   resulting `signatureHash` is upserted via
   `DataStore.writeFailureSignature()` (idempotent ON CONFLICT,
   increments `occurrence_count`); `writeErrors` then persists
   `test_errors.signature_hash` and the per-frame
   `stack_frames.source_mapped_line` /
   `function_boundary_line` columns by passing the
   `frames: StackFrameInput[]` array on `TestErrorInput`
5. Reads existing baselines via `DataReader.getBaselines()`, computes
   updated baselines, writes via `DataStore.writeBaselines()`. On
   full (non-scoped) runs, computes per-project trends via
   `computeTrend()` and writes via `DataStore.writeTrends()`
6. Reads trends back from DB and builds `trendSummary` for formatter
   context (direction, runCount, firstMetric)
7. Renders via `OutputRenderer.render()` -- tiered console markdown
   (green/yellow/red) with `[new-failure]` classification labels and
   "trending improving over N runs" line when trend data exists.
   When `mcp: true`, Next Steps suggests MCP tools instead of CLI
   commands. When `GITHUB_ACTIONS` detected or `githubActions` option
   enabled, appends GFM summary to `GITHUB_STEP_SUMMARY`

Each lifecycle hook builds a scoped effect and runs it with
`Effect.runPromise`, providing `ReporterLive(dbPath)` inline.

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

- Depends on: Vitest Reporter API (>= 4.1.0), DataStore, DataReader,
  CoverageAnalyzer, HistoryTracker, OutputRenderer services,
  `@effect/platform` FileSystem
- Used by: `AgentPlugin`, direct consumer configuration

### AgentPlugin

**Location:** `packages/reporter/src/plugin.ts`

**Purpose:** Vitest plugin that injects `AgentReporter` into the
reporter chain via the `configureVitest` hook. Manages environment
detection via EnvironmentDetector service, executor resolution via
ExecutorResolver, reporter chain manipulation, cache directory
resolution, and coverage threshold/target resolution.

**Responsibilities:**

- Uses `VitestPluginContext` from `vitest/node` for `configureVitest`
  hook typing, with `as unknown as` casts where Vitest types are too
  strict for config subset access. The hook is async (runs
  `Effect.runPromise` for environment detection)
- Detects environment via `EnvironmentDetector` (`agent-shell`,
  `terminal`, `ci-github`, `ci-generic`) and resolves executor via
  `ExecutorResolver` (`human`, `agent`, or `ci`)
- Resolves cache directory with two-step priority: explicit
  `reporter.cacheDir` option > `outputFile['vitest-agent-reporter']`
  from Vitest config. When both are unset, passes
  `cacheDir: undefined` to `AgentReporter`, which falls through to
  XDG-based resolution via `resolveDataPath` -- the canonical default.
  No Vite-cacheDir fallback
- Resolves coverage thresholds (from Vitest's resolved coverage
  config) and targets (from plugin options) via `resolveThresholds()`.
  Disables Vitest's native `autoUpdate` when our targets are set, to
  prevent Vitest from auto-ratcheting thresholds independently
- In agent/own mode, suppresses Vitest's native coverage text table by
  setting `coverage.reporter = []`
- Passes project name from `configureVitest` context as
  `projectFilter` on AgentReporter so each instance filters to its
  own project, and pushes the `AgentReporter` instance into
  `vitest.config.reporters`

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

`default`, `verbose`, `tree`, `dot`, `tap`, `tap-flat`,
`hanging-process`, `agent`. Custom reporters (class instances, file
paths) and non-console built-in reporters (`json`, `junit`, `html`,
`blob`, `github-actions`) are preserved.

**Dependencies:**

- Depends on: Vitest Plugin API (`configureVitest`, Vitest 3.1+),
  `AgentReporter`, EnvironmentDetector service, ExecutorResolver
  service, `stripConsoleReporters`
- Used by: Consumer `vitest.config.ts`

### CoverageAnalyzer

**Location:** `packages/reporter/src/services/CoverageAnalyzer.ts`,
`packages/reporter/src/layers/CoverageAnalyzerLive.ts`,
`packages/reporter/src/layers/CoverageAnalyzerTest.ts`

**Purpose:** Effect service that processes istanbul `CoverageMap` data
with optional scoping. Provides `process` (full analysis) and
`processScoped` (filtered to tested source files) effects.

**Why it lives in the reporter package:** only the reporter consumes
istanbul `CoverageMap` data directly. CLI and MCP read pre-processed
coverage from SQLite via `DataReader`, so they never need this service.

The implementation is a pure computation against duck-typed
`CoverageMap` interfaces -- no I/O, no native deps -- but it is the
only service that knows about istanbul's specific shape, so it stays
co-located with the reporter that feeds it.

**Dependencies:**

- Depends on: Coverage schema, duck-typed istanbul `CoverageMap`
  interface
- Used by: AgentReporter (via ReporterLive)

### Reporter-only utilities

**Location:** `packages/reporter/src/utils/`

Pure utilities that only the reporter and plugin call. Anything used
by more than one runtime package lives in shared instead. The β
release adds `process-failure` -- the only one that bridges to a
shared utility (`failure-signature` + `function-boundary`) at
runtime.

- `strip-console-reporters.ts` -- removes console reporters from
  Vitest's reporter chain, plus the `CONSOLE_REPORTERS` constant.
  Plugin-only
- `resolve-thresholds.ts` -- parses Vitest-native coverage thresholds
  format into `ResolvedThresholds`. Reporter and plugin both call it
- `capture-env.ts` -- captures relevant environment variables (CI,
  NODE_ENV, GITHUB_*, RUNNER_*) for settings storage
- `capture-settings.ts` -- captures Vitest config settings (pool,
  environment, timeouts, coverage provider, etc.) and computes a
  deterministic hash. The `SettingsInput` return type lives in
  `packages/shared/src/services/DataStore.ts` so DataStore owns its
  full input contract without circular imports between reporter and
  shared
- `process-failure.ts` (2.0.0-β) -- per-error processing pipeline
  called from `AgentReporter.onTestRunEnd` before
  `DataStore.writeErrors`. Walks the Vitest stack frames on a
  `ReportError`, identifies the top non-framework frame
  (skipping `node:internal`, `node_modules/vitest/`, and other
  framework prefixes), source-maps it via the source-map-resolver
  fed from the test module, runs `findFunctionBoundary` on the
  resolved source, then calls `computeFailureSignature` with the
  parsed pieces. Returns
  `{ frames: StackFrameInput[], signatureHash: string }` so the
  reporter can pass `frames` and `signatureHash` straight into
  `DataStore.writeErrors` (via `TestErrorInput`) and
  `DataStore.writeFailureSignature`. Pure async function -- no
  Effect service wrapping

### ReporterLive composition layer

**Location:** `packages/reporter/src/layers/ReporterLive.ts`

**Signature:** `ReporterLive(dbPath: string, logLevel?, logFile?)`

**Purpose:** Composition layer used by `AgentReporter` via
`Effect.runPromise`. Merges the live layers the reporter needs from
shared plus the reporter-local `CoverageAnalyzerLive`.

**Composition:** DataStoreLive + CoverageAnalyzerLive +
HistoryTrackerLive + OutputPipelineLive + DataReaderLive +
SqliteClient + Migrator + LoggerLive(...). Does not pull
`NodeContext` directly because `ensureMigrated` and `resolveDataPath`
provide their own platform layers earlier in the pipeline.

---

## Shared package (vitest-agent-reporter-shared)

The no-internal-dependencies base package that the reporter, CLI, and
MCP packages all depend on. Owns the data layer, all shared services
and layers, formatters, error types, schemas, SQLite migrations, SQL
helpers, and the XDG path-resolution stack. Anything used by more than
one of the three runtime packages lives here. Anything used by exactly
one of them stays in that package.

**npm name:** `vitest-agent-reporter-shared`
**Location:** `packages/shared/`
**Entry:** `packages/shared/src/index.ts`
**Internal dependencies:** none

**Key external dependencies:**

- `xdg-effect ^1.0.1` -- `AppDirs` namespace, `XdgLive` layer
- `config-file-effect ^0.2.0` -- `ConfigFile.Tag`, `ConfigFile.Live`,
  `TomlCodec`, `FirstMatch` strategy, `WorkspaceRoot` / `GitRoot` /
  `UpwardWalk` resolvers
- `workspaces-effect ^0.5.1` -- `WorkspacesLive`,
  `WorkspaceDiscovery`, `WorkspaceRoot`, `WorkspaceRootNotFoundError`
- `acorn ^8.16.0` (2.0.0-α) -- AST parser used by
  `findFunctionBoundary` to identify the smallest enclosing function
  for a given source line. Enables stable failure signatures
  (Decision D10). `@types/acorn ^6.0.4` is the matching devDependency
- `acorn-typescript ^1.4.13` (2.0.0-β) -- TypeScript plugin for
  acorn. Imported as the named `tsPlugin` export and applied via
  `Parser.extend(tsPlugin())` so `findFunctionBoundary` can parse
  the `.ts` source files Vitest stack frames source-map back to.
  Closes α D10's deferred TS-support note (the failure signature's
  function-boundary coordinate is now stable for TS projects too,
  not just JS)

Plus `effect`, `@effect/platform`, `@effect/platform-node`,
`@effect/sql`, `@effect/sql-sqlite-node`, `std-env`.

**Internal dependents:** the reporter, cli, and mcp packages (each via
`workspace:*`).

**External consumers:** none directly. Although the package is
published to npm so pnpm/npm/yarn can hoist it correctly, end users
install it transitively as a dependency of the reporter.

### Effect Services

**Location:** `packages/shared/src/services/` (10 services). One
additional service (`CoverageAnalyzer`) lives in the reporter package
-- 11 services in total.

Each service is an Effect `Context.Tag` with a typed interface. Live
implementations use `@effect/platform` and `@effect/sql-sqlite-node`
for I/O; test implementations use mock state containers.

The 10 services in shared:

- **DataStore** (`DataStore.ts`) -- writes all test data to SQLite.
  See the **DataStore service** subsection
- **DataReader** (`DataReader.ts`) -- reads test data from SQLite.
  See the **DataReader service** subsection
- **EnvironmentDetector** (`EnvironmentDetector.ts`) -- wraps
  `std-env` for four-environment detection. Provides `detect()`,
  `isAgent`, and `agentName` effects. Returns `Environment`:
  `"agent-shell" | "terminal" | "ci-github" | "ci-generic"`
- **ExecutorResolver** (`ExecutorResolver.ts`) -- maps environment +
  mode to an executor role. `resolve(env, mode)` returns `Executor`:
  `"human" | "agent" | "ci"`
- **FormatSelector** (`FormatSelector.ts`) -- selects output format.
  `select(executor, explicitFormat?)` returns `OutputFormat`:
  `"markdown" | "json" | "vitest-bypass" | "silent"`
- **DetailResolver** (`DetailResolver.ts`) -- determines output detail
  level. `resolve(executor, health, explicit?)` returns `DetailLevel`:
  `"minimal" | "neutral" | "standard" | "verbose"`. `RunHealth`
  carries `hasFailures`, `belowTargets`, `hasTargets` flags
- **OutputRenderer** (`OutputRenderer.ts`) -- renders reports using
  the selected formatter. `render(reports, format, context)` returns
  `RenderedOutput[]`
- **ProjectDiscovery** (`ProjectDiscovery.ts`) -- glob-based test file
  discovery for the CLI. Provides `discoverTestFiles` and
  `mapTestToSource` effects
- **HistoryTracker** (`HistoryTracker.ts`) -- classifies test
  outcomes against stored history. See **Failure History &
  Classification**
- **VitestAgentReporterConfigFile** (`Config.ts`) -- typed
  `Context.Tag` for the loaded TOML config. Live layer is
  `ConfigLive(projectDir)`. See **TOML Config File**

### Effect Layers

**Location:** `packages/shared/src/layers/`

Live and test implementations for the shared services. Composition
layers for the runtime packages (`ReporterLive`, `CliLive`,
`McpLive`) live in their respective packages and are described in
those sections; the only composite that lives in shared is
`OutputPipelineLive` because all three runtime packages include it.

**Live layers:**

- One-to-one with each shared service: `DataStoreLive`,
  `DataReaderLive`, `EnvironmentDetectorLive`, `ExecutorResolverLive`,
  `FormatSelectorLive`, `DetailResolverLive`, `OutputRendererLive`,
  `ProjectDiscoveryLive`, `HistoryTrackerLive`. `DataReaderLive` uses
  SQL assembler functions to reconstruct `AgentReport` and other
  domain types from normalized row data; `HistoryTrackerLive` uses a
  10-entry sliding window and the `classifyTest()` pure function
- `LoggerLive(logLevel?, logFile?)` -- structured NDJSON logging. See
  the **LoggerLive** subsection
- `OutputPipelineLive` (composite) -- EnvironmentDetectorLive +
  ExecutorResolverLive + FormatSelectorLive + DetailResolverLive +
  OutputRendererLive
- `ConfigLive(projectDir)` -- TOML config loader. See the
  **TOML Config File** subsection
- `PathResolutionLive(projectDir)` -- composite of `XdgLive`,
  `ConfigLive`, and `WorkspacesLive`. See the **XDG Path Resolution**
  subsection

**Test layers:** `DataStoreTest` (accumulates writes into a mutable
state container), `EnvironmentDetectorTest` (accepts a fixed
environment value), `ProjectDiscoveryTest` (canned data),
`HistoryTrackerTest` (canned classifications). `CoverageAnalyzerLive`
/ `CoverageAnalyzerTest` live in the reporter package alongside the
service.

### Error Types

**Location:** `packages/shared/src/errors/`

Tagged error types for Effect service failure channels.

- **DataStoreError** (`DataStoreError.ts`) -- `Data.TaggedError` for
  database failures. Fields: `operation`
  (`"read" | "write" | "migrate"`), `table` (string), `reason`
  (string). Constructor sets `this.message` via
  `Object.defineProperty` to a derived `[operation table] reason`
  string so `Cause.pretty()` surfaces the operation/table/reason
  instead of the default "An error has occurred". Also exports an
  `extractSqlReason(e: unknown) => string` helper that pulls
  `SqlError.cause.message` (the actual SQLite error like
  `"SQLITE_BUSY: database is locked"` or
  `"UNIQUE constraint failed: ..."`) instead of the generic
  `"Failed to execute statement"` wrapper. Both `DataStoreLive` and
  `DataReaderLive` route every `Effect.mapError` callsite through
  `extractSqlReason` so the underlying SQLite text reaches the user
- **DiscoveryError** (`DiscoveryError.ts`) -- `Data.TaggedError` for
  project discovery failures (glob, read, stat operations).
  Constructor uses the same derived-message pattern as DataStoreError
  (`[operation path] reason`)
- **PathResolutionError** (`PathResolutionError.ts`) --
  `Data.TaggedError` raised when the data directory cannot be
  resolved. The most common case is missing workspace identity (no
  `projectKey` in the config TOML and no `name` in the root
  `package.json`). Constructor sets `this.message` to `args.reason`
  directly. `resolveDataPath` typically surfaces this via the
  underlying `WorkspaceRootNotFoundError` from `workspaces-effect`;
  this error is reserved for path-resolution failures that don't
  already have a more-specific tagged error

### Schemas

**Location:** `packages/shared/src/schemas/`

Single source of truth for all data structures. Defines Effect Schema
definitions with `typeof Schema.Type` for TypeScript types and
`Schema.decodeUnknown` / `Schema.encodeUnknown` for JSON encode/decode.

| File | Contents |
| ---- | -------- |
| `Common.ts` | Shared literals: `TestState`, `TestRunReason`, `TestClassification`, `ConsoleOutputMode`, `PluginMode`, `ConsoleStrategy`, `PackageManager`, `Environment` (`"agent-shell" \| "terminal" \| "ci-github" \| "ci-generic"`), `Executor` (`"human" \| "agent" \| "ci"`), `OutputFormat` (`"markdown" \| "json" \| "vitest-bypass" \| "silent"`), `DetailLevel` (`"minimal" \| "neutral" \| "standard" \| "verbose"`) |
| `AgentReport.ts` | `AgentReport`, `ModuleReport`, `TestReport`, `ReportError` schemas |
| `Coverage.ts` | `CoverageReport`, `CoverageTotals`, `FileCoverageReport` schemas |
| `Thresholds.ts` | `MetricThresholds`, `PatternThresholds`, `ResolvedThresholds` |
| `Baselines.ts` | `CoverageBaselines` |
| `Trends.ts` | `TrendEntry`, `TrendRecord` |
| `CacheManifest.ts` | `CacheManifest`, `CacheManifestEntry` schemas |
| `Options.ts` | `AgentReporterOptions`, `AgentPluginOptions`, `CoverageOptions`, `FormatterOptions` schemas |
| `History.ts` | `TestRun`, `TestHistory`, `HistoryRecord` schemas |
| `Config.ts` | `VitestAgentReporterConfig` schema for the optional `vitest-agent-reporter.config.toml`. Both fields (`cacheDir?: string`, `projectKey?: string`) are optional. When absent, `resolveDataPath` falls back to deriving the path from the workspace's `package.json` `name` under the XDG data directory |
| `turns/` (2.0.0-α) | Discriminated `TurnPayload` union over seven payload schemas (`UserPromptPayload`, `ToolCallPayload`, `ToolResultPayload`, `FileEditPayload`, `HookFirePayload`, `NotePayload`, `HypothesisPayload`). Each is a `Schema.Struct` with a `type` literal discriminator. The `record` CLI (out of scope on the 2.0.0-α schema branch) will use these to validate the JSON-stringified payloads before writing `turns.payload`. Re-exported from `index.ts` |

Istanbul duck-type interfaces remain as TypeScript interfaces, not
schemas.

### DataStore service

**Location:** `packages/shared/src/services/DataStore.ts`,
`packages/shared/src/layers/DataStoreLive.ts`,
`packages/shared/src/layers/DataStoreTest.ts`

**Purpose:** Effect service for writing all test data to the SQLite
database.

**Write operations:**

| Method | Purpose |
| ------ | ------- |
| `writeSettings(hash, settings, envVars)` | Vitest config snapshot |
| `writeRun(input: TestRunInput)` | test run with summary stats; returns `runId` |
| `writeModules(runId, modules)` | test modules; returns `moduleId[]` |
| `writeSuites(moduleId, suites)` | test suites; returns `suiteId[]` |
| `writeTestCases(moduleId, tests)` | test cases; returns `testCaseId[]` |
| `writeErrors(runId, errors)` | test/suite/module/unhandled errors |
| `writeCoverage(runId, coverage)` | per-file coverage data |
| `writeHistory(project, subProject, fullName, runId, ...)` | per-test history entry |
| `writeBaselines(baselines)` | coverage baselines |
| `writeTrends(project, subProject, runId, entry)` | coverage trend entry |
| `writeSourceMap(sourceFilePath, testModuleId, mappingType)` | source-to-test file mapping |
| `ensureFile(filePath)` | ensure file path exists in `files` table; returns `fileId` |
| `writeNote(note)` / `updateNote(id, fields)` / `deleteNote(id)` | note CRUD |
| `writeSession(input: SessionInput)` (2.0.0-α) | inserts a Claude Code session row; returns `sessionId`. Carries `cc_session_id` (Claude Code session ID), `agent_kind` (`"main"` or `"subagent"`), optional `parent_session_id`, `triage_was_non_empty`, project/sub-project/cwd, and `started_at` |
| `writeTurn(input: TurnInput)` (2.0.0-α; β auto-`turn_no`) | inserts a turn-log row under a session; returns `turnId`. Caller pre-stringifies the payload JSON (validated against `TurnPayload` by the `record` CLI). Type discriminator is one of `user_prompt`, `tool_call`, `tool_result`, `file_edit`, `hook_fire`, `note`, `hypothesis`. **β:** `turn_no` is now optional on `TurnInput`; the live layer computes `MAX(turn_no)+1` per session inside the same transaction when omitted |
| `writeFailureSignature(input: FailureSignatureWriteInput)` (2.0.0-β) | idempotent upsert on `failure_signatures(signature_hash)`. New rows record `first_seen_run_id`, `first_seen_at`, and `occurrence_count = 1`; `ON CONFLICT(signature_hash) DO UPDATE` increments `occurrence_count` and refreshes `last_seen_at`. Called by the reporter for each error `signatureHash` returned by `processFailure` |
| `endSession(ccSessionId, endedAt, endReason)` (2.0.0-β) | updates `sessions.ended_at` and `sessions.end_reason` for a Claude Code session ID. Called by the `record session-end` CLI subcommand (driven by the `session-end-record.sh` plugin hook) |
| `recordIdempotentResponse(input: IdempotentResponseInput)` (2.0.0-RC) | `INSERT ... ON CONFLICT DO NOTHING` on `mcp_idempotent_responses(procedure_path, key)` so duplicate keys are no-ops. Backs the tRPC idempotency middleware's persist step. Persistence errors are swallowed by the middleware -- a transient DB failure must not surface as a tool error |
| `writeHypothesis(input: HypothesisInput)` (2.0.0-RC) | inserts a `hypotheses` row carrying `sessionId`, `content`, optional cited evidence FKs (`citedTestErrorId`, `citedStackFrameId`, `createdTurnId`), and returns the new id. Called by the `hypothesis_record` MCP tool |
| `validateHypothesis(input: ValidateHypothesisInput)` (2.0.0-RC) | updates `hypotheses.validation_outcome`, `validated_at`, `validated_turn_id` for an existing hypothesis id. Raises a `DataStoreError` when the hypothesis id is unknown so the MCP layer surfaces a meaningful error. Called by the `hypothesis_validate` MCP tool |
| `pruneSessions(keepRecent: number)` (2.0.0-RC) | finds the cutoff at the `(keepRecent+1)`-th most recent session by `started_at` and deletes turn rows for older sessions. FK CASCADE handles `tool_invocations` and `file_edits`. Sessions rows themselves are retained (only the turn history is pruned). Returns `{ affectedSessions, prunedTurns }` — `affectedSessions` is the count of sessions whose turn-log was dropped, NOT sessions deleted. Called by the `cache prune --keep-recent` CLI subcommand |
| `writeTddSession(input: TddSessionInput) -> number` (2.0.0 final) | inserts a `tdd_sessions` row carrying the session's `goal`, `agent_session_id` FK, optional `parent_tdd_session_id` self-FK, and `started_at`. Returns the new id. Called by the `tdd_session_start` MCP tool |
| `endTddSession(input: EndTddSessionInput)` (2.0.0 final) | closes a TDD session by updating `tdd_sessions.outcome` (one of `succeeded`/`blocked`/`abandoned`), `ended_at`, and optional `summary_note_id` FK. Called by the `tdd_session_end` MCP tool |
| `writeTddSessionBehaviors(input: WriteTddBehaviorsInput) -> TddBehaviorOutput[]` (2.0.0 final) | writes the ordered behavior backlog rows under a TDD session. Each behavior row carries `name`, `description`, ordered position, and initial `status='pending'`. Returns the inserted rows with their assigned ids. Called by `decompose_goal_into_behaviors` |
| `writeTddPhase(input: WriteTddPhaseInput) -> WriteTddPhaseOutput` (2.0.0 final) | opens a new `tdd_phases` row (one of the 8 phase enum values per α D11) and **closes the prior open phase in the same SQL transaction** so the per-session phase ledger is always consistent. Called by `tdd_phase_transition_request` after the pure `validatePhaseTransition` validator accepts |
| `writeTddArtifact(input: WriteTddArtifactInput) -> number` (2.0.0 final) | records an evidence artifact (`test_written` / `test_failed_run` / `code_written` / `test_passed_run` / `refactor` / `test_weakened`) under a `tdd_phases` row, with optional FKs into `test_cases`, `test_runs`, and `test_errors`. Returns the new id. Per Decision D7, called only by hooks (`record tdd-artifact` CLI subcommand), never by the agent |
| `writeCommit(input: WriteCommitInput)` (2.0.0 final) | idempotent insert into `commits` (`ON CONFLICT(sha) DO NOTHING`) carrying sha / parent_sha / message / author / committed_at / branch. Called by the `record run-workspace-changes` CLI subcommand, which the `post-tool-use-git-commit.sh` hook drives on every successful `git commit` / `git push` |
| `writeRunChangedFiles(input: WriteRunChangedFilesInput)` (2.0.0 final) | writes the per-run changed-file list into `run_changed_files`. Inputs carry the run/commit FK and an array of `RunChangedFile` rows (`{ filePath, changeKind }` where `changeKind` is one of α's 5 enum values). Called alongside `writeCommit` from the `record run-workspace-changes` CLI |

**Key input types:**

`TestRunInput`, `ModuleInput`, `TestCaseInput`, `TestErrorInput`,
`FileCoverageInput`, `SuiteInput`, `NoteInput`, **`SettingsInput`**,
`SessionInput`, `TurnInput`, **`StackFrameInput`** (2.0.0-β),
**`FailureSignatureWriteInput`** (2.0.0-β),
**`IdempotentResponseInput`** (2.0.0-RC),
**`HypothesisInput`** (2.0.0-RC),
**`ValidateHypothesisInput`** (2.0.0-RC),
**`TddSessionInput`** (2.0.0 final),
**`EndTddSessionInput`** (2.0.0 final),
**`TddBehaviorInput`** + **`WriteTddBehaviorsInput`** + **`TddBehaviorOutput`**
(2.0.0 final),
**`WriteTddPhaseInput`** + **`WriteTddPhaseOutput`** (2.0.0 final),
**`WriteTddArtifactInput`** (2.0.0 final),
**`WriteCommitInput`** (2.0.0 final),
**`RunChangedFile`** + **`WriteRunChangedFilesInput`** (2.0.0 final)
-- all defined in `DataStore.ts`. The final phase also re-exports
the **`Phase`**, **`ArtifactKind`**, and **`ChangeKind`** literal
types so callers (CLI subcommands, MCP tools) can reference them
without dipping into `schemas/` directly. `SettingsInput` is owned
by DataStore (rather than by `utils/capture-settings.ts` in the
reporter package, which produces values matching this shape) to
avoid a circular import path between reporter and shared.

**β input shapes:**

- `StackFrameInput` -- shape attached to `TestErrorInput.frames`
  carrying `function_name`, `file_path`, `raw_line`,
  `raw_column`, optional `source_mapped_line`, and optional
  `function_boundary_line`. The live layer pivots this into
  one row per frame in `stack_frames`
- `FailureSignatureWriteInput` -- the persistence-time shape
  `{ signatureHash, firstSeenRunId, firstSeenAt }`. Distinct from
  `failure-signature.ts`'s compute-time `FailureSignatureInput`
  (which carries the un-hashed `error_name` /
  `assertion_message` / `top_frame_function_name` /
  `top_frame_function_boundary_line` / `top_frame_raw_line`
  fields hashed *into* the signature). The naming
  disambiguation is intentional -- `*WriteInput` mirrors the
  existing convention used for the other DataStore inputs

**β `TestErrorInput` extension:** `signatureHash` and `frames`
are both optional. When `signatureHash` is provided, the live
layer writes `test_errors.signature_hash` (the FK to
`failure_signatures`); when `frames` is provided, it writes a
row per frame to `stack_frames`, including the new
`source_mapped_line` and `function_boundary_line` columns from
α's `0002_comprehensive` migration.

**RC input shapes:**

- `IdempotentResponseInput` --
  `{ procedurePath: string, key: string, resultJson: string,
  createdAt: string }`. Persisted to `mcp_idempotent_responses`
  via `recordIdempotentResponse`. The composite PK on
  `(procedure_path, key)` is what makes the
  `INSERT ... ON CONFLICT DO NOTHING` idempotent
- `HypothesisInput` --
  `{ sessionId: number, content: string, citedTestErrorId?:
  number | null, citedStackFrameId?: number | null,
  createdTurnId?: number | null, createdAt: string }`. Used by
  `writeHypothesis`; the cited evidence FKs make hypotheses
  link back to specific test errors and stack frames captured
  by the reporter
- `ValidateHypothesisInput` --
  `{ id: number, outcome: "confirmed" | "refuted" |
  "abandoned", validatedAt: string, validatedTurnId?:
  number | null }`. Used by `validateHypothesis`. The
  `outcome` discriminator mirrors α's `hypotheses.validation_outcome`
  CHECK enum

**`TestCaseInput.suiteId`:** the reporter populates `suiteId` from
`testCase.parent.fullName` via the `suiteIdMap` it builds when
writing suites. This persists `test_cases.suite_id` so
`DataReader.listSuites`'s `SELECT COUNT(*) FROM test_cases WHERE
suite_id = ts.id` aggregation returns real per-suite counts. The
supporting duck-type field (`parent` on `VitestTestCase` in
`build-report.ts`) is optional in the interface so unit-test fixtures
don't need to fabricate a stub.

**Dependencies:**

- Depends on: `@effect/sql-sqlite-node` SqlClient
- Used by: AgentReporter, MCP server (note CRUD)

### DataReader service

**Location:** `packages/shared/src/services/DataReader.ts`,
`packages/shared/src/layers/DataReaderLive.ts`

**Purpose:** Effect service for reading all test data from the SQLite
database. Shared between reporter, CLI, and MCP.

**Read operations:**

| Method | Returns |
| ------ | ------- |
| `getLatestRun(project, subProject)` | `Option<AgentReport>` for the most recent test run |
| `getRunsByProject()` | `ProjectRunSummary[]` for all projects |
| `getHistory(project, subProject)` | `HistoryRecord` |
| `getBaselines(project, subProject)` | `Option<CoverageBaselines>` |
| `getTrends(project, subProject, limit?)` | `Option<TrendRecord>` |
| `getFlaky(project, subProject)` | flaky test records |
| `getPersistentFailures(project, subProject)` | persistent failure records |
| `getFileCoverage(runId)` | per-file coverage |
| `getCoverage(project, subProject)` | coverage report from the latest run (used by MCP `test_coverage` tool) |
| `getTestsForFile(filePath)` | test module paths covering a source file (uses `SELECT DISTINCT ... ORDER BY f.path` because `source_test_map` accumulates a row per run) |
| `getErrors(project, subProject, errorName?)` | test errors with diffs and stacks |
| `getNotes(scope?, project?, testFullName?)` | filtered notes |
| `getNoteById(id)` | `Option<NoteRow>` |
| `searchNotes(query)` | full-text search via FTS5 |
| `getManifest()` | `Option<CacheManifest>` assembled from DB (see note below) |
| `getSettings(hash)` | `Option<SettingsRow>` |
| `getLatestSettings()` | `Option<SettingsRow>` for the most recent settings snapshot (used by MCP `configure` when no hash specified) |
| `listTests(project, subProject, options?: { state?, module?, limit? })` | `TestListEntry[]` for test case discovery |
| `listModules(project, subProject)` | `ModuleListEntry[]` for test module discovery |
| `listSuites(project, subProject, options?: { module? })` | `SuiteListEntry[]` for test suite discovery |
| `listSettings()` | `SettingsListEntry[]` for settings snapshot discovery |
| `getSessionById(id)` (2.0.0-α) | `Option<SessionDetail>` for a Claude Code session row |
| `searchTurns(options: TurnSearchOptions)` (2.0.0-α) | `TurnSummary[]`; filters by `sessionId`, `type`, `since` (timestamp), and `limit` |
| `computeAcceptanceMetrics()` (2.0.0-α) | `AcceptanceMetrics` -- four ratios from spec Annex A: phase-evidence integrity (red-before-code), compliance-hook responsiveness, orientation usefulness, anti-pattern detection rate. Each metric returns `{ total, <numerator>, ratio }` |
| `getSessionByCcId(ccSessionId)` (2.0.0-β) | `Option<SessionDetail>` looked up by Claude Code session ID. Used by the `record turn` CLI to resolve the session before writing a turn |
| `listSessions(options: { project?, agentKind?, limit? })` (2.0.0-β) | `SessionSummary[]` filtered by project and `agent_kind` (`"main"`/`"subagent"`). Default limit 50, ordered by `started_at DESC`. Backs the `session_list` MCP tool |
| `getFailureSignatureByHash(hash)` (2.0.0-β) | `Option<FailureSignatureDetail>` -- the `failure_signatures` row plus the up-to-10 most recent `test_errors` rows joined via `signature_hash`. Backs the `failure_signature_get` MCP tool |
| `getTddSessionById(id)` (2.0.0-β) | `Option<TddSessionDetail>` -- the `tdd_sessions` row plus its `tdd_phases` (with nested `tdd_artifacts` per phase). Pre-rolls the joins so the `tdd_session_get` MCP tool returns one tree |
| `listHypotheses(options: { sessionId?, outcome?, limit? })` (2.0.0-β) | `HypothesisSummary[]` filtered by `sessionId` and validation outcome. `outcome="open"` matches `validation_outcome IS NULL`; other values match the literal CHECK enum (`confirmed`/`refuted`/`abandoned`). Default limit 50 |
| `findIdempotentResponse(procedurePath, key)` (2.0.0-RC) | `Option<string>` -- the cached `result_json` for a given MCP procedure invocation, or `Option.none()` when no entry exists. Backs the tRPC idempotency middleware's cache check. The middleware's flow is `findIdempotentResponse -> next() -> recordIdempotentResponse` per Decision Phase 9 / RC notes |
| `getCurrentTddPhase(tddSessionId)` (2.0.0 final) | `Option<CurrentTddPhase>` -- the most-recent **open** `tdd_phases` row for a TDD session (the row whose `ended_at` is NULL). Used by `tdd_phase_transition_request` to identify the source phase for the validator and by `writeTddPhase` to know which prior phase to close in the same transaction |
| `getTddArtifactWithContext(artifactId)` (2.0.0 final) | `Option<CitedArtifactRow>` -- a `tdd_artifacts` row joined with `test_cases`, `turns`, `tdd_phases`, and `sessions` so the D2 evidence-binding context (test_case_created_turn_at, test_case_authored_in_session, behavior_id, etc.) is reconstructed in one read. Consumed verbatim as the `CitedArtifact` input to the pure `validatePhaseTransition` function |
| `getCommitChanges(sha?)` (2.0.0 final) | `CommitChangesEntry[]` -- commit metadata joined with `run_changed_files`. When `sha` is provided, returns the entry for that single commit; when omitted, returns up to 20 most-recent commits ordered by `committed_at DESC`. Backs the `commit_changes` MCP tool |
| `listTddSessionsForSession(sessionId)` (2.0.0 final) | `TddSessionSummary[]` -- TDD sessions whose `agent_session_id` FK points at the given Claude Code session id. Used by the `tdd_session_resume` MCP tool to find a suitable open TDD session for the active conversation |

**`getManifest`:** resolves `cacheDir` (and the per-project
placeholders) from SQLite's own metadata via `PRAGMA database_list`,
picking the file path of the `"main"` database. In-memory databases
report an empty file path.

**Coverage fall-back:** `getCoverage` and `getFileCoverage` only
return `Option.none()` when both `file_coverage` and `coverage_trends`
are empty. The reporter only writes per-file rows for files below
threshold, so a passing project with full coverage produces zero
per-file rows; in that case the query falls back to
`coverage_trends` totals and returns a totals-only report.

**Key output types:**

`ProjectRunSummary`, `FlakyTest`, `PersistentFailure`, `TestError`,
`NoteRow`, `SettingsRow`, `TestListEntry`, `ModuleListEntry`,
`SuiteListEntry`, `SettingsListEntry`, `SessionDetail` (2.0.0-α),
`TurnSummary` (2.0.0-α), `TurnSearchOptions` (2.0.0-α),
`AcceptanceMetrics` (2.0.0-α), `SessionSummary` (2.0.0-β),
`FailureSignatureDetail` (2.0.0-β), `TddSessionDetail` (2.0.0-β),
`TddPhaseDetail` (2.0.0-β), `TddArtifactDetail` (2.0.0-β),
`HypothesisSummary` (2.0.0-β), `HypothesisDetail` (2.0.0-β),
`CurrentTddPhase` (2.0.0 final), `CitedArtifactRow` (2.0.0 final),
`CommitChangesEntry` (2.0.0 final),
`TddSessionSummary` (2.0.0 final) -- all defined in
`DataReader.ts`.

**Dependencies:**

- Depends on: `@effect/sql-sqlite-node` SqlClient
- Used by: CLI commands, MCP tools, HistoryTracker, AgentReporter

### Formatters

**Location:** `packages/shared/src/formatters/`

Pluggable output formatters implementing the `Formatter` interface.
Each formatter produces `RenderedOutput[]` with target, content, and
contentType fields.

**Files:**

- `types.ts` -- `Formatter`, `FormatterContext`, `RenderedOutput`
  interfaces
- `markdown.ts` -- structured console markdown with tiered output
  (green/yellow/red). Final wires the `osc8` utility into the
  failing-test header lines via a regex post-processor, gated on
  `target === "stdout"` AND `!ctx.noColor` so MCP responses never
  receive OSC-8 codes
- `gfm.ts` -- GitHub-Flavored Markdown for `GITHUB_STEP_SUMMARY`
- `json.ts` -- raw JSON output of AgentReport data
- `silent.ts` -- produces no output (database-only mode)
- `ci-annotations.ts` (2.0.0 final) -- emits GitHub Actions
  workflow command annotations of the form
  `::error file=<path>,line=<n>::<message>` per the GitHub Actions
  workflow-commands spec. Properly escapes `%`, `\n`, `\r` in
  the data segment and `:` and `,` in the property values. Auto-
  selected by `FormatSelectorLive` when `environment === "ci-github"`
  AND `executor === "ci"` (i.e. running inside the GitHub Actions
  runner, not when an agent on a developer machine queries from a
  GitHub Actions workspace). Registered in `OutputRendererLive`.
  The `OutputFormat` literal in `Common.ts` was extended from 4
  to 5 values to add `"ci-annotations"`. The
  `FormatSelector.select()` signature gained an optional
  `environment?: Environment` third parameter (backwards-compatible;
  only the `ci-github` branch consults it)

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

### XDG Path Resolution

**Locations:**

- `packages/shared/src/utils/resolve-data-path.ts` -- the headline
  `resolveDataPath(projectDir, options?)` orchestrator
- `packages/shared/src/utils/resolve-workspace-key.ts` --
  `resolveWorkspaceKey(projectDir)` walks `WorkspaceDiscovery` to
  find the root workspace and normalize its `name`
- `packages/shared/src/utils/normalize-workspace-key.ts` -- pure
  `normalizeWorkspaceKey(name)` (the path-segment normalizer)
- `packages/shared/src/layers/PathResolutionLive.ts` --
  `PathResolutionLive(projectDir)` composite layer

**Purpose:** Deterministic XDG-based DB path resolution. The path is a
function of workspace identity, not filesystem layout. Closes
[issue #39](https://github.com/spencerbeggs/vitest-agent-reporter/issues/39).
See Decision 31 in decisions.md for the design rationale.

**`resolveDataPath` precedence (highest first):**

1. `options.cacheDir` (programmatic). Used by the reporter's
   `ensureDbPath` short-circuit when `reporter.cacheDir` is set on
   the plugin or reporter -- skips the heavy XDG/workspace layer
   stack entirely (since `WorkspacesLive` eagerly scans lockfiles
   and walks the package graph at layer construction). Returns
   `<cacheDir>/data.db` after `mkdirSync(<cacheDir>, { recursive:
   true })`
2. `cacheDir` from `vitest-agent-reporter.config.toml`. Same shape:
   `<cacheDir>/data.db` after `mkdirSync`
3. `projectKey` from the same config TOML. Used as the
   `<workspaceKey>` segment under the XDG data root. Normalized via
   `normalizeWorkspaceKey`
4. Workspace name from the root `package.json` `name`, resolved via
   `resolveWorkspaceKey(projectDir)` -> `WorkspaceDiscovery` -> root
   `WorkspacePackage.name` -> `normalizeWorkspaceKey(name)`
5. Fail with `WorkspaceRootNotFoundError` (from `workspaces-effect`)
   if no root workspace is discoverable. **No silent fallback to a
   path hash**

The XDG data root is `AppDirs.ensureData` from `xdg-effect` with
`namespace: "vitest-agent-reporter"`. On systems with
`XDG_DATA_HOME` that resolves to
`$XDG_DATA_HOME/vitest-agent-reporter`; otherwise it falls back to
`~/.local/share/vitest-agent-reporter` per `xdg-effect`'s `AppDirs`
semantics. `ensureData` creates the directory if missing so
better-sqlite3 can open the DB without separately mkdir'ing the
parent.

**`normalizeWorkspaceKey` rules:**

1. Replace `/` with `__` so `@org/pkg` collapses to `@org__pkg`
   instead of introducing a subdirectory boundary
2. Replace any character outside `[A-Za-z0-9._@-]` with `_` (catches
   Windows-reserved chars, control chars, whitespace)
3. Collapse runs of underscores produced by step 2 (`_{3,}`) into
   `__` so the output stays compact

**`PathResolutionLive(projectDir)` composition:**

Merges three layers in one shot:

- `XdgLive(new AppDirsConfig({ namespace: "vitest-agent-reporter" }))`
  -- provides `AppDirs`
- `ConfigLive(projectDir)` -- provides
  `VitestAgentReporterConfigFile`
- `WorkspacesLive` from `workspaces-effect` -- provides
  `WorkspaceDiscovery` and `WorkspaceRoot`

Callers still need to provide `FileSystem` and `Path` (typically via
`NodeContext.layer` or `NodeFileSystem.layer`). All three runtime
packages use this composite when calling `resolveDataPath`.

### TOML Config File

**Locations:**

- `packages/shared/src/schemas/Config.ts` --
  `VitestAgentReporterConfig` schema
- `packages/shared/src/services/Config.ts` --
  `VitestAgentReporterConfigFile` typed `Context.Tag` and the
  `VitestAgentReporterConfigFileService` type alias
- `packages/shared/src/layers/ConfigLive.ts` --
  `ConfigLive(projectDir)` factory

**Purpose:** Optional `vitest-agent-reporter.config.toml` lets users
override the default XDG data location without code changes. Both
fields are optional. When the file is absent or both fields are
unset, `resolveDataPath` falls back to deriving the path from the
workspace's `package.json` `name`.

**Schema:**

```typescript
class VitestAgentReporterConfig extends Schema.Class<...>(...)({
  cacheDir: Schema.optional(Schema.String),
  projectKey: Schema.optional(Schema.String),
}) {}
```

- `cacheDir` -- absolute path overriding the entire data directory.
  Highest precedence after the programmatic option
- `projectKey` -- overrides the workspace key segment under the XDG
  data directory. Use this for the "two unrelated `my-app`s"
  collision case, or when you want a stable key independent of
  `name` changes

**Service tag:**

```typescript
type VitestAgentReporterConfigFileService =
  ConfigFileService<VitestAgentReporterConfig>;
const VitestAgentReporterConfigFile =
  ConfigFile.Tag<VitestAgentReporterConfig>("vitest-agent-reporter/Config");
```

**Live layer:** `ConfigLive(projectDir)` builds a `ConfigFile.Live`
with `TomlCodec` and `FirstMatch` strategy, chaining
`WorkspaceRoot` -> `GitRoot` -> `UpwardWalk` resolvers (each looking
for `vitest-agent-reporter.config.toml`). Resolvers anchor at
`projectDir` rather than `process.cwd()` so the plugin-spawned MCP
server sees the right config when invoked from elsewhere.

When no file is present, downstream callers use
`config.loadOrDefault(new VitestAgentReporterConfig({}))` to get an
empty config (both fields undefined) -- never an error.

### LoggerLive

**Location:** `packages/shared/src/layers/LoggerLive.ts`

**Purpose:** Effect-based structured logging layer factory. Provides
NDJSON logging to stderr plus optional file logging via `Logger.zip`.

**Configuration:**

- `logLevel`: `"Debug"`, `"Info"`, `"Warning"`, `"Error"`, `"None"`
  (default). Case-insensitive via the exported `resolveLogLevel()`
  helper
- `logFile`: optional NDJSON output path, resolved via the exported
  `resolveLogFile()` helper
- Environment variable fallback: `VITEST_REPORTER_LOG_LEVEL`,
  `VITEST_REPORTER_LOG_FILE`
- Uses `Logger.structuredLogger` for NDJSON; `Logger.zip` combines
  stderr + file loggers when `logFile` is set

**Usage:** `Effect.logDebug` calls on all 30+ DataStore/DataReader
methods provide comprehensive I/O tracing.

**Dependencies:**

- Depends on: `effect` (Logger, LogLevel)
- Used by: ReporterLive, CliLive, McpLive

### ensureMigrated

**Location:** `packages/shared/src/utils/ensure-migrated.ts`

**Purpose:** Process-level migration coordinator that ensures the
SQLite database at a given `dbPath` is migrated exactly once per
process before any reporter instance attempts to read or write.

**Background:** In multi-project Vitest configs, multiple
`AgentReporter` instances share the same `data.db`. On a fresh
database, two connections both starting deferred transactions and
then upgrading to write produced `SQLITE_BUSY` -- SQLite's busy
handler is not invoked for write-write upgrade conflicts in deferred
transactions. With migration serialized through this coordinator,
subsequent concurrent writes work normally under WAL mode plus
better-sqlite3's 5s `busy_timeout`. Decision 28 covers the rationale;
Decision 32 covers why `xdg-effect`'s `SqliteState.Live` is not
adopted as a replacement.

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
  `Map<string, Promise<void>>`. The cache lives on `globalThis`
  because Vite's multi-project pipeline can load this module under
  separate module instances within one process; a module-local Map
  would defeat the coordination
- Builds a one-shot Effect program that acquires `SqlClient` (forcing
  WAL mode and applying migrations) under `MigratorLayer`,
  `SqliteClient`, NodeContext, and `LoggerLive(logLevel, logFile)`,
  then runs it via `Effect.runPromise`
- Caches the in-flight promise by `dbPath`; concurrent calls share
  the same promise. Suppresses `unhandledRejection` on the cached
  reference; callers await the returned promise and handle rejection
  themselves

**Dependencies:**

- Depends on: `@effect/sql-sqlite-node` (SqliteClient, SqliteMigrator),
  `@effect/sql/SqlClient`, `@effect/platform-node/NodeContext`,
  `effect` (Effect, Layer), `LoggerLive`, `migrations/0001_initial`,
  (2.0.0-α) `migrations/0002_comprehensive`, (2.0.0-RC)
  `migrations/0003_idempotent_responses`, and (2.0.0 final)
  `migrations/0004_test_cases_created_turn_id`. Migrations are
  registered in order; `SqliteMigrator` runs unapplied entries on
  layer acquisition
- Used by: `AgentReporter.onTestRunEnd` (called via `await` before the
  main `Effect.runPromise`); errors are caught and printed via
  `formatFatalError` to stderr with an early return

### SQLite Migration & SQL Helpers

**Locations:**

- `packages/shared/src/migrations/0001_initial.ts` -- initial database
  migration (1.x; superseded on 2.0.0-α by `0002_comprehensive`'s
  drop-and-recreate)
- `packages/shared/src/migrations/0002_comprehensive.ts` (2.0.0-α) --
  drops every 1.x table and recreates the full schema with 15 new
  tables for session/turn logging, TDD lifecycle state, code-change
  context, hook execution, and stable failure signatures. Per
  Decision D9, this is the **last drop-and-recreate** migration;
  future migrations are ALTER-only
- `packages/shared/src/migrations/0003_idempotent_responses.ts`
  (2.0.0-RC) -- additive `CREATE TABLE mcp_idempotent_responses`
  (no DROP), composite PK `(procedure_path, key)`. D9-compliant
- `packages/shared/src/migrations/0004_test_cases_created_turn_id.ts`
  (2.0.0 final) -- additive ALTER on `test_cases` adding
  `created_turn_id INTEGER REFERENCES turns(id) ON DELETE SET NULL`
  plus an index. Required by D2 binding rule 1 (the validator
  joins through this column to resolve `test_case_created_turn_at`
  and `test_case_authored_in_session`). Tables count is unchanged
  -- still 41. D9-compliant
- `packages/shared/src/sql/rows.ts` -- Effect Schema `Schema.Struct`
  row definitions for SQLite query results
- `packages/shared/src/sql/assemblers.ts` -- assembler functions to
  reconstruct domain types from rows

**Migrations:** Both migrations register through `ensureMigrated`,
which feeds them to `@effect/sql-sqlite-node` `SqliteMigrator` (WAL
journal mode, foreign keys enabled). On 2.0.0-α, fresh databases run
both `0001_initial` (creates 1.x tables) and `0002_comprehensive`
(drops them and recreates the full 40-table layout) in order; the
first migration's tables exist only momentarily before the second
drops them.

**Tables (40 total + `notes_fts` FTS5 virtual table):**

The 25 1.x tables are recreated under `0002_comprehensive` with new
columns:

- `test_errors` adds `signature_hash TEXT REFERENCES
  failure_signatures(signature_hash) ON DELETE SET NULL`
- `stack_frames` adds `source_mapped_line INTEGER` and
  `function_boundary_line INTEGER`

The 15 new tables are: `sessions`, `turns`, `tool_invocations`,
`file_edits`, `hypotheses`, `commits`, `run_changed_files`,
`run_triggers`, `build_artifacts`, `tdd_sessions`,
`tdd_session_behaviors`, `tdd_phases`, `tdd_artifacts`,
`failure_signatures`, `hook_executions`. Highlights:

- **`sessions`** -- Claude Code conversations; `cc_session_id`
  unique, `agent_kind` CHECK in `('main', 'subagent')`, optional
  `parent_session_id` self-FK
- **`turns`** -- per-session turn log; `type` CHECK in
  `('user_prompt', 'tool_call', 'tool_result', 'file_edit',
  'hook_fire', 'note', 'hypothesis')`; `payload` is pre-stringified
  JSON validated against the `TurnPayload` Effect Schema by the
  forthcoming `record` CLI
- **`tool_invocations`**, **`file_edits`** -- per-turn detail tables
  fanning out from `turns`
- **`hypotheses`** -- agent hypotheses with `cited_test_error_id`
  and `cited_stack_frame_id` evidence FKs and a
  `validation_outcome` CHECK in
  `('confirmed', 'refuted', 'abandoned')` (or NULL while open)
- **`commits`**, **`run_changed_files`** -- code-change context for
  test runs
- **`run_triggers`** -- 1:1 with `test_runs`; `trigger` CHECK in
  `('cli', 'ide', 'ci', 'agent', 'pre-commit', 'watch')`
- **`build_artifacts`** -- captured `tsc`/`biome`/`eslint` output
  per run
- **`tdd_sessions`**, **`tdd_session_behaviors`**, **`tdd_phases`**,
  **`tdd_artifacts`** -- TDD session state. `tdd_phases.phase` has
  an 8-value CHECK (`spike`, `red`, `red.triangulate`, `green`,
  `green.fake-it`, `refactor`, `extended-red`,
  `green-without-red`). `tdd_artifacts.artifact_kind` CHECK in
  `('test_written', 'test_failed_run', 'code_written',
  'test_passed_run', 'refactor', 'test_weakened')`
- **`failure_signatures`** -- PK is the 16-char hash from
  `computeFailureSignature`; tracks `first_seen_run_id`,
  `first_seen_at`, `occurrence_count`
- **`hook_executions`** -- Vitest hook lifecycle; `hook_kind` CHECK
  in `('beforeAll', 'beforeEach', 'afterEach', 'afterAll')`; CHECK
  ensures at most one of test_module_id/test_suite_id/test_case_id
  is set
- **`notes_fts` (FTS5 virtual table)** -- recreated with the
  corrected trigger pattern: `BEFORE UPDATE` for the delete step
  (captures OLD values before the row is rewritten) and `AFTER
  UPDATE` for the insert step (with NEW values). The 1.x triggers
  used `AFTER UPDATE` for both, so the delete read the
  already-updated row and accumulated stale tokens

See [data-structures.md](./data-structures.md) for the navigational
table list and `packages/shared/src/migrations/0002_comprehensive.ts`
for the canonical DDL.

**SQL helpers:** `rows.ts` defines `Schema.Struct` row types for
every table including the new ones (`SessionRow`, `TurnRow`,
`ToolInvocationRow`, `FileEditRow`, `HypothesisRow`, `CommitRow`,
`RunChangedFileRow`, `RunTriggerRow`, `BuildArtifactRow`,
`TddSessionRow`, `TddSessionBehaviorRow`, `TddPhaseRow`,
`TddArtifactRow`, `FailureSignatureRow`, `HookExecutionRow`).
Assemblers join data from multiple tables to build `AgentReport`,
`CoverageReport`, and other composite types.

### Output Pipeline

**Location:** `packages/shared/src/layers/OutputPipelineLive.ts`
(composition), plus the five service tags and live layers in
`services/` and `layers/`.

**Purpose:** Five chained Effect services forming a pluggable output
pipeline that determines environment, executor role, output format,
detail level, and performs rendering.

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

### Failure History & Classification

**Locations:**

- `packages/shared/src/services/HistoryTracker.ts`
- `packages/shared/src/layers/HistoryTrackerLive.ts`
- `packages/shared/src/layers/HistoryTrackerTest.ts`
- `packages/shared/src/schemas/History.ts`
- `packages/shared/src/utils/classify-test.ts` -- pure
  `classifyTest()` function shared between live layer and CLI
  formatting

**Purpose:** Per-test failure persistence across runs and
classification-driven suggestions in console output. History rows are
stored in SQLite's `test_history` table; prior history is loaded via
`DataReader.getHistory()`.

**Key interface:**

```typescript
interface TestOutcome {
  fullName: string;
  state: "passed" | "failed";
}

// HistoryTracker.classify signature:
classify: (
  project: string,
  subProject: string | null,
  testOutcomes: ReadonlyArray<TestOutcome>,
  timestamp: string,
) => Effect<{ history, classifications }, DataStoreError>
```

The signature carries `project` and `subProject` (rather than a
`cacheDir`) so the history lookup matches the normalized
project-identity columns used everywhere else in the data layer.

**Classifications:**

- `new-failure` -- first failure (no prior history or prior run
  passed)
- `persistent` -- failed in two or more consecutive runs
- `flaky` -- mixed pass/fail across recent history
- `recovered` -- previously failed, now passing
- `stable` -- consistently passing

The live layer uses a 10-entry sliding window over the most recent
runs.

**Dependencies:**

- Depends on: DataReader service (to load prior history)
- Used by: AgentReporter (classification), CLI `history` command, MCP
  `test_history` tool

### Coverage (Thresholds, Baselines, Trends)

Three coordinated subsystems form the coverage data layer.

**Thresholds** -- `packages/shared/src/schemas/Thresholds.ts`,
`packages/reporter/src/utils/resolve-thresholds.ts`

Vitest-native coverage threshold parsing and resolution. The
`MetricThresholds`, `PatternThresholds`, and `ResolvedThresholds`
schemas define the shape; `resolveThresholds()` (in the reporter
package) parses Vitest's resolved coverage config into the typed form.

**Baselines** -- `packages/shared/src/schemas/Baselines.ts`

Auto-ratcheting coverage baselines that persist high-water marks per
metric. Stored in SQLite's `coverage_baselines` table. Read via
`DataReader.getBaselines()`, written via
`DataStore.writeBaselines()`.

**Trends** -- `packages/shared/src/schemas/Trends.ts`,
`packages/shared/src/utils/compute-trend.ts`

Per-project coverage trend tracking with a sliding window for
direction analysis over time. Stored in SQLite's `coverage_trends`
table. Read via `DataReader.getTrends()`, written via
`DataStore.writeTrends()`. `computeTrend()` is a pure function that
folds a new run's totals into the existing trend record, handles
target-change resets via hash comparison, and produces the next
`TrendEntry`.

### Utility Functions

**Location:** `packages/shared/src/utils/`

Pure utility functions that don't warrant Effect service wrapping.

| File | Purpose |
| ---- | ------- |
| `compress-lines.ts` | Converts `[1,2,3,5,10,11,12]` to `"1-3,5,10-12"` |
| `safe-filename.ts` | Sanitizes project names for cache file paths |
| `ansi.ts` | ANSI color helpers that no-op when `NO_COLOR` is set |
| `compute-trend.ts` | Coverage trend entry computation (see Coverage section) |
| `split-project.ts` | Splits `"project:subProject"` into `{ project, subProject }` for normalized SQLite storage |
| `classify-test.ts` | Pure classification function (see Failure History section) |
| `format-console.ts` | Legacy console formatter (delegates to markdown formatter, kept for backward compatibility) |
| `format-gfm.ts` | Legacy GFM formatter (delegates to gfm formatter, kept for backward compatibility) |
| `format-fatal-error.ts` | Formats fatal error output for unhandled reporter errors |
| `build-report.ts` | AgentReport builder with duck-typed Vitest interfaces |
| `detect-pm.ts` | Package manager detection (canonical Effect-aware version, see below) |
| `ensure-migrated.ts` | Process-level migration coordinator (see ensureMigrated section) |
| `normalize-workspace-key.ts` | Pure path-segment normalizer (see XDG Path Resolution) |
| `resolve-workspace-key.ts` | Workspace key resolver (see XDG Path Resolution) |
| `resolve-data-path.ts` | The `resolveDataPath` orchestrator (see XDG Path Resolution) |
| `function-boundary.ts` (2.0.0-α; β TS-aware) | `findFunctionBoundary(source, line)` returns `FunctionBoundary` or `null`. Parses via `acorn` extended with the `acorn-typescript` plugin (`Parser.extend(tsPlugin())`), `ecmaVersion: "latest"`, `sourceType: "module"`, `locations: true` -- so TS sources with type annotations, generics, decorators, and `as` casts now parse without throwing. Walks the AST for `FunctionDeclaration`, `FunctionExpression`, and `ArrowFunctionExpression` nodes whose `loc` range contains `line`, returning the **smallest** enclosing function's `{ line: start.line, name }`. Anonymous functions on a `VariableDeclarator` init borrow the declarator's name; otherwise the literal string `<anonymous>`. Returns `null` on parse error. **β closes α D10's deferred TS support:** the function-boundary coordinate is now stable for TS projects, not just JS |
| `failure-signature.ts` (2.0.0-α) | `computeFailureSignature(input)` returns a 16-char `sha256` of `error_name`, normalized assertion shape, top-frame function name, and line coord (joined by a pipe character). `normalizeAssertionShape` strips assertion literals to angle-bracketed type tags (`number`, `string`, `boolean`, `null`, `undefined`, `object`, `expr` — each wrapped in `<` and `>`) so unrelated literal changes don't perturb the signature. The line coord prefers `fb:` followed by the function-boundary line; falls back to `raw:` followed by `floor(line/10)*10` (10-line bucket) when the boundary is unknown, then `raw:?` if no raw line is supplied either |
| `validate-phase-transition.ts` (2.0.0-α) | Pure `validatePhaseTransition(ctx) => PhaseTransitionResult` encoding the three D2 evidence-binding rules: (1) cited test was authored in the current phase window AND in the current session, (2) the cited artifact's `behavior_id` matches the requested behavior when one is specified, (3) for `red→green` transitions, the cited test wasn't already failing on main (`test_first_failure_run_id === test_run_id`). Enforces the required artifact kind per transition (`red→green` needs `test_failed_run`; `green→refactor` and `refactor→red` need `test_passed_run`); all other transitions are evidence-free and accepted unconditionally (including `spike→red`, the entry point for every TDD cycle). Returns a discriminated union with either `{ accepted: true, phase }` or `{ accepted: false, phase, denialReason, remediation: { suggestedTool, suggestedArgs, humanHint } }`. `DenialReason` is one of `missing_artifact_evidence`, `wrong_source_phase`, `unknown_session`, `session_already_ended`, `goal_not_started`, `refactor_without_passing_run`, `evidence_not_in_phase_window`, `evidence_not_for_behavior`, `evidence_test_was_already_failing` |
| `hyperlink.ts` (2.0.0 final) | `osc8(url, label, { enabled })` returns a labeled OSC-8 escape sequence (`\x1b]8;;<url>\x1b\\<label>\x1b]8;;\x1b\\`) when enabled, plain text otherwise. Wired into `formatters/markdown.ts` via a regex post-processor that wraps test-file paths in failing-test header lines, gated on `target === "stdout"` AND `!ctx.noColor`. The MCP `triage_brief` and `wrapup_prompt` tools call the `format-triage` / `format-wrapup` shared lib generators directly (not the markdown formatter), so MCP responses never receive OSC-8 codes -- terminal hyperlinks are a CLI-and-stdout-only concern per W4 spec |

**Package manager detection:** The canonical detector lives at
`packages/shared/src/utils/detect-pm.ts` and is used by reporter and
CLI for run-command generation. A zero-deps inline copy (~20 lines)
ships at `plugin/bin/mcp-server.mjs` for the Claude Code plugin
loader -- the loader cannot import from the shared package because it
must run before the user has installed any dependencies, so the
duplication is intentional. Both implementations follow the same
detection order:

1. `packageManager` field in `package.json` (e.g.,
   `"pnpm@10.32.1"`)
2. Lockfile presence: `pnpm-lock.yaml` > `package-lock.json` >
   `yarn.lock` > `bun.lock`
3. Falls back to `null` (caller defaults to `npx`) in the shared
   utility, or `npm` in the loader

**`build-report.ts`:** Pure data transformation function that
converts Vitest `TestModule` / `TestCase` objects into an
`AgentReport`. No I/O. Uses duck-typed Vitest interfaces
(`VitestTestModule`, `VitestTestCase`, etc.) rather than importing
Vitest types directly, keeping the builder independent of the Vitest
runtime.

### Shared Lib Generators (2.0.0-RC)

**Location:** `packages/shared/src/lib/` (this directory is new in
RC)

A new sibling to `utils/`, `formatters/`, `services/`, `layers/`,
and `migrations/`. The distinguishing feature: each `lib/` module
is a **pure markdown generator** that runs with `E = never` (no
error channel) and is consumed verbatim by both a CLI subcommand
and an MCP tool. Where `formatters/` render `AgentReport` objects
into the test-run console output, `lib/` generators render
DataReader query results into agent-facing prompts (triage briefs,
wrap-up nudges).

| File | Purpose |
| ---- | ------- |
| `format-triage.ts` (2.0.0-RC) | Pure markdown generator powering the W3 orientation triage report. Reads `getRunsByProject()`, `listSessions()`, recent failure signatures from DataReader; emits a triage brief sized to `maxLines`. Options: `{ project?, maxLines?, since? }`. Uses `Effect.orElseSucceed` everywhere (not `Effect.either`) so the type signature carries `E = never` -- callers don't need to handle errors. Powers both the `triage` CLI subcommand and the `triage_brief` MCP tool. Also called by `session-start.sh` to emit `hookSpecificOutput.additionalContext` |
| `format-wrapup.ts` (2.0.0-RC) | Pure markdown generator powering the W5 interpretive prompt-injection nudges. Five `kind` variants: `stop` (Stop hook nudge), `session_end` (SessionEnd hook nudge), `pre_compact` (PreCompact compaction nudge), `tdd_handoff` (TDD orchestrator handoff), `user_prompt_nudge` (UserPromptSubmit-time nudge). The text-match logic for "is this a failure prompt?" lives in this generator (not in the hook scripts) so all consumers see the same rules. Powers the `wrapup` CLI subcommand, the `wrapup_prompt` MCP tool, and the four interpretive hooks |

---

## CLI package (vitest-agent-reporter-cli)

On-demand test landscape queries for LLM agents. Reads cached test
data from SQLite database and project structure. Does not run tests
or call AI providers. All commands support `--format` flag for output
format selection.

**npm name:** `vitest-agent-reporter-cli`
**bin:** `vitest-agent-reporter`
**Location:** `packages/cli/`
**Entry:** `packages/cli/src/bin.ts`
**Internal dependencies:** `vitest-agent-reporter-shared`

**Why a separate package:** Independent versioning, smaller install
footprint for users who only want the CLI bin without the reporter or
the MCP server, and clear ownership of `@effect/cli` (which the
reporter doesn't need at runtime).

The reporter package declares the CLI as a required `peerDependency`
so installing the reporter pulls the CLI along with it.

### CLI Bin & Commands

**Files:**

- `packages/cli/src/bin.ts` -- bin entry point. Resolves `dbPath` via
  `resolveDataPath(process.cwd())` under
  `PathResolutionLive(projectDir) + NodeContext.layer`, then provides
  `CliLive(dbPath, logLevel, logFile)` to the `@effect/cli`
  `Command.run` effect. Handles defects by printing
  `formatFatalError(cause)` to stderr. β registers the `record`
  subcommand alongside the existing seven; RC additionally
  registers `triage` and `wrapup`. Final extends the `record`
  subcommand with two more actions (`tdd-artifact` and
  `run-workspace-changes`)
- `packages/cli/src/index.ts` -- public `runCli()` re-export
- `packages/cli/src/commands/{status,overview,coverage,history,trends,cache,doctor,record,triage,wrapup}.ts`
  -- one file per subcommand, each a thin wrapper over the matching
  `lib/*.ts` function. β adds `record.ts` (top-level command that
  dispatches to `record-turn` / `record-session-start` /
  `record-session-end` subcommands). RC adds `triage.ts` and
  `wrapup.ts` (each delegating to the `format-triage` /
  `format-wrapup` shared lib generators) and adds the `prune`
  action to `cache.ts`. Final extends `record.ts` with two more
  dispatched subcommands: `record tdd-artifact` and
  `record run-workspace-changes`
- `packages/cli/src/lib/format-{status,overview,coverage,history,trends,doctor}.ts`
  -- testable pure formatting logic for the read-side commands
- `packages/cli/src/lib/record-turn.ts` (2.0.0-β) --
  `parseAndValidateTurnPayload` validates the JSON-stringified
  payload against the α `TurnPayload` Effect Schema discriminated
  union (decoding through `Schema.decodeUnknown`); `recordTurnEffect`
  resolves the session via `DataReader.getSessionByCcId` and writes
  the turn via `DataStore.writeTurn` (omitting `turnNo` to take
  advantage of β's auto-assignment in the live layer)
- `packages/cli/src/lib/record-session.ts` (2.0.0-β) --
  `recordSessionStart` calls `DataStore.writeSession` with
  cc_session_id / agent_kind / project / cwd / started_at;
  `recordSessionEnd` calls `DataStore.endSession` with
  cc_session_id / ended_at / end_reason
- `packages/cli/src/lib/record-tdd-artifact.ts` (2.0.0 final) --
  resolves the TDD session for the active Claude Code session,
  fetches the current open phase via
  `DataReader.getCurrentTddPhase`, and calls
  `DataStore.writeTddArtifact` with the parsed CLI args. The lib
  function is the only artifact-write path per Decision D7
- `packages/cli/src/lib/record-run-workspace-changes.ts`
  (2.0.0 final) -- decodes the `RunChangedFile[]` JSON arg via
  Effect Schema, calls `DataStore.writeCommit` (idempotent on
  `sha`), then `DataStore.writeRunChangedFiles` with the parsed
  changes. Hooks pre-stringify the file list before invoking

**Commands:**

- `status` -- reads DB via DataReader, shows per-project pass/fail
  state with re-run commands
- `overview` -- test landscape summary with file-to-test mapping,
  project discovery, and run commands
- `coverage` -- coverage gap analysis from cached reports
- `history` -- surfaces flaky tests, persistent failures, and
  recovered tests with pass/fail run visualization
- `trends` -- per-project coverage trend display with direction,
  metrics table, and trajectory sparkline
- `cache path` -- prints the deterministic XDG-derived path (via
  `resolveDataPath`) rather than scanning the filesystem
- `cache clean` -- deletes entire cache directory (idempotent)
- `cache prune --keep-recent <n>` (2.0.0-RC) -- W1 turn-history
  retention. Calls `DataStore.pruneSessions(n)` to find the cutoff
  at the `(n+1)`-th most recent session and deletes turn rows for
  older sessions (FK CASCADE handles `tool_invocations` and
  `file_edits`). Sessions rows themselves are retained -- only
  the turn log is pruned. Idempotent
- `doctor` -- cache health diagnostic
- `record turn` (2.0.0-β) -- accepts
  `--cc-session-id <id> <payload-json>`, validates the payload
  against `TurnPayload`, resolves the session, writes a turn row.
  Driven by the `user-prompt-submit-record.sh`,
  `pre-tool-use-record.sh`, `post-tool-use-record.sh`, and
  `pre-compact-record.sh` plugin hooks
- `record session-start` (2.0.0-β) -- accepts
  `--cc-session-id <id> --project <name> --cwd <path>` plus
  optional `--agent-kind` (defaults to `main`); writes a
  `sessions` row. Driven by the `session-start-record.sh` hook
- `record session-end` (2.0.0-β) -- accepts
  `--cc-session-id <id>` and optional `--end-reason`; updates
  `sessions.ended_at` / `sessions.end_reason`. Driven by the
  `session-end-record.sh` hook
- `triage` (2.0.0-RC) -- emits the W3 orientation triage brief
  via the shared `format-triage` generator. Accepts
  `--format <markdown|json>`, `--project <name>`, and
  `--max-lines <n>`. Driven by `session-start.sh`, which writes
  the output back to Claude Code as
  `hookSpecificOutput.additionalContext`. Also called manually
  by users to inspect orientation context
- `wrapup` (2.0.0-RC) -- emits the W5 wrap-up prompt via the
  shared `format-wrapup` generator. Accepts
  `--since <iso>`, `--cc-session-id <id>`, `--kind <variant>`
  (one of `stop`/`session_end`/`pre_compact`/`tdd_handoff`/
  `user_prompt_nudge`), `--user-prompt-hint <text>`, and
  `--format <markdown|json>`. Driven by the four interpretive
  hooks (`stop-record.sh`, `session-end-record.sh`,
  `pre-compact-record.sh`, `user-prompt-submit-record.sh`)
- `record tdd-artifact` (2.0.0 final) -- accepts
  `--cc-session-id <id> --artifact-kind <kind>` plus optional
  `--file-path`, `--test-case-id`, `--test-run-id`,
  `--test-first-failure-run-id`, `--diff-excerpt`, and
  `--recorded-at`. Resolves the active TDD phase (via
  `DataReader.getCurrentTddPhase`), then calls
  `DataStore.writeTddArtifact`. Per Decision D7, this CLI is
  the **only** path by which artifacts are written -- agents
  never call this directly. Driven by
  `post-tool-use-tdd-artifact.sh` (test_failed_run /
  test_passed_run / test_written / code_written) and
  `post-tool-use-test-quality.sh` (test_weakened)
- `record run-workspace-changes` (2.0.0 final) -- accepts
  `--sha <sha>` plus optional `--parent-sha`, `--message`,
  `--author`, `--committed-at`, `--branch`, `--project`, plus a
  positional `'<files-json>'` containing the JSON-encoded
  `RunChangedFile[]` array. Calls `DataStore.writeCommit` (idempotent
  on `sha`) followed by `DataStore.writeRunChangedFiles`. Backs the
  `commit_changes` MCP read tool. Driven by the repo-scoped
  `post-tool-use-git-commit.sh` hook (which fires on every
  successful `git commit` / `git push`, regardless of agent kind)

**Dependencies:**

- Depends on: `vitest-agent-reporter-shared` for services + path
  resolution; `@effect/cli` for command framework;
  `@effect/platform-node` for `NodeContext` / `NodeRuntime`;
  `@effect/sql-sqlite-node` for `SqliteClient` / `SqliteMigrator`
- Used by: end users via the `vitest-agent-reporter` bin (installed
  alongside the reporter package as a required peer dependency)

### CliLive composition layer

**Location:** `packages/cli/src/layers/CliLive.ts`

**Signature:** `CliLive(dbPath: string, logLevel?, logFile?)`

**Composition:** `DataReaderLive`, `DataStoreLive` (β: required by
the `record` subcommand), `ProjectDiscoveryLive`,
`HistoryTrackerLive`, `OutputPipelineLive`, `SqliteClient`,
`Migrator`, `NodeContext`, `NodeFileSystem`, and `LoggerLive(...)`.
Used by the CLI bin via `NodeRuntime.runMain`.

---

## MCP package (vitest-agent-reporter-mcp)

Model Context Protocol server providing 41 tools for agent
integration (24 from Phase 5/6 plus 7 new read-only β tools over
α's session/turn/TDD/hypothesis/failure-signature schema substrate
plus 4 RC tools: `triage_brief`, `wrapup_prompt`,
`hypothesis_record`, `hypothesis_validate` -- the latter two
routed through the tRPC idempotency middleware -- plus 6 final
tools: TDD lifecycle reads/writes `tdd_session_start`,
`tdd_session_end`, `tdd_session_resume`,
`decompose_goal_into_behaviors`, `tdd_phase_transition_request`,
plus the read-only `commit_changes`). Uses
`@modelcontextprotocol/sdk` with stdio transport and tRPC for
routing.

**npm name:** `vitest-agent-reporter-mcp`
**bin:** `vitest-agent-reporter-mcp`
**Location:** `packages/mcp/`
**Entry:** `packages/mcp/src/bin.ts`
**Internal dependencies:** `vitest-agent-reporter-shared`

**Why a separate package:** Independent versioning is the headline
reason -- the MCP tool surface evolves on a different cadence than
the reporter and breaking MCP changes shouldn't force a reporter
major. Also: the MCP server's transitive dependency footprint
(MCP SDK, tRPC, zod) is large enough that users who don't run an MCP
server should not pay for it. The reporter declares
`vitest-agent-reporter-mcp` as a required `peerDependency` so it
gets installed alongside, but that gives lockfile-level version
coordination without bundling the dependency tree.

### MCP Server

**Entry point:** `packages/mcp/src/bin.ts` -- resolves the user's
`projectDir` via the precedence
`VITEST_AGENT_REPORTER_PROJECT_DIR` (set by the plugin loader) >
`CLAUDE_PROJECT_DIR` > `process.cwd()`. Then resolves `dbPath` via
`resolveDataPath(projectDir)` under
`PathResolutionLive(projectDir) + NodeContext.layer`, creates
`ManagedRuntime.make(McpLive(dbPath, logLevel, logFile))`, and calls
`startMcpServer({ runtime, cwd: projectDir })`.

**Files:**

- `bin.ts` -- bin entry (above)
- `index.ts` -- programmatic entry (callable by other tools)
- `context.ts` -- tRPC context definition with `ManagedRuntime`
  carrying DataReader, DataStore, ProjectDiscovery, OutputRenderer
  services. **(RC)** Now exports the underlying `t` instance
  (`middleware`, `router`, `publicProcedure`) so the
  idempotency middleware can share it rather than constructing a
  parallel `t`
- `router.ts` -- tRPC router aggregating all 41 tool procedures
  (24 from Phase 5/6 plus 7 read-only β additions plus 4 RC
  additions plus 6 final additions)
- `server.ts` -- `startMcpServer()` registers all tools with the MCP
  SDK using zod input schemas (the SDK side; tRPC inputs are also
  zod, kept in sync between the two registrations)
- `middleware/idempotency.ts` (2.0.0-RC) -- tRPC idempotency
  middleware (covered below)
- `layers/McpLive.ts` -- composition layer (covered below)

**Dependencies:**

- Depends on: `vitest-agent-reporter-shared` (for DataReader,
  DataStore, ProjectDiscovery, OutputRenderer, path resolution),
  `@modelcontextprotocol/sdk`, `@trpc/server`, `zod`,
  `@effect/platform-node`, `@effect/sql-sqlite-node`
- Used by: Claude Code plugin (via the inline `mcpServers` config in
  `plugin.json`, which spawns the bin through the user's package
  manager), and any MCP-compatible agent

### tRPC Router & Tools (41 tools)

**Locations:**

- `packages/mcp/src/router.ts`, `packages/mcp/src/context.ts`
- `packages/mcp/src/tools/` -- one file per tool
- `packages/mcp/src/middleware/idempotency.ts` (2.0.0-RC) --
  see the **Idempotency middleware** subsection

The tRPC router aggregates all 41 MCP tool procedures (24 from
Phase 5/6 plus 7 read-only β additions plus 4 RC additions plus
6 final additions). The context carries a `ManagedRuntime` for
Effect service access, allowing tRPC procedures to call Effect
services via `ctx.runtime.runPromise(effect)`.

**Context interface:**

```typescript
interface McpContext {
  readonly runtime: ManagedRuntime<
    DataReader | DataStore | ProjectDiscovery | OutputRenderer,
    never
  >;
  readonly cwd: string;
}
```

**Tool files (organized by category):**

- **Meta** (markdown output) -- `tools/help.ts` -> `help`
- **Read-only query** (markdown output) -- `tools/status.ts`,
  `tools/overview.ts`, `tools/coverage.ts`, `tools/history.ts`,
  `tools/trends.ts`, `tools/errors.ts`, `tools/test-for-file.ts`,
  `tools/test-get.ts`, `tools/file-coverage.ts`,
  `tools/cache-health.ts`, `tools/configure.ts` -> `test_status`,
  `test_overview`, `test_coverage`, `test_history`, `test_trends`,
  `test_errors`, `test_for_file`, `test_get`, `file_coverage`,
  `cache_health`, `configure`
- **Discovery** (markdown output) -- `tools/project-list.ts`,
  `tools/test-list.ts`, `tools/module-list.ts`,
  `tools/suite-list.ts`, `tools/settings-list.ts` -> `project_list`,
  `test_list`, `module_list`, `suite_list`, `settings_list`
- **Mutation** (text output) -- `tools/run-tests.ts` -> `run_tests`
  (executes `vitest run` via `spawnSync`)
- **Note CRUD** (markdown for list/search, JSON for
  create/get/update/delete) -- `tools/notes.ts` -> `note_create`,
  `note_list`, `note_get`, `note_update`, `note_delete`,
  `note_search`
- **Sessions / Turns / TDD reads (β)** (JSON output) --
  `tools/session-list.ts`, `tools/session-get.ts`,
  `tools/turn-search.ts`, `tools/failure-signature-get.ts`,
  `tools/tdd-session-get.ts`, `tools/hypothesis-list.ts`,
  `tools/acceptance-metrics.ts` -> `session_list`, `session_get`,
  `turn_search`, `failure_signature_get`, `tdd_session_get`,
  `hypothesis_list`, `acceptance_metrics`. Each procedure validates
  input with a zod schema, calls the matching `DataReader` method
  via `ctx.runtime.runPromise`, and returns JSON. All seven are
  read-only. Auto-allowed via
  `plugin/hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt`. The
  `help` tool (`tools/help.ts`) lists them under a
  "Sessions / Turns / TDD reads (β)" section
- **Triage / wrapup reads (RC)** (markdown output) --
  `tools/triage-brief.ts` -> `triage_brief({ project?,
  maxLines? })` and `tools/wrapup-prompt.ts` ->
  `wrapup_prompt({ sessionId?, ccSessionId?, kind?,
  userPromptHint? })`. Both delegate verbatim to the matching
  shared `format-triage` / `format-wrapup` generators in
  `packages/shared/src/lib/`, so the MCP and CLI surfaces share
  exactly the same output. Read-only; no idempotency middleware
  needed
- **Hypothesis writes (RC)** (JSON output) --
  `tools/hypothesis-record.ts` ->
  `hypothesis_record({ sessionId, content, citedTestErrorId?,
  citedStackFrameId?, createdTurnId? })` and
  `tools/hypothesis-validate.ts` ->
  `hypothesis_validate({ id, outcome, validatedAt,
  validatedTurnId? })`. Both go through `idempotentProcedure`
  (the new RC middleware), so duplicate calls from a flaky
  agent retry replay the cached response with
  `_idempotentReplay: true` rather than double-writing.
  Backed by `DataStore.writeHypothesis` and
  `DataStore.validateHypothesis` respectively. The
  per-procedure key derivers in `idempotencyKeys` are
  `${sessionId}:${content}` (record) and
  `${id}:${outcome}` (validate). Auto-allowed via the
  allowlist file. The `help` tool lists them under a new
  "Hypothesis writes (RC)" section
- **TDD lifecycle reads/writes (final)** (JSON output) --
  `tools/tdd-session-start.ts` ->
  `tdd_session_start({ goal, sessionId? | ccSessionId,
  parentTddSessionId?, startedAt? })` opens a TDD session
  (idempotent on `(sessionId, goal)`);
  `tools/tdd-session-end.ts` ->
  `tdd_session_end({ tddSessionId, outcome, summaryNoteId? })`
  closes one (idempotent on `(tddSessionId, outcome)`);
  `tools/tdd-session-resume.ts` -> `tdd_session_resume({ id })`
  is read-only and returns a markdown digest of an open TDD
  session;
  `tools/decompose-goal-into-behaviors.ts` ->
  `decompose_goal_into_behaviors({ tddSessionId, goal })`
  splits the goal into atomic behaviors via simple text
  heuristics (idempotent on `(tddSessionId, goal)`);
  `tools/tdd-phase-transition-request.ts` ->
  `tdd_phase_transition_request({ tddSessionId, requestedPhase,
  citedArtifactId, behaviorId?, reason? })` is the headline
  write -- it reads the current phase via
  `DataReader.getCurrentTddPhase`, the cited artifact context
  via `DataReader.getTddArtifactWithContext`, runs the pure
  `validatePhaseTransition` validator, and on accept calls
  `DataStore.writeTddPhase` (which closes the prior phase and
  opens the new one in the same SQL transaction). On deny,
  returns the `{ accepted: false, denialReason, remediation }`
  shape verbatim. **Not** registered for idempotency replay --
  see Phase 10 / final notes in decisions.md (the accept/deny
  is a deterministic function of artifact-log state at request
  time, so identical inputs at different times can legitimately
  produce different results)
- **Workspace history reads (final)** (JSON output) --
  `tools/commit-changes.ts` -> `commit_changes({ sha? })`
  returns commit metadata + `run_changed_files` joined view.
  When `sha` is provided, returns the entry for that single
  commit; when omitted, returns up to 20 most-recent commits.
  Read-only; backed by `DataReader.getCommitChanges`. Driven
  by the workspace-history rows the
  `post-tool-use-git-commit.sh` plugin hook writes via the
  `record run-workspace-changes` CLI subcommand. The `help`
  tool lists `commit_changes` under a new "Workspace history
  (final)" section

The 6 final tools bring the total to 41. Of the 6, 5 are
mutations and 1 is read-only. Idempotency-key registry on
final has 5 entries: `hypothesis_record`, `hypothesis_validate`
(both RC), plus `tdd_session_start`, `tdd_session_end`, and
`decompose_goal_into_behaviors` (all final).
`tdd_phase_transition_request` is intentionally **not** in the
registry -- see Phase 10 / final notes in decisions.md. The
`help` tool's tool count moves from 35 (RC) to 41 (final) and
the help text gains "TDD lifecycle (final)" and "Workspace
history (final)" sections.

**Project handling in discovery tools:** `module_list`, `suite_list`,
and `test_list` enumerate every project from
`DataReader.getRunsByProject()` when `project` is unspecified,
grouping output under per-project `### project` headers. This is
required because real multi-project Vitest configs use names like
`unit` and `integration` -- there is no literal `"default"` project.

### Idempotency middleware (2.0.0-RC)

**Location:** `packages/mcp/src/middleware/idempotency.ts`

**Purpose:** tRPC middleware that wraps a mutation procedure and
makes duplicate calls a no-op at the database layer. An MCP agent
that retries a write tool (network blip, restarted client, partial
delivery) gets the cached result back instead of double-writing.

**Flow:**

1. Look up the input-derived key in
   `DataReader.findIdempotentResponse(procedurePath, key)`
2. If a cached `result_json` exists, parse it and return it as
   the procedure result with `_idempotentReplay: true` attached
   (so callers can distinguish replays for telemetry without
   the MCP tool surface changing)
3. Otherwise, call `next()` (the inner procedure), then persist
   the result via `DataStore.recordIdempotentResponse(...)` --
   `INSERT ... ON CONFLICT DO NOTHING` so a parallel insert race
   resolves to a no-op
4. Persistence errors are **swallowed** (best-effort) so a
   transient DB failure during the write step does not surface
   as a tool error to the agent. The cached row will simply
   not exist on the next call, and the procedure will run
   again -- worst case is two idempotent writes instead of
   one cache hit, which is acceptable

**Key concepts:**

- `idempotentProcedure` -- a drop-in for `publicProcedure`
  that has the middleware pre-applied. New mutation tools
  that should be idempotent declare with `idempotentProcedure`
  instead of `publicProcedure`
- `idempotencyKeys` -- a registry mapping procedure paths to
  per-procedure `derive(input) => string` functions. As of final
  registers 5 entries:
  `hypothesis_record` (key:
  `${input.sessionId}:${input.content}`),
  `hypothesis_validate` (key: `${input.id}:${input.outcome}`),
  `tdd_session_start` (key:
  `${input.sessionId}:${input.goal}`),
  `tdd_session_end` (key:
  `${input.tddSessionId}:${input.outcome}`), and
  `decompose_goal_into_behaviors` (key:
  `${input.tddSessionId}:${input.goal}`).
  `tdd_phase_transition_request` is intentionally **not**
  registered -- see Phase 10 / final notes in decisions.md.
  Adding a new idempotent tool means registering a derive
  function alongside the procedure
- The middleware uses the **same** tRPC instance as
  `publicProcedure` rather than constructing a parallel `t`,
  via the new `middleware` export from `context.ts`. Sharing
  the instance keeps the context type aligned and avoids the
  "two `t` objects, one per call site" trap

**Dependencies:**

- Depends on: `@trpc/server`, `DataStore`, `DataReader`,
  `Effect.runtime`
- Used by: `tools/hypothesis-record.ts`,
  `tools/hypothesis-validate.ts`, plus future RC+ idempotent
  mutations

### McpLive composition layer

**Location:** `packages/mcp/src/layers/McpLive.ts`

**Signature:** `McpLive(dbPath: string, logLevel?, logFile?)`

**Composition:** `DataReaderLive`, `DataStoreLive`,
`ProjectDiscoveryLive`, `OutputPipelineLive`, `SqliteClient`,
`Migrator`, `NodeContext`, `NodeFileSystem`, and `LoggerLive(...)`.
Used by the MCP server bin via `ManagedRuntime`.

---

## Claude Code Plugin (plugin/)

File-based Claude Code plugin providing MCP server auto-registration,
lifecycle hooks, skills, and commands for Vitest integration in
Claude Code sessions. The `plugin/` directory is **not** a pnpm
workspace -- it contains only static files (JSON, shell scripts,
markdown) consumed by Claude Code directly.

**Dependencies:**

- Depends on: a project-level install of `vitest-agent-reporter`
  (which in turn pulls `vitest-agent-reporter-mcp` via its required
  `peerDependency`). The MCP server is not bundled with the plugin
  because both packages depend on the shared package, which depends
  on `better-sqlite3` -- a native module that must match the user's
  platform/Node version
- Used by: Claude Code (automatic plugin discovery)

### Plugin manifest

**Location:** `plugin/.claude-plugin/plugin.json`

Plugin manifest (name, version, author) with inline `mcpServers`
configuration. Declares a `vitest-reporter` server with
`command: "node"` and
`args: ["${CLAUDE_PLUGIN_ROOT}/bin/mcp-server.mjs"]`.

### MCP loader script

**Location:** `plugin/bin/mcp-server.mjs`

Zero-deps Node script that detects the user's package manager and
spawns `vitest-agent-reporter-mcp` through it. Decision 30 in
decisions.md covers the loader rewrite; Decision 29 (the prior
`file://` import + `node_modules` walk approach) is retired.

**Behavior:**

1. Reads `process.env.CLAUDE_PROJECT_DIR` (or falls back to
   `process.cwd()`)
2. Detects the user's package manager via the `packageManager` field
   in `package.json` or by lockfile presence (`pnpm-lock.yaml`,
   `bun.lock`, `bun.lockb`, `yarn.lock`, `package-lock.json`;
   defaults to `npm`)
3. Spawns `<pm exec> vitest-agent-reporter-mcp` (`pnpm exec`,
   `npx --no-install`, `yarn run`, or `bun x`) with
   `stdio: "inherit"` and `cwd: projectDir`
4. Forwards `CLAUDE_PROJECT_DIR` through a new
   `VITEST_AGENT_REPORTER_PROJECT_DIR` env var so the spawned MCP
   subprocess sees the right project root (Claude Code does not
   reliably propagate `CLAUDE_PROJECT_DIR` to MCP server
   subprocesses)
5. Forwards exit code; on non-zero exit prints PM-specific install
   instructions (e.g. `pnpm add -D vitest-agent-reporter`,
   `npm install --save-dev vitest-agent-reporter`)
6. Re-raises termination signals on the parent so kill semantics
   propagate

The script imports only `node:child_process`, `node:fs`, and
`node:path` so it runs before the user has installed anything.

### Hooks (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd, PreCompact, SubagentStart, SubagentStop)

Hook configuration lives in `plugin/hooks/hooks.json`; scripts live
under `plugin/hooks/`. The β release added six `*-record.sh`
scripts driving the `record` CLI subcommand and registered three
new event types (UserPromptSubmit, SessionEnd, PreCompact). RC
adds the `Stop` event registration, rewrites `session-start.sh` to
fold in the β `session-start-record.sh` plus call the new
`triage` CLI, and upgrades three β record-only hooks to record +
interpretive prompt-injection nudges via the `wrapup` CLI.

- **SessionStart** -- `session-start.sh` injects test context
  into the session via bash. **(RC)** Rewritten to (a) call the
  new `triage` CLI and emit
  `hookSpecificOutput.additionalContext` with the triage
  markdown (or generic context fallback if the triage is empty),
  and (b) write the `sessions` row directly via
  `vitest-agent-reporter record session-start
  --triage-was-non-empty <bool> ...`. The β
  `session-start-record.sh` script is **deleted** -- its
  responsibility folds into `session-start.sh`. The duplicate
  `SessionStart` entry in `hooks.json` is removed
- **UserPromptSubmit (β; RC + nudge)** --
  `user-prompt-submit-record.sh` reads the prompt envelope and
  invokes `record turn` with a stringified `UserPromptPayload`
  JSON (validated against `TurnPayload` by the CLI). **(RC)**
  Upgraded from record-only to record + inject. After recording
  the turn, calls `wrapup --kind=user_prompt_nudge
  --user-prompt-hint <prompt>` and emits the result as
  `hookSpecificOutput.additionalContext`. The text-match logic
  for "is this a failure prompt?" lives in `format-wrapup`, not
  the hook
- **PreToolUse** -- `pre-tool-use-mcp.sh` matches
  `mcp__vitest-agent-reporter__.*`. Reads the PreToolUse envelope,
  strips the `mcp__vitest-agent-reporter__` prefix from `tool_name`,
  and emits a `permissionDecision: "allow"` JSON response when the
  remaining suffix appears in
  `hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt`. Tools not in
  the allowlist fall through to the standard permission prompt.
  5-second hook timeout. **(β)** Parallel `pre-tool-use-record.sh`
  invokes `record turn` with a `ToolCallPayload`. **Stays
  record-only on RC** -- it fires too often for prompt injection
  to be tolerable
- **Allowlist** -- `hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt`
  enumerates the auto-allow MCP tool entries (one operation
  suffix per line, with `#` comments for category headings: meta
  `help`; 11 read-only queries; 5 discovery tools; `run_tests`;
  6 note CRUD ops; **(β) 7 sessions/turns/TDD/hypothesis/metrics
  reads**; **(RC) 4 triage/wrapup/hypothesis tools**;
  **(final) 6 TDD lifecycle + commit_changes tools**). Entry
  count went from 35 (after RC) to 41 entries (after final --
  the 6 new entries match the 6 new MCP tools). The script
  strips blank lines and comments before exact matching
- **PostToolUse** -- `post-test-run.sh` runs on the Bash tool;
  detects test runs and triggers post-run actions. **(β)**
  Parallel `post-tool-use-record.sh` runs on **every** tool
  result and invokes `record turn` with a `ToolResultPayload`.
  For `Edit`/`Write`/`MultiEdit` tools it additionally invokes
  a second `record turn` with a `FileEditPayload` (lines
  added/removed, diff). **Stays record-only on RC** -- same
  reasoning as PreToolUse
- **Stop (RC -- new event)** -- `stop-record.sh`. Registered as
  the `Stop` hook in `hooks.json` for the first time on RC.
  Records a `hook_fire` turn AND injects a wrap-up nudge via
  `wrapup --kind=stop`. Output is emitted to Claude Code as
  `hookSpecificOutput.additionalContext`
- **SessionEnd (β; RC + nudge)** -- `session-end-record.sh`
  invokes `record session-end --cc-session-id ...
  [--end-reason ...]` so `sessions.ended_at` and
  `sessions.end_reason` get populated. **(RC)** Upgraded from
  record-only to record + inject. After recording, calls
  `wrapup --kind=session_end` and emits the result as
  `hookSpecificOutput.additionalContext`
- **PreCompact (β; RC + nudge)** -- `pre-compact-record.sh`
  invokes `record turn` with a `HookFirePayload` so the
  compaction event shows up in the turn log. **(RC)** Upgraded
  from record-only to record + inject. After recording, calls
  `wrapup --kind=pre_compact` and emits the result as
  `hookSpecificOutput.additionalContext`
- **SubagentStart (final -- new event)** --
  `subagent-start-tdd.sh`. Registered as the `SubagentStart`
  hook in `hooks.json` for the first time on final. Scoped to
  `agent_type='tdd-orchestrator'` -- fires only when the TDD
  orchestrator subagent starts. Writes the `sessions` row with
  `agent_kind='subagent'`, `agent_type='tdd-orchestrator'`,
  and `parent_session_id` set to the parent main-session id
- **SubagentStop (final -- new event)** --
  `subagent-stop-tdd.sh`. Registered as the `SubagentStop`
  hook in `hooks.json` for the first time on final. Scoped to
  `agent_type='tdd-orchestrator'`. Calls `record session-end`
  with `end_reason="subagent_stop"`, generates a
  `wrapup --kind=tdd_handoff` note, and records that note as
  a turn on the **parent** session so the main agent can pick
  up where the subagent left off
- **PreToolUse Bash gate (final, orchestrator-scoped)** --
  `pre-tool-use-bash-tdd.sh`. Matches the `Bash` tool when
  `agent_type='tdd-orchestrator'`. Blocks anti-patterns:
  `--update`, `-u`, `--reporter=silent`, `--bail`, `-t`,
  `--testNamePattern`, `*.snap` edits, and edits to
  `coverage.exclude` / `setupFiles` / `globalSetup` in
  vitest config files. Returns `permissionDecision: "deny"`
  JSON on match. Pairs with the iron-law system prompt of the
  orchestrator agent definition
- **PostToolUse TDD artifact (final, orchestrator-scoped)** --
  `post-tool-use-tdd-artifact.sh`. Scoped to the orchestrator.
  On Bash test runs: parses the test result and shells to
  `record tdd-artifact --artifact-kind=test_failed_run` or
  `test_passed_run` with the relevant FKs. On Edit/Write
  outcomes: shells to `record tdd-artifact
  --artifact-kind=test_written` (test-file edits) or
  `code_written` (source edits)
- **PostToolUse test quality (final, orchestrator-scoped)** --
  `post-tool-use-test-quality.sh`. Scoped to the orchestrator.
  Scans test-file edits for escape-hatch tokens (`it.skip`,
  `it.todo`, `it.fails`, `it.concurrent`, `.skipIf`,
  `.todoIf`, `test.skip`, `test.todo`, `test.fails`,
  `describe.skip`, `describe.todo`) and shells to `record
  tdd-artifact --artifact-kind=test_weakened` so the
  anti-pattern is captured for downstream metrics
- **PostToolUse git commit (final, repo-scoped)** --
  `post-tool-use-git-commit.sh`. **NOT scoped** to the
  orchestrator -- fires for all agents, on every successful
  `git commit` / `git push` Bash invocation. Parses git
  metadata (sha, parent, message, author, branch) and the
  changed-file list, then shells to `record
  run-workspace-changes`. Backs the `commit_changes` MCP
  read tool

### Agent definitions, slash commands, skills

**Agent definitions** -- `plugin/agents/`

- `tdd-orchestrator.md` (final) -- the TDD orchestrator
  subagent definition. Carries the iron-law system prompt
  (mandatory test-first loop, no escape hatches), the
  eight-state state machine matching α's
  `tdd_phases.phase` enum, the ~15-tool `tools:` array
  (read-only test-status MCP tools plus the TDD lifecycle
  write tools), and the 9 sub-skill primitives embedded
  inline (Decision D6). Frontmatter declares
  `agent_type: tdd-orchestrator`, which is what the
  W2 restricted-Bash hook (`pre-tool-use-bash-tdd.sh`),
  the SubagentStart/Stop hooks, and the artifact-recording
  hooks all match on

**Slash commands** -- `plugin/commands/`

- `setup.md` -- setup command (Phase 5d)
- `configure.md` -- configure command (Phase 5d)
- `tdd.md` (final) -- the `/tdd <goal>` slash command. Hands
  off to the TDD orchestrator subagent with the user's goal as
  the input

**Skills** -- `plugin/skills/`

- `tdd/SKILL.md` -- TDD workflow skill (Phase 5d, advisory)
- `debugging/SKILL.md` -- test debugging skill (Phase 5d)
- `configuration/SKILL.md` -- Vitest configuration skill (Phase 5d)
- `coverage-improvement/SKILL.md` -- coverage improvement
  skill (Phase 5d)
- `tdd-primitives/<9 dirs>/SKILL.md` (final, Decision D6) --
  the 9 sub-skill primitives the orchestrator embeds inline,
  also published as standalone Skill files for non-TDD
  reuse:
  - `interpret-test-failure/SKILL.md`
  - `derive-test-name-from-behavior/SKILL.md`
  - `derive-test-shape-from-name/SKILL.md`
  - `verify-test-quality/SKILL.md`
  - `run-and-classify/SKILL.md`
  - `record-hypothesis-before-fix/SKILL.md`
  - `commit-cycle/SKILL.md`
  - `revert-on-extended-red/SKILL.md`
  - `decompose-goal-into-behaviors/SKILL.md`

---

## Removed components

| Component | Replaced by | When |
| --------- | ----------- | ---- |
| CacheWriter (service) | DataStore | Phase 5 |
| CacheReader (service) | DataReader | Phase 5 |
| CacheWriterLive / CacheWriterTest | DataStoreLive / DataStoreTest | Phase 5 |
| CacheReaderLive / CacheReaderTest | DataReaderLive | Phase 5 |
| CacheError | DataStoreError | Phase 5 |
| AgentDetection (service) | EnvironmentDetector | Phase 5 |
| AgentDetectionLive / AgentDetectionTest | EnvironmentDetectorLive / EnvironmentDetectorTest | Phase 5 |
| `package/src/utils/format-console.ts` (Phase 1-4) | `packages/shared/src/formatters/markdown.ts` | Phase 5 |
| `package/src/utils/format-gfm.ts` (Phase 1-4) | `packages/shared/src/formatters/gfm.ts` | Phase 5 |
| `resolveDbPath` (artifact-probing in CLI) | `resolveDataPath` (XDG-derived) in shared | Phase 6 |
| Plugin `file://` import + `node_modules` walk loader | PM-detect + spawn `vitest-agent-reporter-mcp` | Phase 6 |
| Reporter `./mcp` subpath export | `vitest-agent-reporter-mcp` package + bin | Phase 6 |
