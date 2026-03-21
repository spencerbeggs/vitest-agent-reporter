---
status: current
module: vitest-agent-reporter
category: testing
created: 2026-03-20
updated: 2026-03-21
last-synced: 2026-03-20
completeness: 90
related:
  - vitest-agent-reporter/architecture.md
  - vitest-agent-reporter/components.md
dependencies: []
---

# Testing Strategy & Implementation Phases -- vitest-agent-reporter

Testing approach, test patterns, and implementation phase history.

**Parent document:** [architecture.md](./architecture.md)

---

## Testing Strategy

### Unit Tests

**Location:** `src/**/*.test.ts`

**Test structure mirrors source.** Services are tested through their layers.
CLI logic is tested through lib functions.

**Implemented tests (Phase 1-2-3):**

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
- `layers/HistoryTrackerLive.test.ts` -- classification logic, sliding
  window (new-failure, persistent, flaky, stable, recovered), 14 tests
- `layers/ReporterLive.test.ts` -- merged layer composition
- `schemas/History.test.ts` -- TestRun, TestHistory, HistoryRecord schema
  validation
- `cli/lib/format-status.test.ts` -- status formatting
- `cli/lib/format-overview.test.ts` -- overview formatting
- `cli/lib/format-coverage.test.ts` -- coverage formatting
- `cli/lib/format-history.test.ts` -- history formatting (flaky/persistent/
  recovered display, P/F visualization), 13 tests
- `cli/lib/resolve-cache-dir.test.ts` -- cache dir resolution
- `reporter.test.ts` -- `AgentReporter` lifecycle integration tests,
  including history classification and writeHistory invocation
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
  HistoryTrackerTest.layer(),
  CacheReaderTest.layer(readState),
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

### Phase 3: Suggested Actions and Failure History -- COMPLETE

**Goal:** Actionable intelligence in reporter output -- what to do next,
and whether failures are new, persistent, or flaky.

**Deliverables (all implemented):**

- `History.ts` schema (`TestRun`, `TestHistory`, `HistoryRecord`) for
  failure persistence
- `HistoryTracker` Effect service (`src/services/HistoryTracker.ts`) with
  `classify(outcomes: TestOutcome[])` method
- `HistoryTrackerLive` with 10-entry sliding window and five classifications:
  `new-failure`, `persistent`, `flaky`, `recovered`, `stable`
- `HistoryTrackerTest` test layer with canned classifications
- `CacheWriter.writeHistory` writes history to
  `{cacheDir}/history/{name}.history.json`
- `CacheReader.readHistory` reads history; returns empty record for
  missing/corrupt files (logs warning for corruption)
- `ReporterLive` updated to include HistoryTrackerLive + CacheReaderLive
- `CliLive` updated to include HistoryTrackerLive
- AgentReporter integration: extracts `TestOutcome[]`, classifies, attaches
  `classification` to `TestReport` objects, writes history, populates
  `historyFile` in manifest entries
- Enhanced console output: `[new-failure]` labels on failed tests,
  prioritized suggestions in Next Steps section
- CLI `history` command: shows flaky tests, persistent failures, recovered
  tests with P/F run visualization
- Public API exports: `HistoryRecord`, `TestHistory`, `TestRun` schemas;
  `HistoryTracker` service + `HistoryTrackerLive` layer; `TestOutcome` type;
  `AgentDetection` service

**New test files:**

- `schemas/History.test.ts`
- `layers/HistoryTrackerLive.test.ts` (14 tests)
- `cli/lib/format-history.test.ts` (13 tests)

**Modified test files:** `CacheWriterLive.test.ts`, `CacheReaderLive.test.ts`,
`ReporterLive.test.ts`, `reporter.test.ts`, `format-console.test.ts`

**Source files:**

- `src/services/HistoryTracker.ts`
- `src/layers/HistoryTrackerLive.ts`, `src/layers/HistoryTrackerTest.ts`
- `src/schemas/History.ts`
- `src/cli/commands/history.ts`, `src/cli/lib/format-history.ts`

**Depends on:** Phase 1 (report data structures), Phase 2 (Effect services,
CacheReader/CacheWriter, CliLive/ReporterLive composition)

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

**Document Status:** Current -- reflects Phase 1, Phase 2, and Phase 3
implementation as built. 350 tests across 30 files, all coverage metrics
above 80%. All phases complete.
