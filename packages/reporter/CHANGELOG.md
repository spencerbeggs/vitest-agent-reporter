# vitest-agent-reporter

## 1.3.1

### Bug Fixes

* [`0e0c0ec`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/0e0c0ecdcffb3bd103283715a5c6db84c1ef7352) ### Migration race in multi-project Vitest configs

Fixes intermittent `SqliteError: database is locked` when running tests on a fresh database in a multi-project Vitest configuration. Concurrent reporter instances opening their own SqliteClient connections raced on the initial migration; SQLite's busy\_handler does not retry write-write upgrades in deferred transactions, so one instance failed instead of waiting.

* Added `ensureMigrated(dbPath)` which serializes migrations once per database path within a process, using a `globalThis`-keyed promise cache so it works across the separate plugin module instances Vite creates per project.
* `AgentReporter.onTestRunEnd` now awaits `ensureMigrated(dbPath, logLevel, logFile)` before opening its own runtime; subsequent concurrent reads/writes work normally under WAL plus better-sqlite3's 5s busy\_timeout.

### Useful `DataStoreError` and `DiscoveryError` messages

Reporter failures previously surfaced as `DataStoreError: An error has occurred` with no operation, table, or underlying cause. The custom fields existed but Effect's `Cause.pretty()` ignored them because `message` was empty.

* `DataStoreError` and `DiscoveryError` now expose a derived `message` formatted as `[operation table] reason` (or `[operation path] reason`), so `Cause.pretty()` produces actionable output.
* New exported helper `extractSqlReason(e)` pulls the underlying SQLite message from `SqlError.cause` (e.g. `SQLITE_BUSY: database is locked`, `UNIQUE constraint failed: ...`) instead of the generic `Failed to execute statement` wrapper.
* All `mapError` callsites in `DataStoreLive` and `DataReaderLive` now use `extractSqlReason`, so the reason field reflects what SQLite actually said.

### Claude Code plugin MCP loader

Replaces `npx vitest-agent-reporter-mcp` with a Node loader bundled in the plugin. The previous configuration could fall back to downloading from npm on first run, which can exceed Claude Code's MCP startup window and produces an opaque "MCP server failed to start" with no diagnostic.

* `mcpServers` now lives inline in `plugin/.claude-plugin/plugin.json`; standalone `plugin/.mcp.json` is removed.
* New `plugin/bin/mcp-server.mjs` walks up from `$CLAUDE_PROJECT_DIR` (falling back to `process.cwd()`) looking for `node_modules/vitest-agent-reporter`, reads its `exports['./mcp']`, and dynamically imports it via `file://` URL. The `CLAUDE_PROJECT_DIR` anchor is required for marketplace installs, where the plugin lives under `~/.claude/plugins/...` and the MCP server's spawn-time cwd is unrelated to the user's project.
* The MCP server itself (`mcp/index.ts`) now resolves the user's project dir via `process.env.VITEST_AGENT_REPORTER_PROJECT_DIR` (set by the loader) → `process.env.CLAUDE_PROJECT_DIR` → `process.cwd()`, then threads it explicitly through `resolveDbPath(projectDir)`. This ensures the database is found at `<project>/node_modules/.vite/...` even when two Claude Code sessions in different terminals are running with cwds outside their projects.
* `resolveDbPath` (in `cli/lib/resolve-cache-dir.ts`) now accepts an optional `projectDir` parameter that anchors path resolution. The default of `""` preserves the prior cwd-relative behavior for direct CLI invocations.
* Removed unused `resolveCacheDir` export. It looked for `manifest.json` to identify a cache directory, but Phase 5 stopped writing that file when the cache moved to SQLite, so the function would never have found anything. No CLI command was calling it; `resolveDbPath` is the working replacement.
* Missing-package failure now prints clear stderr instructions for npm/pnpm/yarn/bun and exits non-zero, so the failure mode is diagnosable.
* The plugin's SessionStart hook (`plugin/hooks/session-start.sh`) now also anchors at `$CLAUDE_PROJECT_DIR`, detects the project's package manager (`pnpm exec` / `yarn exec` / `bunx` / `npx --no`), and runs the CLI from the project rather than from the marketplace plugin's install location. Eliminates the same `npx`-fallback latency at session startup.

`vitest-agent-reporter` must now be installed as a project dependency for the Claude Code plugin to work.

## 1.3.0

### Features

* [`bf6d781`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/bf6d781e07a2e2d247edd5056264cd5f1c5f9f7e) The `run_tests` MCP tool now uses Vitest's programmatic API (`createVitest()` + `start()` from `vitest/node`) instead of `spawnSync`. Tests run in-process, results flow through the full reporter pipeline into SQLite, and stdout/stderr are redirected to a null writable to protect the MCP stdio transport. Closes #23.
* Added `test_get` MCP tool for single-test drill-down. Returns the test's current state, error messages, classification badge (`[new-failure]`, `[persistent]`, `[flaky]`, `[stable]`, `[recovered]`), and run history.
* Added `file_coverage` MCP tool for per-file coverage data, returning line, branch, function, and statement percentages along with uncovered line ranges.
* `run_tests` output now includes classification badges and a Next Steps section after the run completes.
* Reporter now captures suite hierarchy via `allSuites()`, writes test tags to the `tags` and `test_case_tags` tables, and parses error stacks into structured `stack_frames` rows.
* Added a `coverage-improvement` skill to the Claude Code plugin with guidance on reading coverage gaps and writing tests to close them.

### Bug Fixes

* [`bf6d781`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/bf6d781e07a2e2d247edd5056264cd5f1c5f9f7e) Fixed a crash when Vitest's `TestCase.diagnostic()` or `TestCase.result()` returns `undefined` for skipped, pending, or todo tests. Null guards have been added at all call sites in the report builder and reporter.
* Fixed `note_get` to return a structured response instead of `null` when a note is found.
* Fixed classification queries passing the wrong `subProject` parameter.
* Fixed nested suite `parentSuiteId` tracking so suite hierarchies are stored correctly in the database.

### Maintenance

* [`bf6d781`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/bf6d781e07a2e2d247edd5056264cd5f1c5f9f7e) Status icons in MCP tool output replaced with Unicode symbols.
* `help.ts` updated to document all 24 current MCP tools.
* Session-start hook trimmed from 63 lines to 15 lines, removing redundant context.
* State enum validation added to the `test_list` discovery tool.

## 1.2.1

### Bug Fixes

* [`3db06ac`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/3db06ac3f75bb46f0f986a716f35fcc49e066d98) Fix hook JSON output validation errors by outputting proper hookSpecificOutput JSON instead of plain markdown, using XML tags for additionalContext, and consuming stdin in SessionStart hook

## 1.2.0

### Features

* [`d3be9f3`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/d3be9f327c6d776cf656eaf764e0f579d1528e3a) ### MCP Help Tool

New `help` MCP tool that returns a complete catalog of all 22 tools organized by category with parameter names and descriptions. Agents can call `help()` to explore available capabilities.

### Bug Fixes

* [`d3be9f3`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/d3be9f327c6d776cf656eaf764e0f579d1528e3a) ### Fatal Error Stack Traces

Fixed fatal errors swallowing stack traces and producing unhelpful `defect: {}` output. All four entry points (reporter, plugin, CLI, MCP server) now use `Cause.pretty()` to extract full error details from Effect FiberFailure instances. Fatal error output includes a link to the issue tracker.

### Plugin Error Handling

The `configureVitest` hook now wraps its body in a try/catch, logging formatted errors to stderr before re-throwing so Vitest knows configuration failed.

### Improved Session Context

The SessionStart hook now explains what vitest-agent-reporter does, encourages MCP tool usage over raw `vitest run` commands, lists all 22 tools (previously 11), and includes `run_tests` usage examples at different scopes.

## 1.1.0

### Features

* [`87d3a86`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/87d3a866cfdcd2acb4ae60fc8def03d933fc084f) Add `project_list` MCP tool to list all known projects with latest run status
* Add `test_list` MCP tool to list test cases with optional state/module/limit filters
* Add `module_list` MCP tool to list test modules (files) for a project
* Add `suite_list` MCP tool to list test suites (describe blocks) for a project
* Add `settings_list` MCP tool to list available settings hashes for the configure tool

All discovery tools return markdown tables with ID columns for use in other tool calls.

### Bug Fixes

* [`87d3a86`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/87d3a866cfdcd2acb4ae60fc8def03d933fc084f) Fix `test_coverage` returning "no data" by reading from `file_coverage` table via new `getCoverage()` DataReader method
* Fix `test_for_file` returning empty by wiring up `writeSourceMap()` in the reporter
* Fix `configure` to default to latest settings when no hash provided
* Fix `note_list` and `note_search` to return markdown instead of raw JSON
* Fix `run_tests` to return formatted text instead of JSON object

Closes #15, closes #16

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
