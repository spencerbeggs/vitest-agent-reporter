# vitest-agent-reporter

## 1.0.0

### Breaking Changes

* [`b2ef93a`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/b2ef93ab7ff9f023957c47b26f252d5c8f8620db) `CacheReader` service replaced by `DataReader`
* `CacheReaderLive` layer replaced by `DataReaderLive`
* `CacheWriter` service replaced by `DataStore`
* `CacheWriterLive` layer replaced by `DataStoreLive`
* `CacheError` replaced by `DataStoreError`
* `AgentDetection` service replaced by `EnvironmentDetector`
* `AgentDetectionLive` layer replaced by `EnvironmentDetectorLive`
* `HistoryTracker.classify` signature changed (`cacheDir` removed, `subProject` added)
* `ReporterLive` and `CliLive` are now functions of `dbPath` (not static layers)
* JSON cache files no longer written (SQLite replaces them)
* `manifest.json` no longer exists (computed from SQL queries)
* `consoleStrategy` option mapped to `format` internally (`complement` becomes `vitest-bypass`, `own` becomes `markdown`)
* Three-environment model (`agent`/`ci`/`human`) replaced by four-environment model (`agent-shell`/`terminal`/`ci-github`/`ci-generic`)

### Features

* [`b2ef93a`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/b2ef93ab7ff9f023957c47b26f252d5c8f8620db) ### SQLite Persistence

Replaced JSON file persistence with a normalized 25-table SQLite database via `@effect/sql-sqlite-node`. All test data -- runs, modules, suites, test cases, errors, coverage, history, baselines, trends, and notes -- stored in a single `data.db` file.

* `DataStore` and `DataReader` Effect services for typed SQL writes and reads
* Migration-based schema management via `SqliteMigrator`
* File path interning, settings snapshots with env var tracking
* Git commit/branch correlation on test runs
* Invocation ID for monorepo run correlation
* Notes system with FTS5 full-text search, scoping, threading, and expiration
* Source-to-test file mapping, suite hierarchy preservation
* `splitProject()` utility for `project:subProject` convention
* `captureSettings()` and `captureEnvVars()` for configuration snapshots

### Output Pipeline

Formalized output rendering into five composable Effect services replacing ad-hoc formatting logic.

* `EnvironmentDetector` -- four-environment detection via `std-env` (`agent-shell`, `terminal`, `ci-github`, `ci-generic`)
* `ExecutorResolver` -- maps environment + mode to executor role (`human`, `agent`, `ci`)
* `FormatSelector` -- selects output format (`markdown`, `json`, `vitest-bypass`, `silent`)
* `DetailResolver` -- determines verbosity from run health (`minimal`, `neutral`, `standard`, `verbose`)
* `OutputRenderer` -- dispatches to registered `Formatter` implementations
* Four built-in formatters: `MarkdownFormatter`, `GfmFormatter`, `JsonFormatter`, `SilentFormatter`
* `OutputPipelineLive` composition layer included in `ReporterLive`, `CliLive`, and `McpLive`
* `--format` flag on all CLI commands for markdown/json output
* `format`, `detail`, and `mode` options on `AgentReporterOptions`

### MCP Server

New MCP server entry point (`vitest-agent-reporter-mcp`) exposing 16 tools over stdio transport for LLM agent integration.

* tRPC router with Effect Schema validators (`Schema.standardSchemaV1`)
* `@modelcontextprotocol/sdk` stdio transport with `McpServer` + `StdioServerTransport`
* Test data tools: `test_status`, `test_overview`, `test_coverage`, `test_history`, `test_trends`, `test_errors`, `test_for_file`
* Action tools: `run_tests` (with argument sanitization via `spawnSync`), `cache_health`, `configure`
* Note CRUD tools: `note_create`, `note_list`, `note_get`, `note_update`, `note_delete`, `note_search`
* `McpLive` composition layer with `ManagedRuntime` for long-lived process

### Claude Code Plugin

File-based Claude Code plugin with MCP auto-registration, hooks, skills, and commands.

* `.mcp.json` auto-registers the MCP server when the plugin is enabled
* `SessionStart` hook injects project status and available tools into Claude's context
* `PostToolUse` hook detects test runs and suggests MCP tools when tests fail
* Skills: TDD workflow, debugging guide, configuration reference
* Commands: `/setup` (add plugin to vitest config), `/configure` (view/modify settings)
* Distributed via `spencerbeggs/bot` Claude Code marketplace

## 0.3.0

### Breaking Changes

* [`32a01ac`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/32a01ac771e87500c7411e47b31cefacd07df9c4) `coverageThreshold: number` replaced by `coverageThresholds` (Vitest
  `coverage.thresholds` format)
* `CoverageReport.threshold` replaced by `CoverageReport.thresholds`
  object with `global` and `patterns` fields

### Features

* [`32a01ac`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/32a01ac771e87500c7411e47b31cefacd07df9c4) Restructure as pnpm monorepo with publishable package in `package/`
  and example workspaces in `examples/`
* Replace `coverageThreshold` with Vitest-native `coverageThresholds`
  format supporting per-metric, per-glob, and negative number semantics
* Add `coverageTargets` for aspirational coverage goals with
  auto-ratcheting baselines stored in the cache
* Add per-project coverage trend tracking with 50-entry sliding window
* Add tiered console output: green (targets met), yellow (below
  targets), red (failures or threshold violations)
* Add `trends` CLI command for coverage trajectory analysis
* Add `cache path` and `cache clean` commands for cache management
* Add `doctor` command for cache health diagnostics

### Bug Fixes

* [`32a01ac`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/32a01ac771e87500c7411e47b31cefacd07df9c4) Fix CLI cache directory resolution for Vite's hash-based vitest
  subdirectory (`node_modules/.vite/vitest/<hash>/`)

## 0.2.1

### Bug Fixes

* [`1f951fd`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/1f951fd916f3d8f98e3dedcbccc282b8f35d0b60) Execute the cli with `@efffect/platform-node`

## 0.2.0

### Bug Fixes

* [`73b0c82`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/73b0c82388780520ae91b6d81996c41953e68b03) Forgot to link the cli correctly, my bad

## 0.1.0

### Features

* [`3ef80f9`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/3ef80f926388a296442f0488782381d13e02df5f) **AgentReporter** -- Vitest Reporter producing structured markdown to
  console, persistent JSON to disk per project, and optional GFM for
  GitHub Actions check runs. Groups results by project natively via the
  Reporter v2 API. Uses Effect services for file I/O and coverage
  processing via `Effect.runPromise` with scoped layers.
* **AgentPlugin** -- Vitest plugin that auto-injects AgentReporter with
  three-environment detection (agent/CI/human) via `std-env`. Two console
  strategies: `"complement"` (default) layers on Vitest's built-in agent
  reporter, adding JSON cache and manifest; `"own"` takes over console
  output entirely, stripping built-in reporters.
* **CLI bin** (`vitest-agent-reporter`) with four on-demand commands:
  * `status` -- per-project pass/fail state from cached results
  * `overview` -- test landscape summary with file-to-test mapping
  * `coverage` -- coverage gap analysis using thresholds from cached reports
  * `history` -- failure trend analysis with P/F visualization, flaky
    detection, and persistent failure tracking
* **Agent detection** via `std-env` (covers Claude Code, Cursor, Gemini
  CLI, Codex, Devin, Augment, Goose, Kiro, and more)
* **Coverage integration** with istanbul duck-typing (works with both
  `@vitest/coverage-v8` and `@vitest/coverage-istanbul`)
* **Scoped coverage** for partial test runs -- only flags threshold
  violations for files related to the tests that were run
* **Manifest-first cache** -- agents read `manifest.json` once to find
  failing projects, then selectively read only those report files
* **Effect Schema** for all data structures (reports, manifests, options)
  with `CacheReader` and `CacheReaderLive` exported for programmatic
  cache access
* **GitHub Actions GFM** -- auto-detected, writes structured summaries to
  `GITHUB_STEP_SUMMARY` with collapsible per-project details
* **Cache directory resolution** -- derives from Vite's cacheDir by default,
  configurable via explicit option or `outputFile` config
* **Coverage thresholds** read from Vitest config automatically
* **Compact console output** with failure details, error diffs, coverage
  gaps with uncovered line ranges, and re-run commands
* **Failure history** -- per-test pass/fail tracking across runs in a
  10-run sliding window with automatic classification: `new-failure`,
  `persistent`, `flaky`, `recovered`, `stable`
* **Classification-driven suggestions** -- console output labels failed
  tests with their classification and provides prioritized next steps
  (new failures first, then persistent, then flaky)
