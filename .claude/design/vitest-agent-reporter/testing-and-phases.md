---
status: current
module: vitest-agent-reporter
category: testing
created: 2026-03-20
updated: 2026-03-22
last-synced: 2026-03-22
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

**Location:** `package/src/**/*.test.ts`

**Test structure mirrors source.** Services are tested through their layers.
CLI logic is tested through lib functions.

**Implemented tests (Phase 1-2-3-4):**

- `utils/compress-lines.test.ts` -- `compressLines()` edge cases
- `utils/safe-filename.test.ts` -- `safeFilename()` sanitization
- `utils/ansi.test.ts` -- `ansi()`/`stripAnsi()`, `NO_COLOR` behavior
- `utils/strip-console-reporters.test.ts` -- `stripConsoleReporters()`
  (string, tuple, class instance filtering)
- `utils/detect-pm.test.ts` -- `detectPackageManager()` with mock FS,
  `getRunCommand()` for all package managers
- `utils/build-report.test.ts` -- `buildAgentReport()` with mock Vitest
  objects, tallying, error extraction, omitPassingTests behavior
- `utils/format-console.test.ts` -- `formatConsoleMarkdown()` tiered
  output, coverage gaps, trend summaries, CLI hints
- `utils/format-gfm.test.ts` -- `formatGfm()` single and multi-project
  output, coverage tables, details blocks
- `utils/resolve-thresholds.test.ts` -- `resolveThresholds()` Vitest-native
  format parsing, `100` shorthand, per-glob patterns, `getMinThreshold()`
- `utils/compute-trend.test.ts` -- `computeTrend()` trend entry computation,
  sliding window, target hash change detection, `getRecentDirection()`
- `schemas/Common.test.ts` -- shared literal schema validation
- `schemas/AgentReport.test.ts` -- report schema validation and encoding
- `schemas/CacheManifest.test.ts` -- manifest schema validation
- `schemas/Coverage.test.ts` -- coverage schema validation, thresholds
  object format, targets, baselines
- `schemas/Baselines.test.ts` -- CoverageBaselines schema validation
- `schemas/Trends.test.ts` -- TrendEntry, TrendRecord schema validation
- `schemas/Options.test.ts` -- reporter + plugin + coverage options schema
  validation
- `services/services.test.ts` -- service Context.Tag definitions
- `errors/errors.test.ts` -- CacheError and DiscoveryError tagged error types
- `layers/AgentDetectionLive.test.ts` -- std-env integration, live layer
- `layers/CacheWriterLive.test.ts` -- file write via mock FileSystem,
  including writeBaselines and writeTrends
- `layers/CacheReaderLive.test.ts` -- file read via mock FileSystem,
  corrupt/invalid JSON error paths, readBaselines, readTrends
- `layers/CoverageAnalyzerLive.test.ts` -- coverage processing, scoped
  coverage, bare-zero handling, test layer
- `layers/ProjectDiscoveryLive.test.ts` -- test file discovery, source
  mapping
- `layers/HistoryTrackerLive.test.ts` -- classification logic, sliding
  window (new-failure, persistent, flaky, stable, recovered)
- `layers/ReporterLive.test.ts` -- merged layer composition
- `schemas/History.test.ts` -- TestRun, TestHistory, HistoryRecord schema
  validation
- `cli/lib/format-status.test.ts` -- status formatting
- `cli/lib/format-overview.test.ts` -- overview formatting
- `cli/lib/format-coverage.test.ts` -- coverage formatting with thresholds
  object
- `cli/lib/format-history.test.ts` -- history formatting (flaky/persistent/
  recovered display, P/F visualization)
- `cli/lib/format-trends.test.ts` -- trends formatting (direction, metrics,
  sparkline)
- `cli/lib/format-doctor.test.ts` -- doctor diagnostic formatting
- `cli/lib/resolve-cache-dir.test.ts` -- cache dir resolution including
  Vite hash-based subdirectory search
- `reporter.test.ts` -- `AgentReporter` lifecycle integration tests,
  including history classification, writeHistory, writeBaselines,
  writeTrends invocation
- `plugin.test.ts` -- `AgentPlugin` environment detection, reporter
  injection, cache directory resolution, coverage threshold/target
  resolution, consoleStrategy behavior, autoUpdate disabling

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
- Public API exports via `package/src/index.ts` (reporter, plugin, schemas, types)
- Comprehensive unit and integration tests for all modules

**Note:** Phase 1 source files were restructured during Phase 2. See Phase
2 deliverables for current file locations.

### Phase 2: Effect Services, CLI Bin, and Hybrid Mode -- COMPLETE

**Goal:** Migrate to Effect service architecture, add CLI bin for on-demand
test landscape queries, introduce hybrid console strategy, and fix Phase 1
bugs.

**Deliverables (all implemented):**

- Migrated from Zod to Effect Schema (`package/src/schemas/` directory)
- Five Effect services: AgentDetection, CacheWriter, CacheReader,
  CoverageAnalyzer, ProjectDiscovery (`package/src/services/`)
- Live and test layers for all services (`package/src/layers/`)
- Merged composition layers: ReporterLive, CliLive
- Tagged error types: CacheError, DiscoveryError (`package/src/errors/`)
- CLI bin with `status`, `overview`, `coverage` commands (`package/src/cli/`)
- `consoleStrategy` option (`"own" | "complement"`, default `"complement"`)
- Scoped coverage support via CoverageAnalyzer.processScoped()
- `std-env` integration replacing hand-rolled environment detection
- Restructured utils from single file to `package/src/utils/` directory
- Relocated formatters from `package/src/formatters/` to `package/src/utils/`
- Bug fix: unhandledErrors now attached to ALL project reports
- Bug fix: `includeBareZero` works correctly at threshold 0

**Breaking changes from Phase 1:**

- Zod replaced by Effect Schema (all schema exports changed)
- `consoleStrategy` defaults to `"complement"` (Phase 1 was implicitly
  `"own"`)
- `detectEnvironment()` and `isGitHubActions()` utilities removed (replaced
  by AgentDetection service)
- `package/src/schemas.ts` and `package/src/types.ts` removed (replaced by
  `package/src/schemas/`)
- `package/src/coverage.ts` removed (replaced by CoverageAnalyzer service)

**Dependencies added:** `effect`, `@effect/cli`, `@effect/platform`,
`@effect/platform-node`, `std-env`

**Dependencies removed:** `zod`

**Source files:**

- `package/src/reporter.ts`, `package/src/plugin.ts`, `package/src/index.ts`
- `package/src/services/*.ts`, `package/src/layers/*.ts`,
  `package/src/errors/*.ts`
- `package/src/schemas/*.ts`, `package/src/utils/*.ts`
- `package/src/cli/index.ts`, `package/src/cli/commands/*.ts`,
  `package/src/cli/lib/*.ts`
- `package/bin/vitest-agent-reporter.js`

**Depends on:** Phase 1 (architecture, data structures, test patterns)

### Phase 3: Suggested Actions and Failure History -- COMPLETE

**Goal:** Actionable intelligence in reporter output -- what to do next,
and whether failures are new, persistent, or flaky.

**Deliverables (all implemented):**

- `History.ts` schema (`TestRun`, `TestHistory`, `HistoryRecord`) for
  failure persistence
- `HistoryTracker` Effect service (`package/src/services/HistoryTracker.ts`)
  with
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

- `package/src/services/HistoryTracker.ts`
- `package/src/layers/HistoryTrackerLive.ts`,
  `package/src/layers/HistoryTrackerTest.ts`
- `package/src/schemas/History.ts`
- `package/src/cli/commands/history.ts`,
  `package/src/cli/lib/format-history.ts`

**Depends on:** Phase 1 (report data structures), Phase 2 (Effect services,
CacheReader/CacheWriter, CliLive/ReporterLive composition)

### Phase 4: Coverage Thresholds, Baselines, and Trends -- COMPLETE

**Goal:** Replace the single `coverageThreshold: number` with Vitest-native
threshold format, add aspirational targets with auto-ratcheting baselines,
per-project coverage trend tracking, tiered console output, and new CLI
commands for cache management and diagnostics.

**Deliverables (all implemented):**

- **Monorepo restructuring:** source moved from `src/` to `package/src/`;
  root is pnpm monorepo with `package` (publishable) and `examples/*`
  (test projects) workspaces
- **Coverage thresholds overhaul (breaking change):**
  `coverageThreshold: number` replaced by `coverageThresholds` (Vitest-native
  format: per-metric, per-glob, negative numbers, `100` shorthand, `perFile`).
  `extractCoverageThreshold` deleted, replaced by `resolveThresholds` utility.
  `CoverageReport.threshold` (number) replaced by `CoverageReport.thresholds`
  (object with global + patterns)
- **Coverage targets:** new `coverageTargets` option (same format as
  thresholds) for aspirational goals. Plugin disables Vitest's native
  `autoUpdate` when our targets are set
- **Coverage baselines:** `baselines.json` in cache directory stores
  high-water marks per metric. Reporter reads baselines, computes updated
  baselines, writes them back. Baselines ratchet up but never past targets.
  `autoUpdate` option (default true) controls auto-ratcheting
- **Coverage trends:** per-project trend tracking with 50-entry sliding
  window. Only recorded on full (non-scoped) runs. Target change detection
  via hash comparison resets trend history. `TrendEntry` and `TrendRecord`
  schemas, `computeTrend` utility
- **Tiered console output:** green (all pass, targets met -- minimal),
  yellow (pass but below targets -- improvements + CLI hint), red
  (failures/violations/regressions -- full detail + CLI hints). Trend
  summary line after header. CLI command suggestions use detected PM
- **New CLI commands:** `cache path` (resolved cache dir), `cache clean`
  (delete cache), `doctor` (5-point health diagnostic), `trends`
  (per-project trend display with direction, metrics, sparkline)
- **CLI cache resolution fix:** `resolveCacheDir` now searches
  `node_modules/.vite/vitest/*/vitest-agent-reporter` for Vite's
  hash-based cache subdirectory
- **New schemas:** `Thresholds.ts` (MetricThresholds, PatternThresholds,
  ResolvedThresholds), `Baselines.ts` (CoverageBaselines), `Trends.ts`
  (TrendEntry, TrendRecord)
- **New utilities:** `resolve-thresholds.ts`, `compute-trend.ts`
- **New service methods:** `CacheReader.readBaselines`, `readTrends`;
  `CacheWriter.writeBaselines`, `writeTrends`
- **New `CoverageOptions` and `FormatterOptions` schemas** in Options.ts

**Breaking changes from Phase 3:**

- `coverageThreshold: number` replaced by
  `coverageThresholds: Record<string, unknown>` in `AgentReporterOptions`
- `CoverageReport.threshold` (number) replaced by
  `CoverageReport.thresholds` (object with `global` and `patterns`)
- `extractCoverageThreshold()` function removed
- Console output format changed to tiered model

**New test files:**

- `schemas/Baselines.test.ts`
- `schemas/Trends.test.ts`
- `utils/resolve-thresholds.test.ts`
- `utils/compute-trend.test.ts`
- `cli/lib/format-trends.test.ts`
- `cli/lib/format-doctor.test.ts`

**Modified test files:** `schemas/Coverage.test.ts`,
`schemas/Options.test.ts`, `layers/CacheWriterLive.test.ts`,
`layers/CacheReaderLive.test.ts`, `layers/CoverageAnalyzerLive.test.ts`,
`layers/ReporterLive.test.ts`, `reporter.test.ts`, `plugin.test.ts`,
`cli/lib/format-coverage.test.ts`, `cli/lib/format-console.test.ts`,
`cli/lib/resolve-cache-dir.test.ts`

**Source files:**

- `package/src/schemas/Thresholds.ts`, `package/src/schemas/Baselines.ts`,
  `package/src/schemas/Trends.ts`
- `package/src/utils/resolve-thresholds.ts`,
  `package/src/utils/compute-trend.ts`
- `package/src/cli/commands/cache.ts`,
  `package/src/cli/commands/doctor.ts`,
  `package/src/cli/commands/trends.ts`
- `package/src/cli/lib/format-doctor.ts`,
  `package/src/cli/lib/format-trends.ts`

**Depends on:** Phase 2 (Effect services, CacheReader/CacheWriter, CLI
framework), Phase 3 (HistoryTracker, ReporterLive/CliLive composition)

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

**Document Status:** Current -- reflects Phase 1, Phase 2, Phase 3, and
Phase 4 implementation as built. 429 tests across 36 files, all coverage
metrics above 80%. All phases complete.
