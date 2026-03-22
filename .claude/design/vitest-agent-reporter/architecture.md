---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-03-22
last-synced: 2026-03-22
completeness: 90
related:
  - vitest-agent-reporter/components.md
  - vitest-agent-reporter/decisions.md
  - vitest-agent-reporter/data-structures.md
  - vitest-agent-reporter/testing-and-phases.md
dependencies: []
---

# Vitest LLM Reporter - Architecture

A Vitest reporter that outputs structured markdown to console and persistent
JSON to disk for LLM coding agents, with optional GFM output for GitHub
Actions check runs, a CLI bin for on-demand test landscape queries, and
Effect-based service architecture for testability.

## Progressive Loading

This architecture documentation is split across focused sub-documents. Load
only what you need for the task at hand.

| Document | Load when... | Content |
| -------- | ------------ | ------- |
| [components.md](./components.md) | Working on specific components, need API details | 17 component descriptions with interfaces and dependencies |
| [decisions.md](./decisions.md) | Need to understand "why" something was built a certain way | 17 architectural decisions, 7 design patterns, constraints/trade-offs |
| [data-structures.md](./data-structures.md) | Working with schemas, cache format, output, or data flow | File structure, TypeScript interfaces, cache layout, output format, data flow diagrams, integration points |
| [testing-and-phases.md](./testing-and-phases.md) | Writing tests, reviewing test coverage, or checking phase status | 36 test files, test patterns, Phase 1-4 history |

---

## Overview

`vitest-agent-reporter` provides exports targeting LLM coding agents and CI
systems, implemented across four phases:

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
3. **CLI bin** (Phase 2-4, COMPLETE) -- `vitest-agent-reporter` CLI via
   `@effect/cli` with `status`, `overview`, `coverage`, `history`,
   `trends`, `cache`, and `doctor` subcommands. Reads cached test data
   on-demand for LLM-oriented test landscape queries. Uses ProjectDiscovery
   and CacheReader Effect services.
4. **Suggested actions & failure history** (Phase 3, COMPLETE) --
   actionable suggestions in console output and per-test failure persistence
   across runs for regression vs flake detection. Uses HistoryTracker Effect
   service with 10-entry sliding window. Classifies tests as new-failure,
   persistent, flaky, stable, or recovered. History files written alongside
   report cache. CLI `history` command surfaces flaky and persistent failures.
5. **Coverage thresholds, baselines, and trends** (Phase 4, COMPLETE) --
   Vitest-native `coverageThresholds` format (per-metric, per-glob, negative
   numbers, `100` shorthand, `perFile`) replaces the single
   `coverageThreshold: number`. New `coverageTargets` option for aspirational
   goals. Auto-ratcheting baselines persist high-water marks and advance
   toward targets. Per-project coverage trends with 50-entry sliding window
   track direction over time. Tiered console output (green/yellow/red) adapts
   detail level to run health. CLI `trends`, `cache`, and `doctor` commands
   added.

The package complements Vitest's built-in `agent` reporter. The built-in
handles console noise suppression in-process; this package adds persistence
across runs, coverage with uncovered line ranges and Vitest-native threshold
format, auto-ratcheting baselines toward aspirational targets, coverage
trend tracking, monorepo-aware caching via a manifest file, GFM output for
CI, scoped coverage for partial test runs, and agent tooling for test
discovery via the CLI.

The repository is structured as a pnpm monorepo with workspaces: `package`
(the publishable npm package) and `examples/*` (test projects for
integration testing). The root `vitest.config.ts` imports from
`./package/src/plugin.js`.

---

## Key Design Principles

- **Effect service architecture** -- all I/O and shared logic encapsulated
  in Effect services (CacheWriter, CacheReader, CoverageAnalyzer,
  ProjectDiscovery, AgentDetection, HistoryTracker) with live and test layer
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
- **Three-level coverage model** -- Vitest-native `coverageThresholds`
  (enforced minimums), `coverageTargets` (aspirational goals), and
  auto-ratcheting baselines that advance high-water marks toward targets
- **Coverage trends** -- per-project trend tracking with 50-entry sliding
  window, target change detection via hash comparison, direction analysis
- **Tiered console output** -- green (all pass, targets met), yellow
  (pass but below targets), red (failures/threshold violations/regressions)
  with progressively more detail at each tier
- **Progressive enhancement** -- Phase 1 is a standalone reporter; Phase 2
  adds Effect services, CLI tooling, and hybrid mode; Phase 3 adds failure
  history; Phase 4 adds coverage thresholds, baselines, and trends

---

## Architecture Diagram

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
               |  4. Resolve coverage thresh |
               |     + targets + autoUpdate |
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
     |    +-- HistoryTracker.classify(outcomes)     |
     |    +-- attach classifications to TestReports |
     |    +-- CacheReader.readBaselines()           |
     |    +-- computeTrend() + writeTrends()        |
     |    +-- CacheWriter.writeBaselines()          |
     |    +-- CacheWriter.writeReport() per project |
     |    +-- CacheWriter.writeHistory() per project|
     |    +-- CacheWriter.writeManifest()           |
     |    +-- formatConsoleMarkdown() -> stdout      |
     |    +-- formatGfm() -> FileSystem.append       |
     +--------------------------------------------+
               |              |              |
               v              v              v
          +---------+  +--------------+  +----------+
          | stdout  |  |  cacheDir/   |  | GITHUB_  |
          | (md)    |  |  reports/    |  | STEP_    |
          +---------+  |  history/    |  | SUMMARY  |
                       |  trends/    |  +----------+
                       |  baselines  |
                       |  manifest   |
                       +--------------+
                              ^
                              |
     +--------------------------------------------+
     |           CLI Bin (on-demand)               |
     |     (NodeRuntime.runMain + CliLive)         |
     |                                             |
     |  status  -- manifest + per-project state    |
     |  overview -- test landscape + file mapping  |
     |  coverage -- gap analysis from cached data  |
     |  history -- flaky/persistent failure trends |
     |  trends  -- coverage trend visualization    |
     |  cache   -- path / clean cache management   |
     |  doctor  -- 5-point cache health diagnostic |
     |                                             |
     |  Uses: CacheReader, ProjectDiscovery,       |
     |        HistoryTracker                       |
     +--------------------------------------------+
```

---

## Component Summary

| # | Component | Location | Status |
| - | --------- | -------- | ------ |
| 1 | AgentReporter | `package/src/reporter.ts` | COMPLETE |
| 2 | AgentPlugin | `package/src/plugin.ts` | COMPLETE |
| 3 | Effect Services (6) | `package/src/services/` | COMPLETE |
| 4 | Effect Layers | `package/src/layers/` | COMPLETE |
| 5 | Error Types | `package/src/errors/` | COMPLETE |
| 6 | Schemas | `package/src/schemas/` | COMPLETE |
| 7 | CLI Bin | `package/src/cli/` | COMPLETE |
| 8 | Console Formatter | `package/src/utils/format-console.ts` | COMPLETE |
| 9 | Report Builder | `package/src/utils/build-report.ts` | COMPLETE |
| 10 | GFM Formatter | `package/src/utils/format-gfm.ts` | COMPLETE |
| 11 | PM Detection | `package/src/utils/detect-pm.ts` | COMPLETE |
| 12 | Utilities | `package/src/utils/` | COMPLETE |
| 13 | Failure History | `package/src/services/HistoryTracker.ts`, `package/src/schemas/History.ts` | COMPLETE |
| 14 | Coverage Thresholds | `package/src/schemas/Thresholds.ts`, `package/src/utils/resolve-thresholds.ts` | COMPLETE |
| 15 | Coverage Baselines | `package/src/schemas/Baselines.ts` | COMPLETE |
| 16 | Coverage Trends | `package/src/schemas/Trends.ts`, `package/src/utils/compute-trend.ts` | COMPLETE |
| 17 | CLI Diagnostics | `package/src/cli/commands/doctor.ts`, `package/src/cli/commands/cache.ts`, `package/src/cli/commands/trends.ts` | COMPLETE |

For detailed component descriptions, interfaces, and APIs:
--> [components.md](./components.md)

---

## Current Limitations

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

## Quick Reference

**When to load sub-documents:**

- Modifying a component --> [components.md](./components.md)
- Understanding a design decision --> [decisions.md](./decisions.md)
- Working with data schemas or output format --> [data-structures.md](./data-structures.md)
- Writing or reviewing tests --> [testing-and-phases.md](./testing-and-phases.md)
- Checking Phase 4 plan --> [testing-and-phases.md](./testing-and-phases.md)

**36 test files, 429 tests total.** All coverage metrics above 80%.

**Document Status:** Current -- reflects Phase 1, Phase 2, Phase 3, and
Phase 4 implementation as built. All phases complete.
