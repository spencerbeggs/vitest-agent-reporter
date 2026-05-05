---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-05-05
last-synced: 2026-05-05
completeness: 100
related:
  - ./architecture.md
  - ./decisions.md
  - ./data-structures.md
dependencies: []
---

# Components -- vitest-agent-reporter

Detailed descriptions of all system components, their responsibilities,
interfaces, and dependencies. This is the "Current State" reference for
the codebase, organized by package.

**Parent document:** [architecture.md](./architecture.md)

## How to read this document

The system ships as five pnpm workspaces under `packages/` plus a
file-based Claude Code plugin at `plugin/`. Each top-level section
covers one package; load only the section you need:

- **Agent package** -- the Vitest-API-aware code and the plugin:
  `AgentPlugin`, the internal `AgentReporter` Vitest-API class
  (which delegates rendering to a user-supplied
  `VitestAgentReporterFactory`), `CoverageAnalyzer`, `ReporterLive`,
  and the reporter-side utilities (`build-reporter-kit`,
  `route-rendered-output`, `process-failure`, `capture-env`,
  `capture-settings`, `resolve-thresholds`,
  `strip-console-reporters`)
- **Reporter package** -- named `VitestAgentReporterFactory`
  implementations only: `defaultReporter`, `markdownReporter`,
  `terminalReporter`, `jsonReporter`, `silentReporter`,
  `ciAnnotationsReporter`, `githubSummaryReporter`. No Vitest-API
  code
- **Shared package** -- the no-internal-deps base: schemas, services,
  layers, formatters, errors, migrations, utilities, XDG path stack,
  and the public reporter contract types (`contracts/reporter.ts`)
- **CLI package** -- `vitest-agent-reporter` bin and `CliLive`
- **MCP package** -- `vitest-agent-mcp` bin, tRPC router, 41
  tools, the tRPC idempotency middleware, and `McpLive`
- **Claude Code plugin** -- file-based plugin with the MCP loader,
  hooks, skills, commands, the TDD orchestrator agent definition,
  `/tdd` slash command, and 9 sub-skill primitives

The 11 Effect services are split: 10 services live in
`packages/sdk/src/services/` (Config, DataReader, DataStore,
DetailResolver, EnvironmentDetector, ExecutorResolver, FormatSelector,
HistoryTracker, OutputRenderer, ProjectDiscovery), plus CoverageAnalyzer
in the agent package -- 11 services in total.

---

## Agent package (vitest-agent-plugin)

The agent package owns everything Vitest-API-aware: the plugin, the
internal `AgentReporter` Vitest-lifecycle class, the
istanbul-aware `CoverageAnalyzer`, the reporter-side utilities, and
the kit-construction / output-routing helpers that bridge the plugin
to the user-supplied `VitestAgentReporterFactory`. The plugin owns
persistence, classification, baselines, trends, and Vitest lifecycle
wiring; rendering is delegated to whatever `VitestAgentReporter`(s)
the factory returns.

**npm name:** `vitest-agent-plugin`
**Location:** `packages/plugin/`
**Entry:** `packages/plugin/src/index.ts`
**Internal dependencies:** `vitest-agent-sdk`
**Required peer dependencies:** `vitest-agent-reporter` (for the
default reporter), `vitest-agent-cli`, `vitest-agent-mcp`,
`vitest >= 4.1.0`

### AgentPlugin

**Location:** `packages/plugin/src/plugin.ts`

**Purpose:** Vitest plugin that injects `AgentReporter` into the
reporter chain via the `configureVitest` hook. Manages environment
detection via EnvironmentDetector service, executor resolution via
ExecutorResolver, reporter chain manipulation, cache directory
resolution, coverage threshold/target resolution, and selection of
the user's `VitestAgentReporterFactory`.

**Responsibilities:**

- Uses `VitestPluginContext` from `vitest/node` for `configureVitest`
  hook typing, with `as unknown as` casts where Vitest types are too
  strict for config subset access. The hook is async (runs
  `Effect.runPromise` for environment detection)
- Detects environment via `EnvironmentDetector` (`agent-shell`,
  `terminal`, `ci-github`, `ci-generic`) and resolves executor via
  `ExecutorResolver` (`human`, `agent`, or `ci`)
- Resolves cache directory with two-step priority: explicit
  `reporter.cacheDir` option > `outputFile['vitest-agent']`
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
- Passes the user-supplied `reporterFactory` (defaulting to
  `defaultReporter` from `vitest-agent-reporter`) through to the
  internal `AgentReporter` so the factory is invoked once per run
  with the resolved `ReporterKit`
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

// Constructor option bag accepted by `agentPlugin()`. Extends
// AgentPluginOptions with the rendering-side hook.
interface AgentPluginConstructorOptions extends AgentPluginOptions {
  // Factory the plugin invokes once per run with the resolved
  // ReporterKit. Defaults to `defaultReporter` from
  // vitest-agent-reporter.
  reporterFactory?: VitestAgentReporterFactory;
}
```

**Naming note: `reporterFactory` (not `reporter`)** -- the existing
`AgentPluginOptions.reporter` field is a config bag carrying
`cacheDir` / `coverageThresholds` / `coverageTargets` /
`coverageConsoleLimit` / `includeBareZero` /
`githubSummaryFile` etc., so the constructor takes the rendering
hook as `reporterFactory`. A future cleanup may flatten the
`options.reporter` bag into top-level fields and free the name.

**Console reporters stripped in "own" mode (agent environment):**

`default`, `verbose`, `tree`, `dot`, `tap`, `tap-flat`,
`hanging-process`, `agent`. Custom reporters (class instances, file
paths) and non-console built-in reporters (`json`, `junit`, `html`,
`blob`, `github-actions`) are preserved.

**Dependencies:**

- Depends on: Vitest Plugin API (`configureVitest`, Vitest 3.1+),
  `AgentReporter`, EnvironmentDetector service, ExecutorResolver
  service, `stripConsoleReporters`,
  `VitestAgentReporterFactory` contract
- Used by: Consumer `vitest.config.ts`

### AgentReporter (internal Vitest-API class)

**Location:** `packages/plugin/src/reporter.ts`

**Purpose:** Internal Vitest Reporter that owns the Vitest lifecycle
hooks, runs persistence / classification / baseline / trend
computation, then **delegates rendering** to a user-supplied
`VitestAgentReporterFactory`. Outputs are routed by target via
`routeRenderedOutput`. Uses Effect services for database I/O,
coverage processing, failure history tracking, coverage
baselines/trends, and supporting pipeline services.

This class is internal — it is constructed by `AgentPlugin` and not
exported as a public API surface. Standalone reporter consumers go
through `vitest-agent-reporter`'s named factories.

**Lifecycle hooks:**

- **`async onInit(vitest)`** -- stores the `Vitest` instance and
  resolves `dbPath` via the XDG-based path stack. Holds
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
   the data. Before `writeErrors`, each error in the report passes
   through `processFailure(error, options)` (see **Reporter-side
   utilities** below) to source-map the top non-framework frame, run
   `findFunctionBoundary` on the resolved source, and call
   `computeFailureSignature`. The resulting `signatureHash` is
   upserted via `DataStore.writeFailureSignature()` (idempotent ON
   CONFLICT, increments `occurrence_count`); `writeErrors` then
   persists `test_errors.signature_hash` and the per-frame
   `stack_frames.source_mapped_line` / `function_boundary_line`
   columns by passing the `frames: StackFrameInput[]` array on
   `TestErrorInput`
5. Reads existing baselines via `DataReader.getBaselines()`, computes
   updated baselines, writes via `DataStore.writeBaselines()`. On
   full (non-scoped) runs, computes per-project trends via
   `computeTrend()` and writes via `DataStore.writeTrends()`
6. Reads trends back from DB and builds `trendSummary` for the
   `ReporterRenderInput` (direction, runCount, firstMetric)
7. **Render delegation:** resolves `env`, `executor`, `format`,
   `detail` via `EnvironmentDetector` / `ExecutorResolver` /
   `FormatSelector` / `DetailResolver` (the same SDK pipeline
   services as before). Aggregates `classifications` from all
   reports into a flat `Map<fullName, TestClassification>`. Builds a
   `ReporterKit` via `buildReporterKit(...)` (resolves `stdOsc8` as
   enabled when `!noColor && (env === "terminal" || env ===
   "agent-shell")`). Calls `opts.reporter(kit)` to obtain
   reporter(s); normalizes via `normalizeReporters()` to an array.
   Concatenates the `RenderedOutput[]` produced by each reporter's
   `render()` call. Routes each entry via `routeRenderedOutput(out,
   { githubSummaryFile? })` -- target `stdout` writes to
   `process.stdout`, `github-summary` appends to the configured
   summary file, `file` is a no-op pending future convention. **The
   standalone "shouldWriteGfm" path is removed**; the default
   reporter now produces a `github-summary` `RenderedOutput` as a
   normal entry under GitHub Actions

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

// Constructor option bag accepted by the internal reporter. Extends
// AgentReporterOptions with the rendering-side hook.
interface AgentReporterConstructorOptions extends AgentReporterOptions {
  // Factory the reporter invokes once per run with the resolved
  // ReporterKit. Defaults to `defaultReporter` from
  // vitest-agent-reporter.
  reporter?: VitestAgentReporterFactory;
}
```

**Dependencies:**

- Depends on: Vitest Reporter API (>= 4.1.0), DataStore, DataReader,
  CoverageAnalyzer, HistoryTracker, EnvironmentDetector,
  ExecutorResolver, FormatSelector, DetailResolver services,
  `@effect/platform` FileSystem, the reporter-side utilities below,
  and the `VitestAgentReporterFactory` contract from shared
- Used by: `AgentPlugin` (constructed and pushed onto the reporter
  chain)

### CoverageAnalyzer

**Location:** `packages/plugin/src/services/CoverageAnalyzer.ts`,
`packages/plugin/src/layers/CoverageAnalyzerLive.ts`,
`packages/plugin/src/layers/CoverageAnalyzerTest.ts`

**Purpose:** Effect service that processes istanbul `CoverageMap` data
with optional scoping. Provides `process` (full analysis) and
`processScoped` (filtered to tested source files) effects.

**Why it lives in the agent package:** only the plugin's lifecycle
class consumes istanbul `CoverageMap` data directly. CLI and MCP read
pre-processed coverage from SQLite via `DataReader`, so they never
need this service. The named reporter factories receive coverage as
part of `AgentReport` (a pure data structure) and have no istanbul
awareness either.

The implementation is a pure computation against duck-typed
`CoverageMap` interfaces -- no I/O, no native deps -- but it is the
only service that knows about istanbul's specific shape, so it stays
co-located with the lifecycle code that feeds it.

**Dependencies:**

- Depends on: Coverage schema, duck-typed istanbul `CoverageMap`
  interface
- Used by: AgentReporter (via ReporterLive)

### Reporter-side utilities

**Location:** `packages/plugin/src/utils/`

Pure utilities that only the plugin's lifecycle class calls. Anything
used by more than one runtime package lives in shared instead.

- `strip-console-reporters.ts` -- removes console reporters from
  Vitest's reporter chain, plus the `CONSOLE_REPORTERS` constant.
  Plugin-only
- `resolve-thresholds.ts` -- parses Vitest-native coverage thresholds
  format into `ResolvedThresholds`. Plugin and reporter-class both
  call it
- `capture-env.ts` -- captures relevant environment variables (CI,
  NODE_ENV, GITHUB_*, RUNNER_*) for settings storage
- `capture-settings.ts` -- captures Vitest config settings (pool,
  environment, timeouts, coverage provider, etc.) and computes a
  deterministic hash. The `SettingsInput` return type lives in
  `packages/sdk/src/services/DataStore.ts` so DataStore owns its
  full input contract without circular imports between agent and
  shared
- `process-failure.ts` -- per-error processing pipeline called from
  `AgentReporter.onTestRunEnd` before `DataStore.writeErrors`. Walks
  the Vitest stack frames on a `ReportError`, identifies the top
  non-framework frame (skipping `node:internal`, `node_modules/vitest/`,
  and other framework prefixes), source-maps it via the
  source-map-resolver fed from the test module, runs
  `findFunctionBoundary` on the resolved source, then calls
  `computeFailureSignature` with the parsed pieces. Returns
  `{ frames: StackFrameInput[], signatureHash: string }` so the
  reporter can pass `frames` and `signatureHash` straight into
  `DataStore.writeErrors` (via `TestErrorInput`) and
  `DataStore.writeFailureSignature`. Pure async function -- no
  Effect service wrapping
- `build-reporter-kit.ts` -- pure constructor that takes the
  resolved configuration plus the detected `Environment` and
  `noColor` flag and returns a `ReporterKit` (`{ config: ResolvedReporterConfig,
  stdEnv: Environment, stdOsc8: (url, label) => string }`). The
  pre-bound `stdOsc8` is enabled when `!noColor && (env ===
  "terminal" || env === "agent-shell")` and is a no-op (returns the
  bare label) otherwise. Called once per run by `AgentReporter`
  before invoking the user's factory
- `route-rendered-output.ts` -- dispatches a single `RenderedOutput`
  by its declared `target`. Targets: `stdout` -> `process.stdout`;
  `github-summary` -> append to `options.githubSummaryFile` (the
  resolved `process.env.GITHUB_STEP_SUMMARY` or the user override);
  `file` -> reserved (currently a no-op) pending a future convention
  for arbitrary on-disk artifacts. The plugin calls this once per
  entry returned by the reporter chain after concatenation

### ReporterLive composition layer

**Location:** `packages/plugin/src/layers/ReporterLive.ts`

**Signature:** `ReporterLive(dbPath: string, logLevel?, logFile?)`

**Purpose:** Composition layer used by `AgentReporter` via
`Effect.runPromise`. Merges the live layers the plugin's
lifecycle class needs from shared plus the agent-local
`CoverageAnalyzerLive`.

**Composition:** DataStoreLive + CoverageAnalyzerLive +
HistoryTrackerLive + OutputPipelineLive + DataReaderLive +
SqliteClient + Migrator + LoggerLive(...). Does not pull
`NodeContext` directly because `ensureMigrated` and `resolveDataPath`
provide their own platform layers earlier in the pipeline.

---

## Reporter package (vitest-agent-reporter)

The reporter package contains **named `VitestAgentReporterFactory`
implementations only** -- no Vitest-API code. Each named factory
returns a `VitestAgentReporter` whose `render()` method consumes the
plugin-provided `ReporterRenderInput` and emits one or more
`RenderedOutput` entries. The plugin (in `vitest-agent`) constructs
the kit and routes the outputs.

**npm name:** `vitest-agent-reporter`
**Location:** `packages/reporter/`
**Entry:** `packages/reporter/src/index.ts`
**Internal dependencies:** `vitest-agent-sdk`
**Required peer dependencies:** none of the runtime packages

This package is required as a peer dependency of `vitest-agent-plugin` so
the default reporter is always available; users who want only their
own custom reporter can still install just `vitest-agent` and pass
their own factory, but most consumers never import from this package
directly -- it ships the shipped-default that the plugin reaches for
when no `reporterFactory` is provided.

### Named reporter factories

**Location:** `packages/reporter/src/`

Each file exports a single `VitestAgentReporterFactory`. Every
factory wraps exactly one shared `Formatter` from
`packages/sdk/src/formatters/`, so the formatter library remains
the source of truth for content rendering. The factories add the
contract glue (`render(input) -> RenderedOutput[]`) and the
`FormatterContext` construction.

| File | Export | Wraps Formatter | RenderedOutput targets |
| ---- | ------ | --------------- | ---------------------- |
| `markdown.ts` | `markdownReporter` | `markdown` | `stdout` |
| `terminal.ts` | `terminalReporter` | `terminal` (plain text + optional ANSI/OSC-8) | `stdout` |
| `json.ts` | `jsonReporter` | `json` | `stdout` |
| `silent.ts` | `silentReporter` | `silent` | none (returns `[]`) |
| `ci-annotations.ts` | `ciAnnotationsReporter` | `ci-annotations` | `stdout` (GitHub Actions workflow commands) |
| `github-summary.ts` | `githubSummaryReporter` | `gfm` | `github-summary` (appended to the summary file by the plugin's router) |
| `default.ts` | `defaultReporter` | n/a (composes others) | varies (see below) |

**`defaultReporter` composition:** env-aware factory that returns an
**array** of reporters (leveraging the contract's
`VitestAgentReporter | ReadonlyArray<VitestAgentReporter>` return
shape). The primary reporter is selected from `kit.config.format`
(e.g. `markdown` -> `markdownReporter`, `json` -> `jsonReporter`,
`silent` -> `silentReporter`, etc.). When `kit.config.githubActions`
is true, `githubSummaryReporter` is added as a sidecar so the
GitHub Step Summary file gets a GFM appendix in addition to whatever
the primary reporter writes to stdout. The plugin concatenates the
`RenderedOutput[]` from each entry before routing.

**Why the default lives in `vitest-agent-reporter` and not in
`vitest-agent`:** the plugin owns the Vitest lifecycle and contract
glue; the reporter package owns the *opinions* about what output
goes where. Keeping the composition in the reporter package means
users who fork it (e.g. to add a JUnit sidecar or strip the GFM
output) can publish their own factory without touching the
plugin. See decisions.md for the rationale.

### `_kit-context.ts` helper

**Location:** `packages/reporter/src/_kit-context.ts`

Private helper that builds a `FormatterContext` (`detail`,
`noColor`, `coverageConsoleLimit`, `trendSummary`, `runCommand`,
`mcp`, `githubSummaryFile`) from a `ReporterKit` and the
`ReporterRenderInput`'s `trendSummary`. Shared by the named
factories so context construction stays consistent. The leading
underscore marks it as a non-exported implementation detail of this
package.

### Why "renderer-only" reporters

The contract is a single synchronous `render(input) -> RenderedOutput[]`
method. There is no Vitest-lifecycle awareness, no I/O, no Effect
service requirements. A "no-op" reporter is one line:
`() => ({ render: () => [] })`. Custom reporters can:

- Wrap a different formatter (e.g. SARIF, HTML, JUnit XML)
- Filter/transform `input.reports` before rendering
- Return multiple outputs from a single `render()` call (e.g.
  console summary plus a side-channel artifact written to `file`
  once that target ships)
- Compose multiple inner factories by returning an array

Returning an array models Vitest's own multi-reporter pattern
(`reporters: ['default', 'github-actions']`): each reporter handles
its own concern and the plugin concatenates their `RenderedOutput[]`
before routing. Persistence still runs exactly once per run -- the
plugin owns the Vitest lifecycle, and reporters never see Vitest
events directly.

**Dependencies:**

- Depends on: `vitest-agent-sdk` for `VitestAgentReporterFactory` /
  `VitestAgentReporter` / `ReporterKit` / `ReporterRenderInput`
  types and the shared `Formatter` implementations
- Used by: `vitest-agent` (the `defaultReporter` is the plugin's
  out-of-the-box choice when no `reporterFactory` is provided);
  end-user `vitest.config.ts` files when explicitly opting into a
  named factory

---

## Shared package (vitest-agent-sdk)

The no-internal-dependencies base package that the reporter, CLI, and
MCP packages all depend on. Owns the data layer, all shared services
and layers, formatters, error types, schemas, SQLite migrations, SQL
helpers, and the XDG path-resolution stack. Anything used by more than
one of the three runtime packages lives here. Anything used by exactly
one of them stays in that package.

**npm name:** `vitest-agent-sdk`
**Location:** `packages/sdk/`
**Entry:** `packages/sdk/src/index.ts`
**Internal dependencies:** none

**Key external dependencies:**

- `xdg-effect ^1.0.1` -- `AppDirs` namespace, `XdgLive` layer
- `config-file-effect ^0.2.0` -- `ConfigFile.Tag`, `ConfigFile.Live`,
  `TomlCodec`, `FirstMatch` strategy, `WorkspaceRoot` / `GitRoot` /
  `UpwardWalk` resolvers
- `workspaces-effect ^0.5.1` -- `WorkspacesLive`,
  `WorkspaceDiscovery`, `WorkspaceRoot`, `WorkspaceRootNotFoundError`
- `acorn ^8.16.0` -- AST parser used by `findFunctionBoundary` to
  identify the smallest enclosing function for a given source line.
  Enables stable failure signatures (Decision D10). `@types/acorn
  ^6.0.4` is the matching devDependency
- `acorn-typescript ^1.4.13` -- TypeScript plugin for acorn. Imported
  as the named `tsPlugin` export and applied via
  `Parser.extend(tsPlugin())` so `findFunctionBoundary` can parse
  the `.ts` source files Vitest stack frames source-map back to

Plus `effect`, `@effect/platform`, `@effect/platform-node`,
`@effect/sql`, `@effect/sql-sqlite-node`, `std-env`.

**Internal dependents:** the reporter, cli, and mcp packages (each via
`workspace:*`).

**External consumers:** none directly. Although the package is
published to npm so pnpm/npm/yarn can hoist it correctly, end users
install it transitively as a dependency of the reporter.

### Effect Services

**Location:** `packages/sdk/src/services/` (10 services). One
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

**Location:** `packages/sdk/src/layers/`

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

**Location:** `packages/sdk/src/errors/`

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
- **TddErrors** (`TddErrors.ts`) -- five `Data.TaggedError` types
  introduced in 2.0 for the goal/behavior CRUD surface. Each
  constructor sets a derived `message` via `Object.defineProperty`
  (matching the DataStoreError convention) so `Cause.pretty()`
  surfaces entity/id/reason instead of the default "An error has
  occurred":
  - `GoalNotFoundError({ id, reason })` — message `[goal not_found
    id=N] reason`. Raised by `getGoal`, `updateGoal`, `deleteGoal`,
    `listGoalsBySession`, and `tdd_phase_transition_request`'s new
    `goalId` pre-check
  - `BehaviorNotFoundError({ id, reason })` — raised by behavior
    CRUD and by `createBehavior` when a `dependsOnBehaviorIds`
    entry doesn't belong to the same goal
  - `TddSessionNotFoundError({ id, reason })` — raised by goal
    CRUD when the parent session id is unknown
  - `TddSessionAlreadyEndedError({ id, endedAt, outcome })` —
    raised when goal/behavior creation is attempted under a closed
    session. `outcome` is one of `"succeeded" | "blocked" |
    "abandoned"`
  - `IllegalStatusTransitionError({ entity, id, from, to,
    reason })` — closed-lifecycle violations on
    `pending → in_progress → done|abandoned`. `entity` is one of
    `"goal" | "behavior" | "session"`; the discriminator lets the
    MCP envelope's remediation hint point at the right recovery
    tool. Validation lives at the DataStore boundary (not in SQL
    triggers, which would surface as raw `SqlError`)

  All five errors are caught at the MCP boundary by the private
  `_tdd-error-envelope.ts` helper and surface as success-shape
  `{ ok: false, error: { _tag, ..., remediation: { suggestedTool,
  suggestedArgs, humanHint } } }` responses — matching the existing
  `tdd_phase_transition_request` `{ accepted: false, denialReason,
  remediation }` precedent. tRPC `TRPCError` envelopes are reserved
  for transport-level failures

### Schemas

**Location:** `packages/sdk/src/schemas/`

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
| `Config.ts` | `VitestAgentConfig` schema for the optional `vitest-agent.config.toml`. Both fields (`cacheDir?: string`, `projectKey?: string`) are optional. When absent, `resolveDataPath` falls back to deriving the path from the workspace's `package.json` `name` under the XDG data directory |
| `Tdd.ts` (2.0) | Application-level shapes for the three-tier hierarchy: `GoalStatus`/`BehaviorStatus` (`pending` \| `in_progress` \| `done` \| `abandoned`), `GoalRow`, `BehaviorRow`, `GoalDetail` (goal + nested behaviors), `BehaviorDetail` (behavior + parentGoal summary + dependencies). SQL row shapes (snake_case) live in `sql/rows.ts`; these are the camelCase API shapes |
| `ChannelEvent.ts` (2.0) | Discriminated union over the 13 progress events the orchestrator pushes to the main agent: `goals_ready`, `goal_added`, `goal_started`, `goal_completed` (with `behaviorIds[]`), `goal_abandoned`, `behaviors_ready`, `behavior_added`, `behavior_started`, `phase_transition`, `behavior_completed`, `behavior_abandoned`, `blocked`, `session_complete` (with `goalIds[]`). Also exports `BehaviorScopedEventTypes` — the subset whose `goalId`/`sessionId` the MCP server resolves server-side from `behaviorId` before forwarding the notification. `tdd_progress_push` validates payloads against this union |
| `turns/` | Discriminated `TurnPayload` union over seven payload schemas (`UserPromptPayload`, `ToolCallPayload`, `ToolResultPayload`, `FileEditPayload`, `HookFirePayload`, `NotePayload`, `HypothesisPayload`). Each is a `Schema.Struct` with a `type` literal discriminator. The `record` CLI validates the JSON-stringified payloads against this union before writing `turns.payload`. Re-exported from `index.ts` |

Istanbul duck-type interfaces remain as TypeScript interfaces, not
schemas.

### DataStore service

**Location:** `packages/sdk/src/services/DataStore.ts`,
`packages/sdk/src/layers/DataStoreLive.ts`,
`packages/sdk/src/layers/DataStoreTest.ts`

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
| `writeSession(input: SessionInput)` | inserts a Claude Code session row; returns `sessionId`. Carries `cc_session_id` (Claude Code session ID), `agent_kind` (`"main"` or `"subagent"`), optional `parent_session_id`, `triage_was_non_empty`, project/sub-project/cwd, and `started_at` |
| `writeTurn(input: TurnInput)` | inserts a turn-log row under a session and, for `file_edit` and `tool_result` payloads, fans out to per-turn detail tables in the same SQL transaction (via `sql.withTransaction`). Returns `turnId`. Caller pre-stringifies the payload JSON (validated against `TurnPayload` by the `record` CLI). Type discriminator is one of `user_prompt`, `tool_call`, `tool_result`, `file_edit`, `hook_fire`, `note`, `hypothesis`. `turn_no` is optional; the live layer computes `MAX(turn_no)+1` per session inside the same transaction when omitted. **Fanout behavior:** `file_edit` payloads now produce one `file_edits` row per turn (file_id resolved via `ensureFile(file_path)`, edit_kind / lines_added / lines_removed / diff carried from payload). `tool_result` payloads produce one `tool_invocations` row per turn (tool_name / result_summary / duration_ms / success carried from payload; `params_hash` is intentionally NULL pending future cross-reference of the matching `tool_call`'s `tool_input`). `tool_call`, `user_prompt`, `hypothesis`, `hook_fire`, and `note` payloads write only to `turns` (no fanout). Consumers requesting strict request/response pairing should note that `tool_invocations` rows derive from `tool_result` turns, **not** `tool_call` turns -- pair via `payload.tool_use_id` if needed |
| `writeFailureSignature(input: FailureSignatureWriteInput)` | idempotent upsert on `failure_signatures(signature_hash)`. New rows record `first_seen_run_id`, `first_seen_at`, `last_seen_at = first_seen_at`, and `occurrence_count = 1`; `ON CONFLICT(signature_hash) DO UPDATE` increments `occurrence_count` AND refreshes `last_seen_at` to the new sighting timestamp. Called by the reporter for each error `signatureHash` returned by `processFailure` |
| `endSession(ccSessionId, endedAt, endReason)` | updates `sessions.ended_at` and `sessions.end_reason` for a Claude Code session ID. Called by the `record session-end` CLI subcommand (driven by the `session-end-record.sh` plugin hook) |
| `recordIdempotentResponse(input: IdempotentResponseInput)` | `INSERT ... ON CONFLICT DO NOTHING` on `mcp_idempotent_responses(procedure_path, key)` so duplicate keys are no-ops. Backs the tRPC idempotency middleware's persist step. Persistence errors are swallowed by the middleware -- a transient DB failure must not surface as a tool error |
| `writeHypothesis(input: HypothesisInput)` | inserts a `hypotheses` row carrying `sessionId`, `content`, optional cited evidence FKs (`citedTestErrorId`, `citedStackFrameId`, `createdTurnId`), and returns the new id. Called by the `hypothesis_record` MCP tool |
| `validateHypothesis(input: ValidateHypothesisInput)` | updates `hypotheses.validation_outcome`, `validated_at`, `validated_turn_id` for an existing hypothesis id. Raises a `DataStoreError` when the hypothesis id is unknown so the MCP layer surfaces a meaningful error. Called by the `hypothesis_validate` MCP tool |
| `pruneSessions(keepRecent: number)` | finds the cutoff at the `(keepRecent+1)`-th most recent session by `started_at` and deletes turn rows for older sessions. FK CASCADE handles `tool_invocations` and `file_edits`. Sessions rows themselves are retained (only the turn history is pruned). Returns `{ affectedSessions, prunedTurns }` — `affectedSessions` is the count of sessions whose turn-log was dropped, NOT sessions deleted. Called by the `cache prune --keep-recent` CLI subcommand |
| `writeTddSession(input: TddSessionInput) -> number` | inserts a `tdd_sessions` row carrying the session's `goal`, `session_id` FK to `sessions(id)`, optional `parent_tdd_session_id` self-FK, and `started_at`. Returns the new id. Called by the `tdd_session_start` MCP tool. **Note:** the live column on `tdd_sessions` is `session_id` (not `agent_session_id`); the corresponding `TddSessionInput` field is `agentSessionId` for callsite clarity but maps to the `session_id` column |
| `endTddSession(input: EndTddSessionInput)` | closes a TDD session by updating `tdd_sessions.outcome` (one of `succeeded`/`blocked`/`abandoned`), `ended_at`, and optional `summary_note_id` FK. Called by the `tdd_session_end` MCP tool |
| `createGoal(input: CreateGoalInput) -> GoalRow` | **2.0.** Inserts a `tdd_session_goals` row using single-statement ordinal allocation (`INSERT ... SELECT COALESCE(MAX(ordinal), -1) + 1 ... WHERE session_id = ?`) so concurrent inserts under one session never collide without `BEGIN IMMEDIATE`. Pre-validates session exists and is not ended (`TddSessionNotFoundError`, `TddSessionAlreadyEndedError`). Called by `tdd_goal_create` |
| `getGoal(id) -> Option<GoalRow>` | **2.0.** Returns the goal row by id, or `Option.none()` |
| `updateGoal(input: UpdateGoalInput) -> GoalRow` | **2.0.** Flat patch update on a goal. Validates status transitions against the closed lifecycle `pending → in_progress → done\|abandoned` (terminal states cannot transition further) at the DataStore boundary, surfacing `IllegalStatusTransitionError` (entity: `"goal"`) on illegal transitions and `GoalNotFoundError` on missing id. Validation lives in `DataStoreLive`, not in SQL triggers — triggers would surface as raw `SqlError` and defeat the typed-error contract |
| `deleteGoal(id)` | **2.0.** Hard delete. Cascades to `tdd_session_behaviors`, `tdd_phases.behavior_id` (`ON DELETE CASCADE`), `tdd_artifacts.behavior_id`, and the junction-table dependency rows. The orchestrator is denied this tool by `pre-tool-use-tdd-restricted.sh`; main-agent calls fall through to the standard permission prompt |
| `listGoalsBySession(sessionId) -> GoalRow[]` | **2.0.** Returns all goals for a session, ordered by `ordinal`. Pre-validates session exists |
| `createBehavior(input: CreateBehaviorInput) -> BehaviorRow` | **2.0.** Inserts a `tdd_session_behaviors` row under a goal using the same single-statement ordinal allocation pattern. When `dependsOnBehaviorIds` is supplied, writes the matching rows into the `tdd_behavior_dependencies` junction table inside the same `sql.withTransaction`, with each id pre-validated to belong to the same goal (`BehaviorNotFoundError` otherwise). Pre-validates goal exists, goal status is not closed, and parent session is not ended. Called by `tdd_behavior_create` |
| `getBehavior(id) -> Option<BehaviorRow>` | **2.0.** Returns the behavior row by id, or `Option.none()` |
| `updateBehavior(input: UpdateBehaviorInput) -> BehaviorRow` | **2.0.** Flat patch update on a behavior. When `dependsOnBehaviorIds` is supplied, replaces the junction-table set for the behavior in one transaction. Status transitions validated against the same closed lifecycle (entity: `"behavior"`) |
| `deleteBehavior(id)` | **2.0.** Hard delete. Cascades to `tdd_phases.behavior_id`, `tdd_artifacts.behavior_id`, and dependency rows on both endpoints of the junction table. Orchestrator-denied via the restricted-tools hook |
| `listBehaviorsByGoal(goalId) -> BehaviorRow[]` | **2.0.** Behaviors for a goal, ordered by `ordinal`. Pre-validates goal exists |
| `listBehaviorsBySession(sessionId) -> BehaviorRow[]` | **2.0.** All behaviors across all goals for a session, joined via `tdd_session_goals` |
| `writeTddPhase(input: WriteTddPhaseInput) -> WriteTddPhaseOutput` | opens a new `tdd_phases` row (one of the 8 phase enum values per Decision D11) and **closes the prior open phase in the same SQL transaction** so the per-session phase ledger is always consistent. Called by `tdd_phase_transition_request` after the pure `validatePhaseTransition` validator accepts |
| `writeTddArtifact(input: WriteTddArtifactInput) -> number` | records an evidence artifact (`test_written` / `test_failed_run` / `code_written` / `test_passed_run` / `refactor` / `test_weakened`) under a `tdd_phases` row, with optional FKs into `test_cases`, `test_runs`, and `test_errors`. The live column on `tdd_artifacts` is `phase_id` (not `tdd_phase_id`); the `WriteTddArtifactInput` field is named `tddPhaseId` for callsite clarity but maps to the `phase_id` column. Returns the new id. Per Decision D7, called only by hooks (`record tdd-artifact` CLI subcommand), never by the agent |
| `writeCommit(input: WriteCommitInput)` | idempotent insert into `commits` (`ON CONFLICT(sha) DO NOTHING`) carrying sha / parent_sha / message / author / committed_at / branch. Called by the `record run-workspace-changes` CLI subcommand, which the `post-tool-use-git-commit.sh` hook drives on every successful `git commit` / `git push` |
| `writeRunChangedFiles(input: WriteRunChangedFilesInput)` | writes the per-run changed-file list into `run_changed_files`. Inputs carry the run/commit FK and an array of `RunChangedFile` rows (`{ filePath, changeKind }` where `changeKind` is one of 5 enum values). **Note:** `run_changed_files.run_id` is `NOT NULL` in the live schema. The `record run-workspace-changes` CLI auto-resolves the latest run id when the caller omits `testRunId`, so the input field is functionally optional at the CLI surface even though the column itself is required at the storage layer. Called alongside `writeCommit` from the `record run-workspace-changes` CLI |
| `backfillTestCaseTurns(ccSessionId: string) → Effect<number, DataStoreError>` | correlates `test_cases` with `turns` by suffix-matching `file_edits.path` against `test_modules.file_path` within a session, then populates `test_cases.created_turn_id` for any rows not yet linked. Uses `SELECT changes()` to return the count of affected rows. Called by the `record test-case-turns` CLI subcommand (driven by `post-tool-use-tdd-artifact.sh` and `post-test-run.sh`) to resolve BUG-2 (created_turn_id backfill) for the current session |

**Key input types:**

`TestRunInput`, `ModuleInput`, `TestCaseInput`, `TestErrorInput`,
`FileCoverageInput`, `SuiteInput`, `NoteInput`, **`SettingsInput`**,
`SessionInput`, `TurnInput`, **`StackFrameInput`**,
**`FailureSignatureWriteInput`**,
**`IdempotentResponseInput`**,
**`HypothesisInput`**,
**`ValidateHypothesisInput`**,
**`TddSessionInput`**,
**`EndTddSessionInput`**,
**`CreateGoalInput`** + **`UpdateGoalInput`**,
**`CreateBehaviorInput`** + **`UpdateBehaviorInput`** (2.0 — replace
the removed `TddBehaviorInput` / `WriteTddBehaviorsInput` /
`TddBehaviorOutput` triple alongside the deleted
`writeTddSessionBehaviors` method),
**`WriteTddPhaseInput`** + **`WriteTddPhaseOutput`**,
**`WriteTddArtifactInput`**,
**`WriteCommitInput`**,
**`RunChangedFile`** + **`WriteRunChangedFilesInput`**
-- all defined in `DataStore.ts`. Also re-exports **`Phase`**, **`ArtifactKind`**,
**`ChangeKind`**, **`GoalStatus`**, and **`BehaviorStatus`** literal types so
callers (CLI subcommands, MCP tools) can reference them without dipping into
`schemas/` directly. `SettingsInput` is owned by DataStore (rather than by
`utils/capture-settings.ts` in the plugin package, which produces values
matching this shape) to avoid a circular import path between plugin and sdk.

**`StackFrameInput`** -- shape attached to `TestErrorInput.frames` carrying
`function_name`, `file_path`, `raw_line`, `raw_column`, optional
`source_mapped_line`, and optional `function_boundary_line`. The live layer
pivots this into one row per frame in `stack_frames`.

**`FailureSignatureWriteInput`** -- the persistence-time shape
`{ signatureHash, firstSeenRunId, firstSeenAt }`. Distinct from
`failure-signature.ts`'s compute-time `FailureSignatureInput` (which carries
the un-hashed fields that are hashed *into* the signature). The `*WriteInput`
suffix mirrors the existing convention used for the other DataStore inputs.

**`TestErrorInput.signatureHash` and `.frames`** are both optional. When
`signatureHash` is provided, the live layer writes `test_errors.signature_hash`
(the FK to `failure_signatures`); when `frames` is provided, it writes one row
per frame to `stack_frames`.

**`IdempotentResponseInput`** -- `{ procedurePath, key, resultJson, createdAt }`.
Persisted via `recordIdempotentResponse`; the composite PK `(procedure_path, key)`
is what makes the `INSERT ... ON CONFLICT DO NOTHING` idempotent.

**`HypothesisInput`** -- `{ sessionId, content, citedTestErrorId?, citedStackFrameId?,
createdTurnId? }`. Used by `writeHypothesis`.

**`ValidateHypothesisInput`** -- `{ id, outcome, validatedAt, validatedTurnId? }`.
Used by `validateHypothesis`; `outcome` is one of `"confirmed" | "refuted" | "abandoned"`.

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

**Location:** `packages/sdk/src/services/DataReader.ts`,
`packages/sdk/src/layers/DataReaderLive.ts`

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
| `getSessionById(id)` | `Option<SessionDetail>` for a Claude Code session row |
| `searchTurns(options: TurnSearchOptions)` | `TurnSummary[]`; filters by `sessionId`, `type`, `since` (timestamp), and `limit` |
| `computeAcceptanceMetrics()` | `AcceptanceMetrics` -- four ratios from spec Annex A: phase-evidence integrity (red-before-code), compliance-hook responsiveness, orientation usefulness, anti-pattern detection rate. Each metric returns `{ total, <numerator>, ratio }` |
| `getSessionByCcId(ccSessionId)` | `Option<SessionDetail>` looked up by Claude Code session ID. Used by the `record turn` CLI to resolve the session before writing a turn |
| `listSessions(options: { project?, agentKind?, limit? })` | `SessionSummary[]` filtered by project and `agent_kind` (`"main"`/`"subagent"`). Default limit 50, ordered by `started_at DESC`. Backs the `session_list` MCP tool |
| `getFailureSignatureByHash(hash)` | `Option<FailureSignatureDetail>` -- the `failure_signatures` row (now including `lastSeenAt: string \| null` from migration `0005`) plus the up-to-10 most recent `test_errors` rows joined via `signature_hash`. Backs the `failure_signature_get` MCP tool |
| `getTddSessionById(id)` | `Option<TddSessionDetail>` -- the `tdd_sessions` row plus its `goals: GoalDetail[]` (each with nested `behaviors: BehaviorRow[]`) and `tdd_phases` (with nested `tdd_artifacts` per phase). Goals are materialized via a single batched IN-clause join from `tdd_session_goals` to `tdd_session_behaviors`. Pre-rolls every join so `tdd_session_get` returns the entire three-tier tree in one round-trip |
| `getGoalById(id)` | **2.0.** `Option<GoalDetail>` — the goal row + nested behaviors. Backs `tdd_goal_get` |
| `getGoalsBySession(sessionId)` | **2.0.** `GoalDetail[]` ordered by `ordinal` — every goal under the session, each with its behaviors. Backs `tdd_goal_list` |
| `getBehaviorById(id)` | **2.0.** `Option<BehaviorDetail>` — the behavior row + `parentGoal` summary + `dependencies: BehaviorRow[]` resolved via the `tdd_behavior_dependencies` junction table. Backs `tdd_behavior_get` |
| `getBehaviorsByGoal(goalId)` | **2.0.** `BehaviorRow[]` ordered by `ordinal`. Backs `tdd_behavior_list` (`scope: "goal"`) |
| `getBehaviorsBySession(sessionId)` | **2.0.** `BehaviorRow[]` joined across all goals for the session. Backs `tdd_behavior_list` (`scope: "session"`) |
| `getBehaviorDependencies(behaviorId)` | **2.0.** `BehaviorRow[]` — direct dependencies of a behavior (one-hop junction-table read; recursive walks are the caller's responsibility via SQL CTE) |
| `resolveGoalIdForBehavior(behaviorId)` | **2.0.** `Option<number>` — used by `tdd_progress_push` to resolve `goalId` (and transitively `sessionId` via the goals→sessions FK) server-side from a `behaviorId` for behavior-scoped channel events. Best-effort; returns `Option.none()` when the behavior has been deleted or never existed |
| `listHypotheses(options: { sessionId?, outcome?, limit? })` | `HypothesisSummary[]` filtered by `sessionId` and validation outcome. `outcome="open"` matches `validation_outcome IS NULL`; other values match the literal CHECK enum (`confirmed`/`refuted`/`abandoned`). Default limit 50 |
| `findIdempotentResponse(procedurePath, key)` | `Option<string>` -- the cached `result_json` for a given MCP procedure invocation, or `Option.none()` when no entry exists. Backs the tRPC idempotency middleware's cache check. The middleware's flow is `findIdempotentResponse -> next() -> recordIdempotentResponse` (see decisions.md) |
| `getCurrentTddPhase(tddSessionId)` | `Option<CurrentTddPhase>` -- the most-recent **open** `tdd_phases` row for a TDD session (the row whose `ended_at` is NULL). Used by `tdd_phase_transition_request` to identify the source phase for the validator and by `writeTddPhase` to know which prior phase to close in the same transaction |
| `getTddArtifactWithContext(artifactId)` | `Option<CitedArtifactRow>` -- a `tdd_artifacts` row joined with `test_cases`, `turns`, `tdd_phases`, and `sessions` so the D2 evidence-binding context (test_case_created_turn_at, test_case_authored_in_session, behavior_id, etc.) is reconstructed in one read. Consumed verbatim as the `CitedArtifact` input to the pure `validatePhaseTransition` function |
| `getCommitChanges(sha?)` | `CommitChangesEntry[]` -- commit metadata joined with `run_changed_files`. When `sha` is provided, returns the entry for that single commit; when omitted, returns up to 20 most-recent commits ordered by `committed_at DESC`. Backs the `commit_changes` MCP tool |
| `listTddSessionsForSession(sessionId)` | `TddSessionSummary[]` -- TDD sessions whose `agent_session_id` FK points at the given Claude Code session id. Used by the `tdd_session_resume` MCP tool to find a suitable open TDD session for the active conversation |
| `getLatestTestCaseForSession(ccSessionId: string) → Effect<Option<number>, DataStoreError>` | returns the `id` of the most-recent `test_cases` row linked to the session, resolved via the same suffix-match JOIN used by `backfillTestCaseTurns` (`file_edits.path` suffix against `test_modules.file_path`). Returns `Option.none()` when no test case has been linked yet. Called by the `record test-case-turns` CLI subcommand to resolve BUG-1 (test case id for artifact wiring) |

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
`SuiteListEntry`, `SettingsListEntry`, `SessionDetail`,
`TurnSummary`, `TurnSearchOptions`,
`AcceptanceMetrics`, `SessionSummary`,
`FailureSignatureDetail`, `TddSessionDetail`
(now extended with `goals: ReadonlyArray<GoalDetail>`),
`GoalDetail`, `BehaviorDetail` (the schemas live in
`packages/sdk/src/schemas/Tdd.ts`),
`TddPhaseDetail`, `TddArtifactDetail`,
`HypothesisSummary`, `HypothesisDetail`,
`CurrentTddPhase`, `CitedArtifactRow`,
`CommitChangesEntry`,
`TddSessionSummary` -- all defined in
`DataReader.ts`. `getLatestTestCaseForSession` returns
`Effect<Option<number>, DataStoreError>` inline (no named type).

**Dependencies:**

- Depends on: `@effect/sql-sqlite-node` SqlClient
- Used by: CLI commands, MCP tools, HistoryTracker, AgentReporter

### Formatters

**Location:** `packages/sdk/src/formatters/`

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
- `ci-annotations.ts` -- emits GitHub Actions
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

- `packages/sdk/src/utils/resolve-data-path.ts` -- the headline
  `resolveDataPath(projectDir, options?)` orchestrator
- `packages/sdk/src/utils/resolve-workspace-key.ts` --
  `resolveWorkspaceKey(projectDir)` walks `WorkspaceDiscovery` to
  find the root workspace and normalize its `name`
- `packages/sdk/src/utils/normalize-workspace-key.ts` -- pure
  `normalizeWorkspaceKey(name)` (the path-segment normalizer)
- `packages/sdk/src/layers/PathResolutionLive.ts` --
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
2. `cacheDir` from `vitest-agent.config.toml`. Same shape:
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
`namespace: "vitest-agent"`. On systems with
`XDG_DATA_HOME` that resolves to
`$XDG_DATA_HOME/vitest-agent`; otherwise it falls back to
`~/.local/share/vitest-agent` per `xdg-effect`'s `AppDirs`
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

- `XdgLive(new AppDirsConfig({ namespace: "vitest-agent" }))`
  -- provides `AppDirs`
- `ConfigLive(projectDir)` -- provides
  `VitestAgentConfigFile`
- `WorkspacesLive` from `workspaces-effect` -- provides
  `WorkspaceDiscovery` and `WorkspaceRoot`

Callers still need to provide `FileSystem` and `Path` (typically via
`NodeContext.layer` or `NodeFileSystem.layer`). All three runtime
packages use this composite when calling `resolveDataPath`.

### TOML Config File

**Locations:**

- `packages/sdk/src/schemas/Config.ts` --
  `VitestAgentConfig` schema
- `packages/sdk/src/services/Config.ts` --
  `VitestAgentConfigFile` typed `Context.Tag` and the
  `VitestAgentConfigFileService` type alias
- `packages/sdk/src/layers/ConfigLive.ts` --
  `ConfigLive(projectDir)` factory

**Purpose:** Optional `vitest-agent.config.toml` lets users
override the default XDG data location without code changes. Both
fields are optional. When the file is absent or both fields are
unset, `resolveDataPath` falls back to deriving the path from the
workspace's `package.json` `name`.

**Schema:**

```typescript
class VitestAgentConfig extends Schema.Class<...>(...)({
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
type VitestAgentConfigFileService =
  ConfigFileService<VitestAgentConfig>;
const VitestAgentConfigFile =
  ConfigFile.Tag<VitestAgentConfig>("vitest-agent/Config");
```

**Live layer:** `ConfigLive(projectDir)` builds a `ConfigFile.Live`
with `TomlCodec` and `FirstMatch` strategy, chaining
`WorkspaceRoot` -> `GitRoot` -> `UpwardWalk` resolvers (each looking
for `vitest-agent.config.toml`). Resolvers anchor at
`projectDir` rather than `process.cwd()` so the plugin-spawned MCP
server sees the right config when invoked from elsewhere.

When no file is present, downstream callers use
`config.loadOrDefault(new VitestAgentConfig({}))` to get an
empty config (both fields undefined) -- never an error.

### LoggerLive

**Location:** `packages/sdk/src/layers/LoggerLive.ts`

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

**Location:** `packages/sdk/src/utils/ensure-migrated.ts`

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
  (`Symbol.for("vitest-agent/migration-promises")`) of
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
  `migrations/0002_comprehensive`,
  `migrations/0003_idempotent_responses`,
  `migrations/0004_test_cases_created_turn_id`, and
  `migrations/0005_failure_signatures_last_seen_at`. Migrations are
  registered in order; `SqliteMigrator` runs unapplied entries on
  layer acquisition
- Used by: `AgentReporter.onTestRunEnd` (called via `await` before the
  main `Effect.runPromise`); errors are caught and printed via
  `formatFatalError` to stderr with an early return

### SQLite Migration & SQL Helpers

**Locations:**

- `packages/sdk/src/migrations/0001_initial.ts` -- initial database
  migration (1.x schema; superseded by `0002_comprehensive`'s
  drop-and-recreate)
- `packages/sdk/src/migrations/0002_comprehensive.ts` --
  drops every 1.x table and recreates the full schema with 15 new
  tables for session/turn logging, TDD lifecycle state, code-change
  context, hook execution, and stable failure signatures. Per
  Decision D9, this is the **last drop-and-recreate** migration;
  future migrations are ALTER-only
- `packages/sdk/src/migrations/0003_idempotent_responses.ts`
  -- additive `CREATE TABLE mcp_idempotent_responses`
  (no DROP), composite PK `(procedure_path, key)`. D9-compliant
- `packages/sdk/src/migrations/0004_test_cases_created_turn_id.ts`
  -- additive ALTER on `test_cases` adding
  `created_turn_id INTEGER REFERENCES turns(id) ON DELETE SET NULL`
  plus an index. Required by D2 binding rule 1 (the validator
  joins through this column to resolve `test_case_created_turn_at`
  and `test_case_authored_in_session`). Tables count is unchanged
  -- still 41. D9-compliant
- `packages/sdk/src/migrations/0005_failure_signatures_last_seen_at.ts`
  -- additive ALTER on `failure_signatures` adding
  `last_seen_at TEXT` (nullable) plus
  `idx_failure_signatures_last_seen ON failure_signatures(last_seen_at
  DESC)`. Completes the deferred recurrence-tracking semantic:
  `writeFailureSignature` now sets `last_seen_at = first_seen_at`
  on insert and refreshes it on the `ON CONFLICT(signature_hash)
  DO UPDATE` path alongside the existing `occurrence_count`
  increment, so consumers can sort/filter signatures by recency.
  Tables count is unchanged -- still 41. D9-compliant
- `packages/sdk/src/sql/rows.ts` -- Effect Schema `Schema.Struct`
  row definitions for SQLite query results
- `packages/sdk/src/sql/assemblers.ts` -- assembler functions to
  reconstruct domain types from rows

**Migrations:** All five migrations register through `ensureMigrated`,
which feeds them to `@effect/sql-sqlite-node` `SqliteMigrator` (WAL
journal mode, foreign keys enabled). Fresh databases run both
`0001_initial` (creates 1.x tables) and `0002_comprehensive`
(drops them and recreates the full 42-table layout) in order; the
first migration's tables exist only momentarily before the second
drops them. **2.0 note:** `0002_comprehensive` was modified in place
(rather than added as `0006`) to introduce the goal/behavior
hierarchy. The migration ledger has no content hash, so this edit
does not auto-replay on existing dev DBs — pre-2.0 dev databases
must be wiped on first pull (acceptable since the 2.0 XDG path
differs from 1.x and v2.0 has no production users yet). See
Decision D9 for the broader rationale.

**Tables (43 total + `notes_fts` FTS5 virtual table):**

The 25 1.x tables are recreated under `0002_comprehensive` with new
columns:

- `test_errors` adds `signature_hash TEXT REFERENCES
  failure_signatures(signature_hash) ON DELETE SET NULL`
- `stack_frames` adds `source_mapped_line INTEGER` and
  `function_boundary_line INTEGER`

The 17 new tables are: `sessions`, `turns`, `tool_invocations`,
`file_edits`, `hypotheses`, `commits`, `run_changed_files`,
`run_triggers`, `build_artifacts`, `tdd_sessions`,
`tdd_session_goals` (2.0), `tdd_session_behaviors` (reshaped in 2.0),
`tdd_behavior_dependencies` (2.0), `tdd_phases`, `tdd_artifacts`,
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
- **`tdd_sessions`**, **`tdd_session_goals`** (2.0),
  **`tdd_session_behaviors`** (reshaped in 2.0),
  **`tdd_behavior_dependencies`** (2.0 junction table),
  **`tdd_phases`**, **`tdd_artifacts`** -- TDD session state in the
  three-tier Objective→Goal→Behavior hierarchy. `tdd_phases.phase`
  has an 8-value CHECK (`spike`, `red`, `red.triangulate`, `green`,
  `green.fake-it`, `refactor`, `extended-red`,
  `green-without-red`). `tdd_artifacts.artifact_kind` CHECK in
  `('test_written', 'test_failed_run', 'code_written',
  'test_passed_run', 'refactor', 'test_weakened')`. Both
  `tdd_session_goals.status` and `tdd_session_behaviors.status`
  CHECK in `('pending', 'in_progress', 'done', 'abandoned')`. In 2.0,
  `tdd_phases.behavior_id` cascade was changed from `SET NULL` to
  `CASCADE` (delete = "this never existed"; abandon-via-status
  preserves evidence), and `tdd_artifacts` gained a `behavior_id`
  FK + index for behavior-scoped artifact queries
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
table list and `packages/sdk/src/migrations/0002_comprehensive.ts`
for the canonical DDL.

**SQL helpers:** `rows.ts` defines `Schema.Struct` row types for
every table including the new ones (`SessionRow`, `TurnRow`,
`ToolInvocationRow`, `FileEditRow`, `HypothesisRow`, `CommitRow`,
`RunChangedFileRow`, `RunTriggerRow`, `BuildArtifactRow`,
`TddSessionRow`, `TddSessionGoalRow` (2.0),
`TddSessionBehaviorRow` (reshaped in 2.0),
`TddBehaviorDependencyRow` (2.0), `TddPhaseRow`,
`TddArtifactRow`, `FailureSignatureRow`, `HookExecutionRow`). The
application-level shapes (camelCase: `GoalRow`, `BehaviorRow`,
`GoalDetail`, `BehaviorDetail`) live in
`packages/sdk/src/schemas/Tdd.ts`; the SQL row shapes are
snake-case Schema.Struct rows. Assemblers join data from multiple
tables to build `AgentReport`, `CoverageReport`, and other
composite types.

### Output Pipeline

**Location:** `packages/sdk/src/layers/OutputPipelineLive.ts`
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

- `packages/sdk/src/services/HistoryTracker.ts`
- `packages/sdk/src/layers/HistoryTrackerLive.ts`
- `packages/sdk/src/layers/HistoryTrackerTest.ts`
- `packages/sdk/src/schemas/History.ts`
- `packages/sdk/src/utils/classify-test.ts` -- pure
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

**Thresholds** -- `packages/sdk/src/schemas/Thresholds.ts`,
`packages/plugin/src/utils/resolve-thresholds.ts`

Vitest-native coverage threshold parsing and resolution. The
`MetricThresholds`, `PatternThresholds`, and `ResolvedThresholds`
schemas define the shape; `resolveThresholds()` (in the plugin
package) parses Vitest's resolved coverage config into the typed form.

**Baselines** -- `packages/sdk/src/schemas/Baselines.ts`

Auto-ratcheting coverage baselines that persist high-water marks per
metric. Stored in SQLite's `coverage_baselines` table. Read via
`DataReader.getBaselines()`, written via
`DataStore.writeBaselines()`.

**Trends** -- `packages/sdk/src/schemas/Trends.ts`,
`packages/sdk/src/utils/compute-trend.ts`

Per-project coverage trend tracking with a sliding window for
direction analysis over time. Stored in SQLite's `coverage_trends`
table. Read via `DataReader.getTrends()`, written via
`DataStore.writeTrends()`. `computeTrend()` is a pure function that
folds a new run's totals into the existing trend record, handles
target-change resets via hash comparison, and produces the next
`TrendEntry`.

### Utility Functions

**Location:** `packages/sdk/src/utils/`

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
| `function-boundary.ts` | `findFunctionBoundary(source, line)` returns `FunctionBoundary` or `null`. Parses via `acorn` extended with the `acorn-typescript` plugin (`Parser.extend(tsPlugin())`), `ecmaVersion: "latest"`, `sourceType: "module"`, `locations: true` -- so TS sources with type annotations, generics, decorators, and `as` casts now parse without throwing. Walks the AST for `FunctionDeclaration`, `FunctionExpression`, and `ArrowFunctionExpression` nodes whose `loc` range contains `line`, returning the **smallest** enclosing function's `{ line: start.line, name }`. Anonymous functions on a `VariableDeclarator` init borrow the declarator's name; otherwise the literal string `<anonymous>`. Returns `null` on parse error. The function-boundary coordinate is stable for TS projects |
| `failure-signature.ts` | `computeFailureSignature(input)` returns a 16-char `sha256` of `error_name`, normalized assertion shape, top-frame function name, and line coord (joined by a pipe character). `normalizeAssertionShape` strips assertion literals to angle-bracketed type tags (`number`, `string`, `boolean`, `null`, `undefined`, `object`, `expr` — each wrapped in `<` and `>`) so unrelated literal changes don't perturb the signature. The line coord prefers `fb:` followed by the function-boundary line; falls back to `raw:` followed by `floor(line/10)*10` (10-line bucket) when the boundary is unknown, then `raw:?` if no raw line is supplied either |
| `validate-phase-transition.ts` | Pure `validatePhaseTransition(ctx) => PhaseTransitionResult` encoding a source-phase guard plus the three D2 evidence-binding rules. **Source-phase guard (checked first):** requesting `green` from any phase other than `red`, `red.triangulate`, or `green.fake-it` returns `{ accepted: false, denialReason: "wrong_source_phase" }` with a remediation pointing at the missing `→red` step — e.g. `spike→green` and `refactor→green` are denied unconditionally; the orchestrator must enter `red` explicitly first. **Artifact-kind preconditions:** `red→green` requires `test_failed_run`; `green→refactor` and `refactor→red` require `test_passed_run`. **D2 binding rules (applied to evidence-bearing transitions only):** (1) **scoped to `test_failed_run` kind only** -- cited test was authored in the current phase window AND in the current session (authoring-window check does not apply to `test_passed_run` or other kinds, preventing spurious `evidence_not_in_phase_window` denials on `green→refactor` transitions), (2) the cited artifact's `behavior_id` matches the requested behavior when one is specified, (3) for `red→green` transitions, the cited test wasn't already failing on main (`test_first_failure_run_id === test_run_id`). All remaining transitions (e.g. `spike→red`, `red.triangulate→red`, `green.fake-it→refactor`, `refactor→red`) are evidence-free and return `{ accepted: true }` immediately. Returns a discriminated union with either `{ accepted: true, phase }` or `{ accepted: false, phase, denialReason, remediation: { suggestedTool, suggestedArgs, humanHint } }`. `DenialReason` is one of `missing_artifact_evidence`, `wrong_source_phase`, `unknown_session`, `session_already_ended`, `goal_not_started`, `refactor_without_passing_run`, `evidence_not_in_phase_window`, `evidence_not_for_behavior`, `evidence_test_was_already_failing` |
| `hyperlink.ts` | `osc8(url, label, { enabled })` returns a labeled OSC-8 escape sequence (`\x1b]8;;<url>\x1b\\<label>\x1b]8;;\x1b\\`) when enabled, plain text otherwise. Wired into `formatters/markdown.ts` via a regex post-processor that wraps test-file paths in failing-test header lines, gated on `target === "stdout"` AND `!ctx.noColor`. The MCP `triage_brief` and `wrapup_prompt` tools call the `format-triage` / `format-wrapup` shared lib generators directly (not the markdown formatter), so MCP responses never receive OSC-8 codes -- terminal hyperlinks are a CLI-and-stdout-only concern per W4 spec |

**Package manager detection:** The canonical detector lives at
`packages/sdk/src/utils/detect-pm.ts` and is used by reporter and
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

### Shared Lib Generators

**Location:** `packages/sdk/src/lib/`

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
| `format-triage.ts` | Pure markdown generator powering the W3 orientation triage report. Reads `getRunsByProject()`, `listSessions()`, recent failure signatures from DataReader; emits a triage brief sized to `maxLines`. Options: `{ project?, maxLines?, since? }`. Uses `Effect.orElseSucceed` everywhere (not `Effect.either`) so the type signature carries `E = never` -- callers don't need to handle errors. Powers both the `triage` CLI subcommand and the `triage_brief` MCP tool. Also called by `session-start.sh` to emit `hookSpecificOutput.additionalContext` |
| `format-wrapup.ts` | Pure markdown generator powering the W5 interpretive prompt-injection nudges. Five `kind` variants: `stop` (Stop hook nudge), `session_end` (SessionEnd hook nudge), `pre_compact` (PreCompact compaction nudge), `tdd_handoff` (TDD orchestrator handoff), `user_prompt_nudge` (UserPromptSubmit-time nudge). The text-match logic for "is this a failure prompt?" lives in this generator (not in the hook scripts) so all consumers see the same rules. Powers the `wrapup` CLI subcommand, the `wrapup_prompt` MCP tool, and the four interpretive hooks |

---

## CLI package (vitest-agent-cli)

On-demand test landscape queries for LLM agents. Reads cached test
data from SQLite database and project structure. Does not run tests
or call AI providers. All commands support `--format` flag for output
format selection.

**npm name:** `vitest-agent-cli`
**bin:** `vitest-agent`
**Location:** `packages/cli/`
**Entry:** `packages/cli/src/bin.ts`
**Internal dependencies:** `vitest-agent-sdk`

**Why a separate package:** Independent versioning, smaller install
footprint for users who only want the CLI bin without the reporter or
the MCP server, and clear ownership of `@effect/cli` (which the
reporter doesn't need at runtime).

The plugin package declares the CLI as a required `peerDependency`
so installing the plugin pulls the CLI along with it.

### CLI Bin & Commands

**Files:**

- `packages/cli/src/bin.ts` -- bin entry point. Resolves `dbPath` via
  `resolveDataPath(process.cwd())` under
  `PathResolutionLive(projectDir) + NodeContext.layer`, then provides
  `CliLive(dbPath, logLevel, logFile)` to the `@effect/cli`
  `Command.run` effect. Handles defects by printing
  `formatFatalError(cause)` to stderr. Registers `status`, `overview`,
  `coverage`, `history`, `trends`, `cache`, `doctor`, `record`,
  `triage`, and `wrapup` subcommands. The `record` subcommand
  dispatches to `turn`, `session-start`, `session-end`,
  `tdd-artifact`, `run-workspace-changes`, and `test-case-turns`
  actions
- `packages/cli/src/index.ts` -- public `runCli()` re-export
- `packages/cli/src/commands/{status,overview,coverage,history,trends,cache,doctor,record,triage,wrapup}.ts`
  -- one file per subcommand, each a thin wrapper over the matching
  `lib/*.ts` function. `record.ts` dispatches to `turn`,
  `session-start`, `session-end`, `tdd-artifact`,
  `run-workspace-changes`, and `test-case-turns`. `triage.ts` and
  `wrapup.ts` delegate to the `format-triage` / `format-wrapup`
  shared lib generators. `cache.ts` includes the `prune` action
- `packages/cli/src/lib/format-{status,overview,coverage,history,trends,doctor}.ts`
  -- testable pure formatting logic for the read-side commands
- `packages/cli/src/lib/record-turn.ts` --
  `parseAndValidateTurnPayload` validates the JSON-stringified
  payload against the `TurnPayload` Effect Schema discriminated
  union (decoding through `Schema.decodeUnknown`); `recordTurnEffect`
  resolves the session via `DataReader.getSessionByCcId` and writes
  the turn via `DataStore.writeTurn` (omitting `turnNo`; the live
  layer auto-assigns it via `MAX(turn_no)+1` per session)
- `packages/cli/src/lib/record-session.ts` --
  `recordSessionStart` calls `DataStore.writeSession` with
  cc_session_id / agent_kind / project / cwd / started_at;
  `recordSessionEnd` calls `DataStore.endSession` with
  cc_session_id / ended_at / end_reason
- `packages/cli/src/lib/record-tdd-artifact.ts` --
  resolves the TDD session for the active Claude Code session,
  fetches the current open phase via
  `DataReader.getCurrentTddPhase`, and calls
  `DataStore.writeTddArtifact` with the parsed CLI args. The lib
  function is the only artifact-write path per Decision D7
- `packages/cli/src/lib/record-run-workspace-changes.ts`
  -- decodes the `RunChangedFile[]` JSON arg via
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
- `cache prune --keep-recent <n>` -- W1 turn-history
  retention. Calls `DataStore.pruneSessions(n)` to find the cutoff
  at the `(n+1)`-th most recent session and deletes turn rows for
  older sessions (FK CASCADE handles `tool_invocations` and
  `file_edits`). Sessions rows themselves are retained -- only
  the turn log is pruned. Idempotent
- `doctor` -- cache health diagnostic
- `record turn` -- accepts
  `--cc-session-id <id> <payload-json>`, validates the payload
  against `TurnPayload`, resolves the session, writes a turn row.
  Driven by the `user-prompt-submit-record.sh`,
  `pre-tool-use-record.sh`, `post-tool-use-record.sh`, and
  `pre-compact-record.sh` plugin hooks
- `record session-start` -- accepts
  `--cc-session-id <id> --project <name> --cwd <path>` plus
  optional `--agent-kind` (defaults to `main`); writes a
  `sessions` row. Driven by the `session-start-record.sh` hook
- `record session-end` -- accepts
  `--cc-session-id <id>` and optional `--end-reason`; updates
  `sessions.ended_at` / `sessions.end_reason`. Driven by the
  `session-end-record.sh` hook
- `triage` -- emits the W3 orientation triage brief
  via the shared `format-triage` generator. Accepts
  `--format <markdown|json>`, `--project <name>`, and
  `--max-lines <n>`. Driven by `session-start.sh`, which writes
  the output back to Claude Code as
  `hookSpecificOutput.additionalContext`. Also called manually
  by users to inspect orientation context
- `wrapup` -- emits the W5 wrap-up prompt via the
  shared `format-wrapup` generator. Accepts
  `--since <iso>`, `--cc-session-id <id>`, `--kind <variant>`
  (one of `stop`/`session_end`/`pre_compact`/`tdd_handoff`/
  `user_prompt_nudge`), `--user-prompt-hint <text>`, and
  `--format <markdown|json>`. Driven by the four interpretive
  hooks (`stop-record.sh`, `session-end-record.sh`,
  `pre-compact-record.sh`, `user-prompt-submit-record.sh`)
- `record tdd-artifact` -- accepts
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
- `record run-workspace-changes` -- accepts
  `--sha <sha>` plus optional `--parent-sha`, `--message`,
  `--author`, `--committed-at`, `--branch`, `--project`, plus a
  positional `'<files-json>'` containing the JSON-encoded
  `RunChangedFile[]` array. Calls `DataStore.writeCommit` (idempotent
  on `sha`) followed by `DataStore.writeRunChangedFiles`. Backs the
  `commit_changes` MCP read tool. Driven by the repo-scoped
  `post-tool-use-git-commit.sh` hook (which fires on every
  successful `git commit` / `git push`, regardless of agent kind)
- `record test-case-turns` -- accepts `--cc-session-id <id>`. Calls
  `DataStore.backfillTestCaseTurns(ccSessionId)` to populate
  `test_cases.created_turn_id` for any rows in the session not yet
  linked (returns the count of updated rows as `updated`), then calls
  `DataReader.getLatestTestCaseForSession(ccSessionId)` to fetch the
  most-recent linked test case id (returns `latestTestCaseId`, or
  `null` when none). Outputs `{ "updated": N, "latestTestCaseId":
  <id|null> }` to stdout. Driven by `post-tool-use-tdd-artifact.sh`
  (before every `record tdd-artifact` call, so artifacts carry the
  correct `--test-case-id`) and by `post-test-run.sh` (best-effort,
  after `record run-trigger`, output ignored)

**Dependencies:**

- Depends on: `vitest-agent-sdk` for services + path
  resolution; `@effect/cli` for command framework;
  `@effect/platform-node` for `NodeContext` / `NodeRuntime`;
  `@effect/sql-sqlite-node` for `SqliteClient` / `SqliteMigrator`
- Used by: end users via the `vitest-agent` bin (installed
  alongside the plugin package as a required peer dependency)

### CliLive composition layer

**Location:** `packages/cli/src/layers/CliLive.ts`

**Signature:** `CliLive(dbPath: string, logLevel?, logFile?)`

**Composition:** `DataReaderLive`, `DataStoreLive`,
`ProjectDiscoveryLive`,
`HistoryTrackerLive`, `OutputPipelineLive`, `SqliteClient`,
`Migrator`, `NodeContext`, `NodeFileSystem`, and `LoggerLive(...)`.
Used by the CLI bin via `NodeRuntime.runMain`.

---

## MCP package (vitest-agent-mcp)

Model Context Protocol server providing 50 tools for agent
integration via tRPC router. Tools cover read-only queries,
discovery, note CRUD, session/turn/TDD reads, hypothesis writes
(via idempotency middleware), TDD lifecycle reads/writes, the 10
goal/behavior CRUD tools introduced in 2.0, and workspace history.
Uses `@modelcontextprotocol/sdk` with stdio transport and tRPC for
routing.

**npm name:** `vitest-agent-mcp`
**bin:** `vitest-agent-mcp`
**Location:** `packages/mcp/`
**Entry:** `packages/mcp/src/bin.ts`
**Internal dependencies:** `vitest-agent-sdk`

**Why a separate package:** Independent versioning is the headline
reason -- the MCP tool surface evolves on a different cadence than
the reporter and breaking MCP changes shouldn't force a reporter
major. Also: the MCP server's transitive dependency footprint
(MCP SDK, tRPC, zod) is large enough that users who don't run an MCP
server should not pay for it. The reporter declares
`vitest-agent-mcp` as a required `peerDependency` so it
gets installed alongside, but that gives lockfile-level version
coordination without bundling the dependency tree.

### MCP Server

**Entry point:** `packages/mcp/src/bin.ts` -- resolves the user's
`projectDir` via the precedence
`VITEST_AGENT_PROJECT_DIR` (set by the plugin loader) >
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
  services. Exports the underlying `t` instance (`middleware`,
  `router`, `publicProcedure`) so the idempotency middleware can
  share it rather than constructing a parallel `t`
- `router.ts` -- tRPC router aggregating all 50 tool procedures
- `server.ts` -- `startMcpServer()` registers all tools with the MCP
  SDK using zod input schemas (the SDK side; tRPC inputs are also
  zod, kept in sync between the two registrations)
- `middleware/idempotency.ts` -- tRPC idempotency
  middleware (covered below)
- `layers/McpLive.ts` -- composition layer (covered below)

**Dependencies:**

- Depends on: `vitest-agent-sdk` (for DataReader,
  DataStore, ProjectDiscovery, OutputRenderer, path resolution),
  `@modelcontextprotocol/sdk`, `@trpc/server`, `zod`,
  `@effect/platform-node`, `@effect/sql-sqlite-node`
- Used by: Claude Code plugin (via the inline `mcpServers` config in
  `plugin.json`, which spawns the bin through the user's package
  manager), and any MCP-compatible agent

### tRPC Router & Tools (50 tools)

**Locations:**

- `packages/mcp/src/router.ts`, `packages/mcp/src/context.ts`
- `packages/mcp/src/tools/` -- one file per tool
- `packages/mcp/src/tools/_tdd-error-envelope.ts` -- **2.0 helper**.
  Catches the five tagged TDD errors at the MCP boundary and
  surfaces them as success-shape `{ ok: false, error: { _tag, ...,
  remediation } }` responses. tRPC `TRPCError` envelopes remain
  reserved for transport-level failures
- `packages/mcp/src/middleware/idempotency.ts` --
  see the **Idempotency middleware** subsection

The tRPC router aggregates all 50 MCP tool procedures. The context
carries a `ManagedRuntime` for Effect service access, allowing tRPC
procedures to call Effect services via
`ctx.runtime.runPromise(effect)`.

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
- **Sessions / Turns / TDD reads** (JSON output) --
  `tools/session-list.ts`, `tools/session-get.ts`,
  `tools/turn-search.ts`, `tools/failure-signature-get.ts`,
  `tools/tdd-session-get.ts`, `tools/hypothesis-list.ts`,
  `tools/acceptance-metrics.ts` -> `session_list`, `session_get`,
  `turn_search`, `failure_signature_get`, `tdd_session_get`,
  `hypothesis_list`, `acceptance_metrics`. Each procedure validates
  input with a zod schema, calls the matching `DataReader` method
  via `ctx.runtime.runPromise`, and returns markdown or JSON.
  `tdd_session_get` returns markdown; when the session has
  `tdd_session_goals` and `tdd_session_behaviors` rows it renders
  a "Goals and Behaviors" section beneath Phases and Artifacts,
  listing each goal (with ordinal and status) and its nested
  behaviors. All seven are read-only. Auto-allowed via
  `plugin/hooks/lib/safe-mcp-vitest-agent-ops.txt`. The
  `help` tool (`tools/help.ts`) lists them under a
  "Sessions / Turns / TDD reads" section
- **Triage / wrapup reads** (markdown output) --
  `tools/triage-brief.ts` -> `triage_brief({ project?,
  maxLines? })` and `tools/wrapup-prompt.ts` ->
  `wrapup_prompt({ sessionId?, ccSessionId?, kind?,
  userPromptHint? })`. Both delegate verbatim to the matching
  shared `format-triage` / `format-wrapup` generators in
  `packages/sdk/src/lib/`, so the MCP and CLI surfaces share
  exactly the same output. Read-only; no idempotency middleware
  needed
- **Hypothesis writes** (JSON output) --
  `tools/hypothesis-record.ts` ->
  `hypothesis_record({ sessionId, content, citedTestErrorId?,
  citedStackFrameId?, createdTurnId? })` and
  `tools/hypothesis-validate.ts` ->
  `hypothesis_validate({ id, outcome, validatedAt,
  validatedTurnId? })`. Both go through `idempotentProcedure`
  (the idempotency middleware), so duplicate calls from a flaky
  agent retry replay the cached response with
  `_idempotentReplay: true` rather than double-writing.
  Backed by `DataStore.writeHypothesis` and
  `DataStore.validateHypothesis` respectively. The
  per-procedure key derivers in `idempotencyKeys` are
  `${sessionId}:${content}` (record) and
  `${id}:${outcome}` (validate). Auto-allowed via the
  allowlist file. The `help` tool lists them under the
  "Hypothesis writes" section
- **TDD session lifecycle** (JSON output) --
  `tools/tdd-session-start.ts` ->
  `tdd_session_start({ goal, sessionId? | ccSessionId,
  parentTddSessionId?, startedAt? })` opens a TDD session
  (idempotent on `(sessionId, goal)`);
  `tools/tdd-session-end.ts` ->
  `tdd_session_end({ tddSessionId, outcome, summaryNoteId? })`
  closes one (idempotent on `(tddSessionId, outcome)`);
  `tools/tdd-session-resume.ts` -> `tdd_session_resume({ id })`
  is read-only and returns a markdown digest of an open TDD
  session — now including the full goal+behavior tree;
  `tools/tdd-phase-transition-request.ts` ->
  `tdd_phase_transition_request({ tddSessionId, goalId,
  requestedPhase, citedArtifactId, behaviorId?, reason? })`
  is the headline write. **2.0 changes:** `goalId` is now
  **required**; the tool pre-checks goal status (rejects with
  `goal_not_found` or `goal_not_in_progress`) and behavior
  membership (rejects with `behavior_not_found` or
  `behavior_not_in_goal`) before running the existing D2
  binding-rule validator. On accept with a `behaviorId`, the
  server **auto-promotes** the behavior `pending → in_progress`
  in the same SQL transaction as `writeTddPhase` (so the phase
  ledger and behavior status never desync); the orchestrator
  is only responsible for the final `done` transition via
  `tdd_behavior_update`. On deny, returns the
  `{ accepted: false, denialReason, remediation }` shape
  verbatim — the `DenialReason` union was extended with the
  four new pre-check literals. **Not** registered for
  idempotency replay (see decisions.md: the accept/deny is a
  deterministic function of artifact-log state at request time,
  so identical inputs at different times can legitimately
  produce different results).
  **Removed in 2.0:** `decompose_goal_into_behaviors` —
  server-side goal-string-splitting is gone; orchestrators
  decompose via LLM reasoning and create each goal/behavior
  individually
- **TDD goal CRUD** (JSON output, 2.0) -- five new tools:
  - `tools/tdd-goal-create.ts` -> `tdd_goal_create({ sessionId,
    goal })` — idempotent on `(sessionId, goal)`. Returns the
    full row
  - `tools/tdd-goal-get.ts` -> `tdd_goal_get({ id })` — returns
    the goal with nested behaviors
  - `tools/tdd-goal-update.ts` -> `tdd_goal_update({ id, goal?,
    status? })` — flat patch
  - `tools/tdd-goal-delete.ts` -> `tdd_goal_delete({ id })` —
    hard delete (cascades to behaviors, phases, artifacts,
    junction-table dependencies). **Not** in the auto-allow
    list; main-agent calls require explicit user confirmation,
    and the orchestrator is denied at the
    `pre-tool-use-tdd-restricted.sh` hook
  - `tools/tdd-goal-list.ts` -> `tdd_goal_list({ sessionId })` —
    returns goals with nested behaviors, ordered by ordinal
- **TDD behavior CRUD** (JSON output, 2.0) -- five new tools:
  - `tools/tdd-behavior-create.ts` -> `tdd_behavior_create({
    goalId, behavior, suggestedTestName?, dependsOnBehaviorIds?
    })` — idempotent on `(goalId, behavior)`. Junction-table
    dependency rows are written in the same transaction as the
    behavior insert; each id is validated to belong to the same
    goal
  - `tools/tdd-behavior-get.ts` -> `tdd_behavior_get({ id })` —
    returns the behavior + parent-goal summary + dependencies
  - `tools/tdd-behavior-update.ts` -> `tdd_behavior_update({ id,
    behavior?, suggestedTestName?, status?,
    dependsOnBehaviorIds? })` — flat patch. Updating
    `dependsOnBehaviorIds` replaces the junction-table set in
    one transaction
  - `tools/tdd-behavior-delete.ts` -> `tdd_behavior_delete({ id
    })` — hard delete. Same auto-allow / hook denial story as
    `tdd_goal_delete`
  - `tools/tdd-behavior-list.ts` -> `tdd_behavior_list(...)` —
    accepts a discriminated input
    `{ scope: "goal"; goalId } | { scope: "session"; sessionId }`
    (tRPC-friendly, no XOR refines)
- **TDD progress push** (JSON output, 2.0) --
  `tdd_progress_push({ payload })` is registered directly with
  the MCP SDK (not via tRPC) because it forwards to a Claude Code
  notification channel. The MCP server validates the payload
  string as JSON against the `ChannelEvent` discriminated union
  (`vitest-agent-sdk`), then resolves `goalId` and `sessionId`
  **server-side** from `behaviorId` for behavior-scoped events
  (via `DataReader.resolveGoalIdForBehavior` + the goals→sessions
  FK) so a stale orchestrator context cannot push the wrong tree
  coordinates. Resolution is best-effort; malformed JSON or DB
  read failures fall through with the original payload.
  Best-effort delivery — returns `{ ok: true }` regardless of
  whether channels are active
- **Workspace history reads** (JSON output) --
  `tools/commit-changes.ts` -> `commit_changes({ sha? })`
  returns commit metadata + `run_changed_files` joined view.
  When `sha` is provided, returns the entry for that single
  commit; when omitted, returns up to 20 most-recent commits.
  Read-only; backed by `DataReader.getCommitChanges`. Driven
  by the workspace-history rows the
  `post-tool-use-git-commit.sh` plugin hook writes via the
  `record run-workspace-changes` CLI subcommand

The idempotency-key registry has 6 entries (2.0 update):
`hypothesis_record`, `hypothesis_validate`, `tdd_session_start`,
`tdd_session_end`, `tdd_goal_create`, and `tdd_behavior_create`.
`decompose_goal_into_behaviors` was **removed** alongside the tool.
`tdd_phase_transition_request`, all `*_update` / `*_delete` /
`*_get` / `*_list` tools are intentionally **not** in the registry
-- see decisions.md (state-dependent reads, intentional state
transitions, and destructive ops are not idempotent in the
cache-replay sense).

**Project handling in discovery tools:** `module_list`, `suite_list`,
and `test_list` enumerate every project from
`DataReader.getRunsByProject()` when `project` is unspecified,
grouping output under per-project `### project` headers. This is
required because real multi-project Vitest configs use names like
`unit` and `integration` -- there is no literal `"default"` project.

### Idempotency middleware

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
  per-procedure `derive(input) => string` functions. Currently
  registers 6 entries (2.0):
  `hypothesis_record` (key:
  `${input.sessionId}:${input.content}`),
  `hypothesis_validate` (key: `${input.id}:${input.outcome}`),
  `tdd_session_start` (key:
  `${input.sessionId}:${input.goal}`),
  `tdd_session_end` (key:
  `${input.tddSessionId}:${input.outcome}`),
  `tdd_goal_create` (key: `${input.sessionId}:${input.goal}`), and
  `tdd_behavior_create` (key: `${input.goalId}:${input.behavior}`).
  `decompose_goal_into_behaviors` was **removed** in 2.0
  alongside the tool. `tdd_phase_transition_request`, every
  `*_update` / `*_delete` / `*_get` / `*_list`, and
  `tdd_progress_push` are intentionally **not** registered --
  see decisions.md. Adding a new idempotent tool means
  registering a derive function alongside the procedure
- The middleware uses the **same** tRPC instance as
  `publicProcedure` rather than constructing a parallel `t`,
  via the new `middleware` export from `context.ts`. Sharing
  the instance keeps the context type aligned and avoids the
  "two `t` objects, one per call site" trap

**Dependencies:**

- Depends on: `@trpc/server`, `DataStore`, `DataReader`,
  `Effect.runtime`
- Used by: `tools/hypothesis-record.ts`,
  `tools/hypothesis-validate.ts`, plus other idempotent
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

- Depends on: a project-level install of `vitest-agent-plugin`
  (which in turn pulls `vitest-agent-mcp` via its required
  `peerDependency`). The MCP server is not bundled with the plugin
  because both packages depend on the shared package, which depends
  on `better-sqlite3` -- a native module that must match the user's
  platform/Node version
- Used by: Claude Code (automatic plugin discovery)

### Plugin manifest

**Location:** `plugin/.claude-plugin/plugin.json`

Plugin manifest (name, version, author) with inline `mcpServers`
configuration. Declares a `mcp` server with
`command: "node"` and
`args: ["${CLAUDE_PLUGIN_ROOT}/bin/mcp-server.mjs"]`.

### MCP loader script

**Location:** `plugin/bin/mcp-server.mjs`

Zero-deps Node script that detects the user's package manager and
spawns `vitest-agent-mcp` through it. Decision 30 in
decisions.md covers the loader rewrite; Decision 29 (the prior
`file://` import + `node_modules` walk approach) is retired.

**Behavior:**

1. Reads `process.env.CLAUDE_PROJECT_DIR` (or falls back to
   `process.cwd()`)
2. Detects the user's package manager via the `packageManager` field
   in `package.json` or by lockfile presence (`pnpm-lock.yaml`,
   `bun.lock`, `bun.lockb`, `yarn.lock`, `package-lock.json`;
   defaults to `npm`)
3. Spawns `<pm exec> vitest-agent-mcp` (`pnpm exec`,
   `npx --no-install`, `yarn run`, or `bun x`) with
   `stdio: "inherit"` and `cwd: projectDir`
4. Forwards `CLAUDE_PROJECT_DIR` through a new
   `VITEST_AGENT_PROJECT_DIR` env var so the spawned MCP
   subprocess sees the right project root (Claude Code does not
   reliably propagate `CLAUDE_PROJECT_DIR` to MCP server
   subprocesses)
5. Forwards exit code; on non-zero exit prints PM-specific install
   instructions (e.g. `pnpm add -D vitest-agent-plugin`,
   `npm install --save-dev vitest-agent-plugin`)
6. Re-raises termination signals on the parent so kill semantics
   propagate

The script imports only `node:child_process`, `node:fs`, and
`node:path` so it runs before the user has installed anything.

### Hooks (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd, PreCompact, SubagentStart, SubagentStop)

Hook configuration lives in `plugin/hooks/hooks.json`; scripts live
under `plugin/hooks/`. Scripts drive the `record` CLI subcommand for
session/turn capture and call the `triage` / `wrapup` CLI for
prompt-injection nudges. Registered event types: SessionStart,
UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd,
PreCompact, SubagentStart, SubagentStop.

- **SessionStart** -- `session-start.sh` calls the `triage` CLI
  and emits `hookSpecificOutput.additionalContext` with the
  triage markdown (or generic context fallback if the triage is
  empty), then writes the `sessions` row via
  `vitest-agent record session-start
  --triage-was-non-empty <bool> ...`
- **UserPromptSubmit** -- `user-prompt-submit-record.sh` reads
  the prompt envelope, invokes `record turn` with a
  `UserPromptPayload`, then calls
  `wrapup --kind=user_prompt_nudge --user-prompt-hint <prompt>`
  and emits the result as `hookSpecificOutput.additionalContext`.
  The text-match logic for "is this a failure prompt?" lives in
  `format-wrapup`, not the hook
- **PreToolUse** -- `pre-tool-use-mcp.sh` matches
  `mcp__(plugin_vitest-agent_mcp|vitest-agent_mcp)__.*`. Reads the PreToolUse envelope,
  strips the matched MCP prefix from `tool_name`,
  and emits a `permissionDecision: "allow"` JSON response when the
  remaining suffix appears in
  `hooks/lib/safe-mcp-vitest-agent-ops.txt`. Tools not in
  the allowlist fall through to the standard permission prompt.
  5-second hook timeout. Parallel `pre-tool-use-record.sh`
  invokes `record turn` with a `ToolCallPayload`
- **TDD-agent matcher helper** -- `hooks/lib/match-tdd-agent.sh`.
  Sourced by all five orchestrator-scoped hooks
  (`pre-tool-use-bash-tdd.sh`, `subagent-start-tdd.sh`,
  `subagent-stop-tdd.sh`, `post-tool-use-tdd-artifact.sh`,
  `post-tool-use-test-quality.sh`). Exports
  `is_tdd_orchestrator <agent_type>` which returns 0 when the
  hook envelope's `agent_type` field equals either
  `"TDD Orchestrator"` (the agent's `name:` value, which is
  what Claude Code actually emits) or `"tdd-orchestrator"`
  (the legacy slug from the orchestrator's custom
  `agent_type:` frontmatter — Claude Code silently ignores
  that field, but accepting the slug too keeps the gate
  resilient if either side changes). Pairs with the
  `agent_type` clarification in the agent-definition
  subsection above
- **Allowlist** -- `hooks/lib/safe-mcp-vitest-agent-ops.txt`
  enumerates the auto-allow MCP tool entries (one operation suffix
  per line, with `#` comments for category headings). 2.0 adds the
  8 non-destructive goal/behavior tools (`tdd_goal_create`,
  `tdd_goal_get`, `tdd_goal_update`, `tdd_goal_list`,
  `tdd_behavior_create`, `tdd_behavior_get`,
  `tdd_behavior_update`, `tdd_behavior_list`); removes
  `decompose_goal_into_behaviors`; and **intentionally omits**
  `tdd_goal_delete` and `tdd_behavior_delete` so main-agent
  deletes fall through to the standard permission prompt before
  any cascade (the file carries an explanatory comment to that
  effect). The script strips blank lines and comments before
  exact matching
- **PostToolUse** -- `post-test-run.sh` runs on the Bash tool
  and detects test runs. After `record run-trigger`, it calls
  `record test-case-turns --cc-session-id <id>` best-effort
  (output ignored) to keep `test_cases.created_turn_id` up to date
  for Bash-triggered runs. Parallel `post-tool-use-record.sh`
  runs on every tool result and invokes `record turn` with a
  `ToolResultPayload`. For `Edit`/`Write`/`MultiEdit` tools it
  additionally invokes a second `record turn` with a
  `FileEditPayload` (lines added/removed, diff)
- **Stop** -- `stop-record.sh`. Records a `hook_fire` turn AND
  injects a wrap-up nudge via
  `wrapup --kind=stop`. Output is emitted to Claude Code as
  a top-level `systemMessage` field. (Claude Code's hook
  schema only permits `hookSpecificOutput.additionalContext`
  on `PreToolUse`, `UserPromptSubmit`, `PostToolUse`, and
  `PostToolBatch`; `Stop` must use `systemMessage` instead.)
- **SessionEnd** -- `session-end-record.sh` invokes
  `record session-end --cc-session-id ... [--end-reason ...]`
  so `sessions.ended_at` and `sessions.end_reason` get
  populated, then calls `wrapup --kind=session_end` and emits
  the result as a top-level `systemMessage` field
  (`hookSpecificOutput.additionalContext` is invalid for
  `SessionEnd`)
- **PreCompact** -- `pre-compact-record.sh` invokes `record turn`
  with a `HookFirePayload` to log the compaction event, then calls
  `wrapup --kind=pre_compact` and emits the result as a top-level
  `systemMessage` field (same schema constraint as `Stop` /
  `SessionEnd`)
- **SubagentStart** -- `subagent-start-tdd.sh`. Scoped via
  `lib/match-tdd-agent.sh` (matches the orchestrator under
  either `"TDD Orchestrator"` or the `"tdd-orchestrator"` slug)
  -- fires only when the TDD orchestrator subagent starts.
  Writes the `sessions` row with `agent_kind='subagent'`,
  `agent_type='tdd-orchestrator'`, and `parent_session_id`
  set to the parent main-session id
- **SubagentStop** -- `subagent-stop-tdd.sh`. Scoped via
  `lib/match-tdd-agent.sh`. Calls `record session-end`
  with `end_reason="subagent_stop"`, generates a
  `wrapup --kind=tdd_handoff` note, and records that note as
  a turn on the **parent** session so the main agent can pick
  up where the subagent left off
- PreToolUse Bash gate (orchestrator-scoped) --
  `pre-tool-use-bash-tdd.sh`. Matches the `Bash` tool when
  the hook envelope's `agent_type` matches the orchestrator
  via `lib/match-tdd-agent.sh` (either `"TDD Orchestrator"`
  or the `"tdd-orchestrator"` slug). Blocks anti-patterns:
  `--update`, `-u`, `--reporter=silent`, `--bail`, `-t`,
  `--testNamePattern`, `*.snap` edits, and edits to
  `coverage.exclude` / `setupFiles` / `globalSetup` in
  vitest config files. Returns `permissionDecision: "deny"`
  JSON on match. Pairs with the iron-law system prompt of the
  orchestrator agent definition
- PreToolUse TDD restricted-tools (orchestrator-scoped, **2.0
  new**) -- `pre-tool-use-tdd-restricted.sh`. Scoped via
  `lib/match-tdd-agent.sh` (matcher targeting only the
  destructive tool names so it doesn't fire on every tool
  call). Matches `tool_name` against
  `mcp__plugin_vitest-agent_mcp__tdd_goal_delete`,
  `mcp__plugin_vitest-agent_mcp__tdd_behavior_delete`, plus
  the legacy bare-prefix variants, and reaffirms denial of
  `tdd_artifact_record` (never an MCP tool per Decision D7,
  but defense-in-depth). Returns `permissionDecision: "deny"`
  with `permissionDecisionReason: "Orchestrator must use
  status:'abandoned' to drop work; deletes are reserved for
  the main agent. To remove a duplicate created by mistake,
  ask the user."`. This is the runtime gate on top of the
  orchestrator's `tools[]` enumeration (which is documentation,
  not enforcement). Registered in `hooks.json` for the
  `PreToolUse` event type
- PostToolUse TDD artifact (orchestrator-scoped) --
  `post-tool-use-tdd-artifact.sh`. Scoped to the orchestrator.
  Before writing any artifact, calls `record test-case-turns
  --cc-session-id <id>` and captures the returned
  `latestTestCaseId`. On Bash test runs: parses the test result and
  shells to `record tdd-artifact --artifact-kind=test_failed_run` or
  `test_passed_run` with the relevant FKs, passing
  `--test-case-id <latestTestCaseId>` when available. On Edit/Write
  outcomes: shells to `record tdd-artifact
  --artifact-kind=test_written` (test-file edits) or
  `code_written` (source edits), similarly passing
  `--test-case-id` when available
- PostToolUse test quality (orchestrator-scoped) --
  `post-tool-use-test-quality.sh`. Scoped to the orchestrator.
  Scans test-file edits for escape-hatch tokens (`it.skip`,
  `it.todo`, `it.fails`, `it.concurrent`, `.skipIf`,
  `.todoIf`, `test.skip`, `test.todo`, `test.fails`,
  `describe.skip`, `describe.todo`) and shells to `record
  tdd-artifact --artifact-kind=test_weakened` so the
  anti-pattern is captured for downstream metrics
- PostToolUse git commit (repo-scoped) --
  `post-tool-use-git-commit.sh`. **NOT scoped** to the
  orchestrator -- fires for all agents, on every successful
  `git commit` / `git push` Bash invocation. Parses git
  metadata (sha, parent, message, author, branch) and the
  changed-file list, then shells to `record
  run-workspace-changes`. Backs the `commit_changes` MCP
  read tool

### Agent definitions, slash commands, skills

**Agent definitions** -- `plugin/agents/`

- `tdd-orchestrator.md` -- the TDD orchestrator
  subagent definition. Carries the iron-law system prompt
  (mandatory test-first loop, no escape hatches), the
  eight-state state machine matching `tdd_phases.phase` enum
  (the state machine is **per-behavior**; goal-level iteration
  is workflow code, not a state in `tdd_phases`), and the 9
  sub-skill primitives embedded inline (Decision D6). **2.0
  updates:** the `tools:` array adds the 8 non-destructive
  goal/behavior CRUD tools (`tdd_goal_create`/`get`/`update`/
  `list`, `tdd_behavior_create`/`get`/`update`/`list`) and
  removes `decompose_goal_into_behaviors`; deletes are
  intentionally excluded from `tools[]` AND enforced at runtime
  by `pre-tool-use-tdd-restricted.sh`. New "Three-tier
  hierarchy" section documents Objective→Goal→Behavior. The
  workflow section is rewritten as a two-pass decomposition
  (pass 1: create all goals; pass 2: per-goal, create all
  behaviors then run the per-behavior 3a/b/c/d red-green-
  refactor loop). New "Mid-session add / abandon" section
  covers `tdd_goal_create` / `tdd_behavior_create` mid-session
  followed by `*_added` channel events, and
  `tdd_*_update({ status: "abandoned" })` followed by
  `*_abandoned`. The `tdd_phase_transition_request` guidance
  now documents the required `goalId`, the goal-status /
  behavior-membership pre-checks, and the auto-promote on
  accept. The `tdd_progress_push` payload table is expanded
  with all 13 `ChannelEvent` variants; behavior-level events
  carry `sessionId` + `goalId` + `behaviorId`. **Frontmatter `agent_type:` is
  custom plugin metadata that Claude Code silently
  ignores** — Claude Code's plugin-subagent frontmatter
  schema only recognizes `name`, `description`, `tools`,
  `disallowedTools`, `model`, `color`, `prompt`, `skills`,
  `initialPrompt`, `memory`, `effort`, `background`, and
  `isolation`. The hook envelope's `agent_type` field
  Claude Code emits actually equals the agent's `name:`
  field (e.g., `"TDD Orchestrator"`, NOT
  `"tdd-orchestrator"`). The W2 restricted-Bash hook
  (`pre-tool-use-bash-tdd.sh`), SubagentStart/Stop hooks
  (`subagent-start-tdd.sh`, `subagent-stop-tdd.sh`), and
  the artifact-recording hooks (`post-tool-use-tdd-artifact.sh`,
  `post-tool-use-test-quality.sh`) all gate via the shared
  `lib/match-tdd-agent.sh` helper, which accepts either
  the human name (`"TDD Orchestrator"`) or the legacy
  slug (`"tdd-orchestrator"`) so the gate is resilient if
  either side changes

**Slash commands** -- `plugin/commands/`

- `setup.md` -- setup command
- `configure.md` -- configure command
- `tdd.md` -- the `/tdd <goal>` slash command. Hands
  off to the TDD orchestrator subagent with the user's goal as
  the input

**Skills** -- `plugin/skills/`

- `tdd/SKILL.md` -- TDD workflow skill. **2.0 update:** takes
  ownership of the channel-event handler section (moved out of
  `commands/tdd.md`, which now keeps only spawn instructions).
  Contains 11 event handlers covering all 13 `ChannelEvent`
  variants and renders the goal+behavior hierarchy flat with
  `[G<n>.B<m>]` label encoding (Claude Code's `TaskCreate`
  doesn't nest cleanly past one parent). Goals appear as
  marker tasks (`--- Goal N done ---`) inserted between
  behavior groups. Persists across multiple `/tdd` invocations
  and direct orchestrator dispatch
- `debugging/SKILL.md` -- test debugging skill
- `configuration/SKILL.md` -- Vitest configuration skill
- `coverage-improvement/SKILL.md` -- coverage improvement
  skill
- `tdd-primitives/<9 dirs>/SKILL.md` --
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
  - `decompose-goal-into-behaviors/SKILL.md` -- **2.0:
    rewritten** to describe LLM-driven decomposition (no
    server tool involved). Covers what counts as one goal vs
    one behavior, the `dependsOnBehaviorIds` junction-table
    contract, and per-goal idempotency keys for safe retries

---

## Removed components

| Component | Replaced by |
| --------- | ----------- |
| CacheWriter (service) | DataStore |
| CacheReader (service) | DataReader |
| CacheWriterLive / CacheWriterTest | DataStoreLive / DataStoreTest |
| CacheReaderLive / CacheReaderTest | DataReaderLive |
| CacheError | DataStoreError |
| AgentDetection (service) | EnvironmentDetector |
| AgentDetectionLive / AgentDetectionTest | EnvironmentDetectorLive / EnvironmentDetectorTest |
| `package/src/utils/format-console.ts` | `packages/sdk/src/formatters/markdown.ts` |
| `package/src/utils/format-gfm.ts` | `packages/sdk/src/formatters/gfm.ts` |
| `resolveDbPath` (artifact-probing in CLI) | `resolveDataPath` (XDG-derived) in shared |
| Plugin `file://` import + `node_modules` walk loader | PM-detect + spawn `vitest-agent-mcp` |
| Reporter `./mcp` subpath export | `vitest-agent-mcp` package + bin |
| `AgentReporter` class export from `vitest-agent-reporter` | `agentPlugin()` from `vitest-agent` (standalone reporter usage is intentionally broken in 2.0; see decisions.md) |
| `AgentPlugin` factory export from `vitest-agent-reporter` | `agentPlugin()` from `vitest-agent` |
| `vitest-agent-reporter`-shipped `AgentReporter.onTestRunEnd` GFM write path (`shouldWriteGfm` block) | `defaultReporter` emits a `github-summary` `RenderedOutput` under GitHub Actions; `routeRenderedOutput` appends to the summary file |
