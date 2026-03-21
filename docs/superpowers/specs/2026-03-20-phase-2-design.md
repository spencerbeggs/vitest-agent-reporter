# Phase 2: Effect Services, CLI Bin, and Hybrid Mode

## Summary

Phase 2 migrates vitest-agent-reporter internals to Effect services,
adds a CLI bin for LLM-oriented test landscape queries, introduces a
hybrid console strategy that complements Vitest 4.1's built-in agent
reporter, switches to std-env for agent detection, adds scoped coverage
for partial test runs, and fixes two Phase 1 bugs.

## Goals

- Migrate from Zod to Effect Schema; restructure around Effect services
  with `@effect/platform` for all file I/O
- Add `vitest-agent-reporter` CLI bin via `@effect/cli` for on-demand
  test landscape queries (status, overview, coverage)
- Introduce `consoleStrategy` option (`"own" | "complement"`) so the
  plugin can either take over console output or layer on top of Vitest's
  built-in agent reporter
- Replace hand-rolled environment detection with `std-env`
- Add scoped coverage filtering for partial test runs
- Fix unhandledErrors dropped in monorepo projects
- Fix `includeBareZero` being a no-op at threshold 0

## Non-Goals

- Phase 3 features (failure history, test classification, suggested
  actions) are out of scope
- Upstream changes to `@savvy-web/vitest` for coverage scoping (separate
  ticket)
- LLM API calls from the CLI (the bin transforms cached data, it does
  not call any AI provider)

## Breaking Changes from Phase 1

This is a pre-1.0 unreleased package, so these are noted for
documentation purposes only:

- **Zod -> Effect Schema:** All schema exports change from Zod schemas
  to Effect Schema definitions. Codecs change from `z.codec()` to
  `Schema.decodeUnknown`/`Schema.encodeUnknown`.
- **`consoleStrategy` default:** Phase 1 implicitly used `"own"`
  behavior (stripped reporters, wrote GFM). Phase 2 defaults to
  `"complement"` (layers on top of Vitest's built-in). To preserve
  Phase 1 behavior, set `consoleStrategy: "own"`.
- **`std-env` replaces `detectEnvironment()`:** The utility function is
  removed. Agent detection is now handled by the `AgentDetection`
  service backed by `std-env`.

---

## Architecture

### High-Level Structure

```text
src/
  index.ts                          -- sole re-export point for public API
  reporter.ts                       -- AgentReporter class (Vitest adapter)
  plugin.ts                         -- AgentPlugin function

  cli/
    index.ts                        -- runCli entry point, Command.run()
    commands/
      status.ts                     -- thin wrapper, delegates to lib
      overview.ts
      coverage.ts
    lib/
      format-status.ts              -- testable formatting logic
      format-overview.ts
      format-coverage.ts

  services/
    AgentDetection.ts               -- Context.Tag: std-env wrapper
    CacheWriter.ts                  -- Context.Tag: write reports/manifest
    CacheReader.ts                  -- Context.Tag: read reports/manifest
    CoverageAnalyzer.ts             -- Context.Tag: coverage processing
    ProjectDiscovery.ts             -- Context.Tag: test file discovery

  layers/
    AgentDetectionLive.ts / AgentDetectionTest.ts
    CacheWriterLive.ts / CacheWriterTest.ts
    CacheReaderLive.ts / CacheReaderTest.ts
    CoverageAnalyzerLive.ts / CoverageAnalyzerTest.ts
    ProjectDiscoveryLive.ts / ProjectDiscoveryTest.ts
    ReporterLive.ts                 -- merged layer for reporter runtime
    CliLive.ts                      -- merged layer for CLI runtime

  errors/
    CacheError.ts                   -- Data.TaggedError (file I/O)
    DiscoveryError.ts               -- Data.TaggedError (project discovery)

  schemas/
    AgentReport.ts                  -- report + module + test schemas
    CacheManifest.ts                -- manifest + entry schemas
    Coverage.ts                     -- coverage report + totals
    Options.ts                      -- reporter + plugin option schemas
    Common.ts                       -- shared literals (TestState, etc.)

  utils/
    compress-lines.ts
    safe-filename.ts
    ansi.ts
    strip-console-reporters.ts
    detect-pm.ts
    format-console.ts               -- pure function: console markdown
    format-gfm.ts                   -- pure function: GitHub Actions GFM

bin/
  vitest-agent-reporter.js          -- shebang wrapper
```

### Key Design Decisions

**Effect services over plain functions:** The reporter and CLI share
services (CacheReader, CoverageAnalyzer). Effect's dependency injection
gives us testable layers without mocking Node APIs directly.
`@effect/platform` provides the FileSystem abstraction; live layers use
`@effect/platform-node`, tests swap in mock implementations.

**Scoped Effect.runPromise in the reporter:** Vitest instantiates the
reporter class -- we don't control construction. Each lifecycle hook
(`onTestRunEnd`) builds a scoped effect and runs it with
`Effect.runPromise`, providing the `ReporterLive` layer inline. This
avoids `ManagedRuntime` lifecycle concerns (no resource leak, no
disposal needed). The layer is lightweight (FileSystem + pure services)
so per-call construction is acceptable.

**Effect.runPromise in the plugin:** The plugin runs a one-shot async
effect for environment detection via `Effect.runPromise`. Although
`configureVitest` is synchronous, Vitest awaits plugin hooks, so async
is safe. This avoids `Effect.runSync` which would throw if any layer
implementation uses async effects.

**CLI-first overview (no cache-time generation):** The overview/status
data is generated on-demand by the CLI, not on every test run. The
reporter writes test results and manifest; the CLI reads them plus does
its own project discovery when asked. This keeps the reporter lean.

**Single re-export point:** Only `src/index.ts` re-exports. All other
files import directly from their source. This prevents circular
dependencies and keeps the dependency graph clear.

**Utils and formatters as pure functions:** `compressLines`,
`safeFilename`, `ansi`, `stripConsoleReporters`, `detectPackageManager`
stay as plain functions in `src/utils/`. Console markdown and GFM
formatting are also pure string transformations -- they stay as plain
functions in `src/utils/` (e.g., `format-console.ts`, `format-gfm.ts`)
rather than Effect services. The only service that does file I/O for
GFM is inlined in the reporter's effect pipeline (append to
`GITHUB_STEP_SUMMARY` via `FileSystem`).

---

## Plugin Options and Hybrid Mode

### Expanded Options

```typescript
interface AgentPluginOptions {
  mode?: "auto" | "agent" | "silent";
  consoleStrategy?: "own" | "complement";
  reporter?: Omit<AgentReporterOptions, "consoleOutput" | "githubActions">;
}
```

`mode` controls detection (unchanged from Phase 1):

- `"auto"` -- detect via std-env + CI env vars
- `"agent"` -- force agent mode
- `"silent"` -- cache-only

`consoleStrategy` controls behavior (new):

- `"complement"` (default) -- let Vitest's built-in agent reporter
  handle console suppression and GFM summaries. Our reporter adds JSON
  cache and manifest only. Does not strip any reporters. In agent mode,
  the plugin checks whether the `agent` reporter is in the reporter
  chain and logs a warning to stderr if not (the user may need to add
  it manually for proper console suppression).
- `"own"` -- take over console output. Strips built-in console reporters
  (including `agent`), uses our formatter, writes our own GFM. This is
  the Phase 1 behavior.

### Behavior Matrix

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

---

## Effect Services

### AgentDetection

Wraps `std-env` for environment detection.

```typescript
class AgentDetection extends Context.Tag(
  "vitest-agent-reporter/AgentDetection"
)<AgentDetection, {
  readonly isAgent: Effect.Effect<boolean>;
  readonly agentName: Effect.Effect<Option.Option<string>>;
  readonly isCI: Effect.Effect<boolean>;
  readonly environment: Effect.Effect<"agent" | "ci" | "human">;
}>() {}
```

Live layer reads `std-env`'s `isAgent`/`agent` exports plus checks
`GITHUB_ACTIONS`/`CI` env vars. Test layer accepts a fixed environment
value.

### CacheWriter

Writes reports and manifest to disk.

```typescript
class CacheWriter extends Context.Tag(
  "vitest-agent-reporter/CacheWriter"
)<CacheWriter, {
  readonly writeReport: (
    cacheDir: string,
    projectName: string,
    report: AgentReport,
  ) => Effect.Effect<void, CacheError>;
  readonly writeManifest: (
    cacheDir: string,
    manifest: CacheManifest,
  ) => Effect.Effect<void, CacheError>;
  readonly ensureDir: (
    cacheDir: string,
  ) => Effect.Effect<void, CacheError>;
}>() {}
```

Live layer depends on `FileSystem` from `@effect/platform`. Test layer
accumulates writes into a mutable state container.

### CacheReader

Reads manifest and reports from disk.

```typescript
class CacheReader extends Context.Tag(
  "vitest-agent-reporter/CacheReader"
)<CacheReader, {
  readonly readManifest: (
    cacheDir: string,
  ) => Effect.Effect<Option.Option<CacheManifest>, CacheError>;
  readonly readReport: (
    cacheDir: string,
    projectName: string,
  ) => Effect.Effect<Option.Option<AgentReport>, CacheError>;
  readonly listReports: (
    cacheDir: string,
  ) => Effect.Effect<ReadonlyArray<string>, CacheError>;
}>() {}
```

Live layer depends on `FileSystem`. Shared between reporter (manifest
updates) and CLI (all commands). Exported from public API for consumers
who want to read cache programmatically.

### CoverageAnalyzer

Processes istanbul CoverageMap with optional scoping.

```typescript
class CoverageAnalyzer extends Context.Tag(
  "vitest-agent-reporter/CoverageAnalyzer"
)<CoverageAnalyzer, {
  readonly process: (
    coverage: unknown,
    options: CoverageOptions,
  ) => Effect.Effect<Option.Option<CoverageReport>>;
  readonly processScoped: (
    coverage: unknown,
    options: CoverageOptions,
    testedFiles: ReadonlyArray<string>,
  ) => Effect.Effect<Option.Option<CoverageReport>>;
}>() {}
```

`process` performs full coverage analysis (existing behavior).
`processScoped` filters to files related to the tested source files,
only flagging threshold violations for those files. Live layer is pure
computation (duck-typed CoverageMap). Test layer returns canned data.

### ProjectDiscovery

Glob-based test file discovery for the CLI.

```typescript
class ProjectDiscovery extends Context.Tag(
  "vitest-agent-reporter/ProjectDiscovery"
)<ProjectDiscovery, {
  readonly discoverTestFiles: (
    rootDir: string,
  ) => Effect.Effect<ReadonlyArray<TestFileEntry>, DiscoveryError>;
  readonly mapTestToSource: (
    testFile: string,
  ) => Effect.Effect<ReadonlyArray<string>, DiscoveryError>;
}>() {}
```

`discoverTestFiles` globs for `*.test.ts`/`*.spec.ts`.
`mapTestToSource` uses convention (strip `.test.`/`.spec.` suffix) with
existence check via `FileSystem`. Returns empty array when no matching
source file is found (unmapped files are not errors). The
`DiscoveryError` channel covers filesystem failures (permissions, etc.).
Does not analyze imports in Phase 2. Live layer depends on `FileSystem`.

### Formatters (Pure Functions, Not Services)

Console markdown formatting (`format-console.ts`) and GFM formatting
(`format-gfm.ts`) remain pure functions in `src/utils/`. They take an
`AgentReport` and return a string. The reporter's effect pipeline calls
them directly and handles file I/O (appending GFM to
`GITHUB_STEP_SUMMARY`) through the `FileSystem` service inline.

This avoids wrapping pure transformations in Effect services, which
would add overhead without testability benefit -- pure functions are
already trivially testable.

---

## Schema Migration (Zod to Effect Schema)

All data structures migrate from Zod 4 schemas to Effect Schema. The
shapes are identical; only the runtime changes.

### Key Mappings

| Zod | Effect Schema |
| --- | ------------- |
| `z.string()` | `Schema.String` |
| `z.number()` | `Schema.Number` |
| `z.boolean()` | `Schema.Boolean` |
| `z.optional(T)` | `Schema.optional(T)` |
| `z.array(T)` | `Schema.Array(T)` |
| `z.enum([...])` | `Schema.Literal(...)` (multi-arg creates union) |
| `z.object({...})` | `Schema.Struct({...})` |
| `z.infer<typeof S>` | `typeof S.Type` |
| `z.codec()` | `Schema.decodeUnknown` / `Schema.encodeUnknown` |
| `.describe(...)` | `.annotations({ identifier: "..." })` |

### Example

```typescript
export const TestState = Schema.Literal(
  "passed", "failed", "skipped", "pending",
);
export type TestState = typeof TestState.Type;

export const AgentReport = Schema.Struct({
  timestamp: Schema.String,
  project: Schema.optional(Schema.String),
  reason: TestRunReason,
  summary: Schema.Struct({
    total: Schema.Number,
    passed: Schema.Number,
    failed: Schema.Number,
    skipped: Schema.Number,
    duration: Schema.Number,
  }),
  failed: Schema.Array(ModuleReport),
  unhandledErrors: Schema.Array(ReportError),
  failedFiles: Schema.Array(Schema.String),
  coverage: Schema.optional(CoverageReport),
}).annotations({ identifier: "AgentReport" });

export type AgentReport = typeof AgentReport.Type;
```

### Coverage Report (New Fields)

```typescript
export const CoverageReport = Schema.Struct({
  totals: CoverageTotals,
  threshold: Schema.Number,
  scoped: Schema.optionalWith(Schema.Boolean, { default: () => false }),
  scopedFiles: Schema.optional(Schema.Array(Schema.String)),
  lowCoverage: Schema.Array(FileCoverageReport),
  lowCoverageFiles: Schema.Array(Schema.String),
}).annotations({ identifier: "CoverageReport" });
```

`scoped` indicates the coverage was filtered to a subset of files.
Defaults to `false` when absent, ensuring backward compatibility with
Phase 1 cache files that lack this field. `scopedFiles` lists which
source files were in scope.

---

## CLI Bin Design

### Entry Point

`src/cli/index.ts` exports `runCli()`. `bin/vitest-agent-reporter.js`
is a thin shebang wrapper that calls it. The builder compiles and
bundles the CLI.

### Commands

Three subcommands, each delegating to testable lib functions:

**`status`** -- reads manifest, shows per-project pass/fail state.

Options:

- `--cache-dir, -d` -- cache directory path. When omitted, the CLI
  checks common locations in order: (1) `.vitest-agent-reporter/` in
  the project root, (2) `node_modules/.vite/vitest-agent-reporter/`
  (Vite default cache dir). Uses the first location that contains a
  `manifest.json`.

Example output:

```markdown
## Vitest Test Status

| Project | Last Run | Result | Report |
| ------- | -------- | ------ | ------ |
| @savvy-web/core:unit | 2026-03-20T14:30:00Z | failed | reports/core-unit.json |
| @savvy-web/utils:unit | 2026-03-20T14:30:00Z | passed | reports/utils-unit.json |

### Failing: @savvy-web/core:unit
- 2 failed, 8 passed (340ms)
- Failed files: src/utils.test.ts, src/parser.test.ts
- Re-run: `pnpm vitest run --project @savvy-web/core:unit`
```

**`overview`** -- test landscape summary with file-to-test mapping.

Options:

- `--cache-dir, -d`
- `--project, -p` -- filter to specific project (optional)

Example output:

```markdown
## Test Landscape

**Package manager:** pnpm
**Projects:** 3 (2 unit, 1 e2e)
**Test files:** 24

### @savvy-web/core:unit
- **Run:** `pnpm vitest run --project @savvy-web/core:unit`
- **Files:** 12 test files covering 15 source files
- **Last result:** failed (2 failures)

### File Map
| Source | Tests |
| ------ | ----- |
| src/parser.ts | src/parser.test.ts |
| src/utils.ts | src/utils.test.ts, src/helpers.test.ts |
```

**`coverage`** -- coverage gap analysis from cached reports.

Options:

- `--cache-dir, -d`
- `--threshold, -t` -- coverage threshold percentage (default: 0)

Example output:

```markdown
## Coverage Gaps

**Threshold:** 80%

### @savvy-web/core:unit
| File | Lines | Branches | Uncovered |
| ---- | ----- | -------- | --------- |
| src/parser.ts | 45% | 30% | 42-50, 99, 120-135 |
| src/coverage.ts | 72% | 65% | 88-95 |

### Suggested
- `pnpm vitest run src/parser.test.ts --coverage`
```

### Layer Composition

```typescript
const CliLive = Layer.mergeAll(
  CacheReaderLive,
  ProjectDiscoveryLive,
).pipe(Layer.provideMerge(NodeFileSystem.layer));

function runCli() {
  const main = Effect.suspend(() => cli(process.argv)).pipe(
    Effect.provide(CliLive),
  );
  NodeRuntime.runMain(main);
}
```

---

## std-env Integration

### Dependency Change

- Add: `std-env` (runtime)
- Add: `effect`, `@effect/cli`, `@effect/platform`,
  `@effect/platform-node` (runtime)
- Remove: `zod`

### AgentDetectionLive

```typescript
import { isAgent, agent } from "std-env";

const checkCI = (): boolean =>
  process.env.GITHUB_ACTIONS === "true" ||
  process.env.GITHUB_ACTIONS === "1" ||
  process.env.CI === "true";

export const AgentDetectionLive: Layer.Layer<AgentDetection> =
  Layer.succeed(AgentDetection, {
    isAgent: Effect.sync(() => isAgent),
    agentName: Effect.sync(() =>
      agent ? Option.some(agent) : Option.none(),
    ),
    isCI: Effect.sync(checkCI),
    environment: Effect.sync(() => {
      if (isAgent) return "agent" as const;
      if (checkCI()) return "ci" as const;
      return "human" as const;
    }),
  });
```

Drops the 9+ individual env var checks from Phase 1.
`std-env` maintains agent detection upstream (currently covers: Claude,
Cursor, Devin, Replit, Gemini, Codex, Auggie, OpenCode, Kiro, Goose,
Pi). CI detection stays custom because we need the specific
`GITHUB_ACTIONS` check for GFM behavior.

### AgentDetectionTest

```typescript
export const AgentDetectionTest = {
  layer: (
    env: "agent" | "ci" | "human",
    agentName?: string,
  ): Layer.Layer<AgentDetection> =>
    Layer.succeed(AgentDetection, {
      isAgent: Effect.succeed(env === "agent"),
      agentName: Effect.succeed(
        agentName ? Option.some(agentName) : Option.none(),
      ),
      isCI: Effect.succeed(env === "ci"),
      environment: Effect.succeed(env),
    }),
} as const;
```

---

## Bug Fixes

### Fix 1: unhandledErrors Dropped in Monorepo Projects

**Problem:** `reporter.ts` only attaches `unhandledErrors` to the
`"default"` project. In monorepos where every project has an explicit
name, errors are silently dropped from all reports.

**Fix:** Attach unhandled errors to every project report. They are
global (not project-scoped), so every project should see them.
Consumers can deduplicate if needed.

### Fix 2: includeBareZero No-Op at Threshold 0

**Problem:** Bare-zero files are excluded before the threshold check. At
threshold 0, `0 < 0` is false, so bare-zero files never appear in
`lowCoverage` even with `includeBareZero: true`.

**Fix:** When `includeBareZero` is true, always include bare-zero files
in `lowCoverage` regardless of threshold. The flag's intent is "show me
files with zero coverage" -- that should not require also setting a
threshold.

```typescript
// Before
if (isBareZero && !includeBareZero) continue;
if (!(worstMetric < threshold)) continue;

// After
if (isBareZero && !includeBareZero) continue;
if (!isBareZero && !(worstMetric < threshold)) continue;
```

---

## Scoped Coverage

### Problem

When an agent runs a subset of tests (`vitest run src/utils.test.ts`),
coverage measures against the full project source. Files the agent is
not touching show as uncovered and violate thresholds.

### Solution

The `CoverageAnalyzer` service provides `processScoped()` which:

1. Takes the list of test files from `testModules`
2. Maps each to likely source files via convention (`foo.test.ts` ->
   `foo.ts`) with existence check
3. Only flags coverage threshold violations for files in that set
4. Records coverage data for all files but does not flag unrelated files
   as violations
5. Sets `scoped: true` and populates `scopedFiles` in the
   `CoverageReport`

The reporter auto-detects partial runs by comparing the test modules
received in `onTestRunEnd` against the project's configured test file
globs (available from `testModule.project`). If the modules represent a
subset of the project's configured files (e.g., Vitest was invoked with
specific file arguments), it uses `processScoped`. This is more
reliable than comparing against historical manifest counts, which
would fail on first runs or when new test files are added.

File-to-source mapping defaults to convention but handles overlap
gracefully (a test file may cover multiple source files). Supported
conventions: strip `.test.`/`.spec.` suffix (e.g., `foo.test.ts` ->
`foo.ts`), check existence via `FileSystem`. Unmapped files (no
matching source found) return an empty array silently. Phase 2 uses
convention-based mapping; import analysis could be a Phase 3
enhancement.

Upstream `@savvy-web/vitest` changes for coverage config scoping are a
separate concern. A ticket will be filed to document the interop needs.

---

## Reporter and Plugin Integration

### AgentReporter

Remains a class implementing Vitest's Reporter interface. Each
lifecycle hook builds a scoped effect and runs it with
`Effect.runPromise`, providing the `ReporterLive` layer inline. No
`ManagedRuntime` needed -- the layer is lightweight and per-call
construction avoids resource leak concerns:

```typescript
export class AgentReporter {
  private options: AgentReporterOptions;
  private coverage: unknown;

  constructor(options?: AgentReporterOptions) {
    this.options = resolveDefaults(options);
  }

  async onTestRunEnd(testModules, unhandledErrors, reason) {
    const program = Effect.gen(function* () {
      const writer = yield* CacheWriter;
      const analyzer = yield* CoverageAnalyzer;
      // ... same flow as Phase 1, through services
      // formatConsoleMarkdown() and formatGfm() called as
      // pure functions, GFM file append via FileSystem
    });

    await Effect.runPromise(
      program.pipe(Effect.provide(ReporterLive)),
    );
  }
}
```

### AgentPlugin

Stays a plain function. Runs a one-shot async effect for detection
(Vitest awaits `configureVitest`, so async is safe):

```typescript
export function AgentPlugin(options?: AgentPluginOptions) {
  return {
    name: "vitest-agent-reporter",
    async configureVitest({ vitest }) {
      const env = await Effect.runPromise(
        Effect.provide(
          Effect.flatMap(AgentDetection, (d) => d.environment),
          AgentDetectionLive,
        ),
      );

      const strategy = options?.consoleStrategy ?? "complement";

      // Only strip reporters when actively taking over console output.
      // In silent mode, stripping would remove output without replacing it.
      const shouldStrip =
        strategy === "own" && env === "agent";
      if (shouldStrip) {
        stripConsoleReporters(vitest.config.reporters);
      }

      vitest.config.reporters.push(
        new AgentReporter({
          ...options?.reporter,
          cacheDir: resolveCacheDir(options, vitest),
          coverageThreshold: resolveThreshold(options, vitest),
          consoleOutput: resolveConsoleOutput(env, strategy),
          githubActions: resolveGithubActions(env, strategy),
        }),
      );
    },
  };
}
```

### ReporterLive Layer

```typescript
export const ReporterLive = Layer.mergeAll(
  CacheWriterLive,
  CoverageAnalyzerLive,
).pipe(Layer.provideMerge(NodeFileSystem.layer));
```

---

## Public API

`src/index.ts` is the sole re-export point:

```typescript
// Reporter and Plugin
export { AgentReporter } from "./reporter.js";
export { AgentPlugin } from "./plugin.js";

// Schemas
export { AgentReport, ModuleReport, TestReport, ReportError,
  TestState, TestRunReason } from "./schemas/AgentReport.js";
export { CacheManifest, CacheManifestEntry } from "./schemas/CacheManifest.js";
export { CoverageReport, CoverageTotals,
  FileCoverageReport } from "./schemas/Coverage.js";
export { AgentReporterOptions, AgentPluginOptions,
  ConsoleOutputMode, PluginMode,
  ConsoleStrategy } from "./schemas/Options.js";

// Services (for programmatic cache access)
export { CacheReader } from "./services/CacheReader.js";
export { CacheReaderLive } from "./layers/CacheReaderLive.js";

// Errors (for consumers handling service failures)
export { CacheError } from "./errors/CacheError.js";
```

Services other than CacheReader are internal. The CLI is exposed only
via the bin, not as a library export.

---

## Testing Strategy

### Structure

Tests mirror source. Services are tested through their layers. CLI
logic is tested through lib functions.

```text
src/
  reporter.test.ts
  plugin.test.ts
  cli/lib/
    format-status.test.ts
    format-overview.test.ts
    format-coverage.test.ts
  layers/
    AgentDetectionLive.test.ts
    CacheWriterLive.test.ts
    CacheReaderLive.test.ts
    CoverageAnalyzerLive.test.ts
    ProjectDiscoveryLive.test.ts
  utils/
    compress-lines.test.ts
    safe-filename.test.ts
    ansi.test.ts
    strip-console-reporters.test.ts
    detect-pm.test.ts
    format-console.test.ts
    format-gfm.test.ts
  schemas/
    AgentReport.test.ts
    CacheManifest.test.ts
    Coverage.test.ts
```

### Patterns

Each service test follows the state-container pattern:

```typescript
const run = <A, E>(effect: Effect.Effect<A, E, CacheReader>) =>
  Effect.runPromise(Effect.provide(effect, testLayer));

const readManifest = (dir: string) =>
  Effect.flatMap(CacheReader, (svc) => svc.readManifest(dir));

describe("CacheReaderLive", () => {
  it("reads manifest from cache dir", async () => {
    const result = await run(readManifest("/tmp/cache"));
    expect(Option.isSome(result)).toBe(true);
  });
});
```

Test layers swap `@effect/platform` FileSystem for mock
implementations. Reporter integration tests compose test layers:

```typescript
const TestReporterLive = Layer.mergeAll(
  CacheWriterTest.layer(writeState),
  CoverageAnalyzerTest.layer(),
);
```

CLI commands are not tested directly (thin wrappers). Logic lives in
`cli/lib/` and is tested as pure functions.

---

## Dependencies

### Added

| Package | Purpose |
| ------- | ------- |
| `effect` | Core runtime, Schema, services |
| `@effect/cli` | CLI command framework |
| `@effect/platform` | FileSystem, Path abstractions |
| `@effect/platform-node` | Node.js live implementations |
| `std-env` | Agent and runtime detection |

### Removed

| Package | Reason |
| ------- | ------ |
| `zod` | Replaced by Effect Schema |

### package.json

```json
{
  "bin": {
    "vitest-agent-reporter": "./bin/vitest-agent-reporter.js"
  }
}
```

The builder handles compilation of the bin entry point.
`@savvy-web/rslib-builder` preserves `bin` fields during package.json
transformation and bundles the CLI entry point. The `rslib.config.ts`
`transform()` callback may need updating to ensure the `bin` field
points to the correct compiled path in `dist/npm/`. Reference
`@savvy-web/lint-staged` for a working example of this pattern.
