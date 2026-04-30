# vitest-agent-reporter

The Vitest-API-aware package. Owns `AgentReporter` (a Vitest Reporter v2
implementation), `AgentPlugin` (a Vitest plugin), `CoverageAnalyzer` (the
only Effect service that touches istanbul `CoverageMap` data), and
`ReporterLive`. Declares `vitest-agent-reporter-cli` and
`vitest-agent-reporter-mcp` as **required** peerDependencies.

## Layout

```text
src/
  index.ts            -- public re-exports (AgentReporter, AgentPlugin,
                         schemas re-exported from -shared for backward
                         compatibility)
  reporter.ts         -- AgentReporter class (async onInit + ensureDbPath)
  plugin.ts           -- AgentPlugin (async configureVitest hook)
  services/
    CoverageAnalyzer.ts  -- only istanbul-aware service
  layers/
    CoverageAnalyzerLive.ts / CoverageAnalyzerTest.ts
    ReporterLive.ts      -- (dbPath, logLevel?, logFile?) composition
  utils/
    capture-env.ts        -- captures CI/GitHub/Runner env vars
    capture-settings.ts   -- captures Vitest config + computes hash
                             (SettingsInput now lives in shared/DataStore)
    resolve-thresholds.ts -- parses Vitest-native coverageThresholds
    strip-console-reporters.ts -- removes console reporters in own mode
```

## Key files

| File | Purpose |
| ---- | ------- |
| `reporter.ts` | `AgentReporter` class. `onInit` is async (resolves `dbPath` via XDG stack). `onTestRunEnd` awaits `ensureMigrated` before the main `Effect.runPromise`. Filters by `projectFilter`; alphabetical coverage dedup |
| `plugin.ts` | `AgentPlugin` factory. Async `configureVitest` runs `EnvironmentDetector` -> `ExecutorResolver`, sets `coverage.reporter = []` in agent/own mode, passes `project.name` as `projectFilter` |
| `services/CoverageAnalyzer.ts` | Duck-types istanbul `CoverageMap`; `process` (full) and `processScoped` (filtered to tested files) effects |
| `layers/ReporterLive.ts` | `(dbPath, logLevel?, logFile?)` composition: DataStore + DataReader + CoverageAnalyzer + HistoryTracker + OutputPipeline + SqliteClient + Migrator + Logger |
| `utils/strip-console-reporters.ts` | Strips `default`/`verbose`/`tree`/`dot`/`tap`/`tap-flat`/`hanging-process`/`agent` in own mode; preserves `json`/`junit`/`html`/`blob`/`github-actions` |

## Conventions

- **Required peerDependencies on cli + mcp.** `vitest-agent-reporter-cli`
  and `vitest-agent-reporter-mcp` are declared `optional: false`.
  Installing the reporter pulls both. Don't relax this without a
  changeset and a release-coordination plan.
- **Vitest API knowledge stays here.** No other package imports
  `vitest`/`vitest/node` types. CLI and MCP read pre-processed data
  from SQLite via `DataReader` -- they never see a `TestModule` or a
  `CoverageMap`.
- **Duck-typed Vitest interfaces.** `utils/build-report.ts` (in shared)
  defines structural `VitestTestModule`/`VitestTestCase` types; don't
  hard-import Vitest's own types into report-building paths.
- **Strategy values:** `"complement"` (default; layers on Vitest's
  built-in `agent` reporter) vs `"own"` (strips console reporters,
  formats output ourselves, sets `coverage.reporter = []`).
- **Per-call layer construction.** Reporter hooks build a scoped
  effect and `Effect.runPromise` it with `ReporterLive(dbPath)`
  inline. No `ManagedRuntime` (that's MCP's pattern). See Decision 7.

## When working in this package

- `onInit` is async. Anyone manually instantiating `AgentReporter` (not
  going through `AgentPlugin`) must await it. Don't synchronously call
  `onInit` in tests.
- `ensureDbPath()` short-circuits when `options.cacheDir` is set --
  this skips the heavy `WorkspacesLive` lockfile scan. Keep that
  path fast; the XDG branch is the slow one by design.
- Multi-project Vitest configs: each project gets its own reporter
  instance via `projectFilter`. Coverage dedup runs only on the
  alphabetically-first project. Test changes against multi-project
  fixtures in `examples/`.
- Migration coordination: `onTestRunEnd` calls `await
  ensureMigrated(dbPath, ...)` BEFORE the main `Effect.runPromise`.
  Don't move migration into the reporter's Effect program -- it must
  be process-level (Decision 28).
- Plugin `cacheDir` resolution dropped its third Vite-cacheDir
  fallback in 2.0. When `reporter.cacheDir` and `outputFile` are
  both unset, pass `cacheDir: undefined` to the reporter and let
  XDG resolution take over.
- `CoverageAnalyzer` is the ONE service that lives here (not in
  shared) because nothing else exercises istanbul data. Don't move
  it.

## Design references

@../../.claude/design/vitest-agent-reporter/architecture.md
@../../.claude/design/vitest-agent-reporter/components.md
@../../.claude/design/vitest-agent-reporter/decisions.md
