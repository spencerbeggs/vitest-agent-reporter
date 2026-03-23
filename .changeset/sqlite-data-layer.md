---
"vitest-agent-reporter": major
---

## Breaking Changes

- `CacheReader` service replaced by `DataReader`
- `CacheReaderLive` layer replaced by `DataReaderLive`
- `CacheWriter` service replaced by `DataStore`
- `CacheWriterLive` layer replaced by `DataStoreLive`
- `CacheError` replaced by `DataStoreError`
- `AgentDetection` service replaced by `EnvironmentDetector`
- `AgentDetectionLive` layer replaced by `EnvironmentDetectorLive`
- `HistoryTracker.classify` signature changed (`cacheDir` removed, `subProject` added)
- `ReporterLive` and `CliLive` are now functions of `dbPath` (not static layers)
- JSON cache files no longer written (SQLite replaces them)
- `manifest.json` no longer exists (computed from SQL queries)
- `consoleStrategy` option mapped to `format` internally (`complement` becomes `vitest-bypass`, `own` becomes `markdown`)
- Three-environment model (`agent`/`ci`/`human`) replaced by four-environment model (`agent-shell`/`terminal`/`ci-github`/`ci-generic`)

## Features

### SQLite Persistence

Replaced JSON file persistence with a normalized 25-table SQLite database via `@effect/sql-sqlite-node`. All test data -- runs, modules, suites, test cases, errors, coverage, history, baselines, trends, and notes -- stored in a single `data.db` file.

- `DataStore` and `DataReader` Effect services for typed SQL writes and reads
- Migration-based schema management via `SqliteMigrator`
- File path interning, settings snapshots with env var tracking
- Git commit/branch correlation on test runs
- Invocation ID for monorepo run correlation
- Notes system with FTS5 full-text search, scoping, threading, and expiration
- Source-to-test file mapping, suite hierarchy preservation
- `splitProject()` utility for `project:subProject` convention
- `captureSettings()` and `captureEnvVars()` for configuration snapshots

### Output Pipeline

Formalized output rendering into five composable Effect services replacing ad-hoc formatting logic.

- `EnvironmentDetector` -- four-environment detection via `std-env` (`agent-shell`, `terminal`, `ci-github`, `ci-generic`)
- `ExecutorResolver` -- maps environment + mode to executor role (`human`, `agent`, `ci`)
- `FormatSelector` -- selects output format (`markdown`, `json`, `vitest-bypass`, `silent`)
- `DetailResolver` -- determines verbosity from run health (`minimal`, `neutral`, `standard`, `verbose`)
- `OutputRenderer` -- dispatches to registered `Formatter` implementations
- Four built-in formatters: `MarkdownFormatter`, `GfmFormatter`, `JsonFormatter`, `SilentFormatter`
- `OutputPipelineLive` composition layer included in `ReporterLive`, `CliLive`, and `McpLive`
- `--format` flag on all CLI commands for markdown/json output
- `format`, `detail`, and `mode` options on `AgentReporterOptions`

### MCP Server

New MCP server entry point (`vitest-agent-reporter-mcp`) exposing 16 tools over stdio transport for LLM agent integration.

- tRPC router with Effect Schema validators (`Schema.standardSchemaV1`)
- `@modelcontextprotocol/sdk` stdio transport with `McpServer` + `StdioServerTransport`
- Test data tools: `test_status`, `test_overview`, `test_coverage`, `test_history`, `test_trends`, `test_errors`, `test_for_file`
- Action tools: `run_tests` (with argument sanitization via `spawnSync`), `cache_health`, `configure`
- Note CRUD tools: `note_create`, `note_list`, `note_get`, `note_update`, `note_delete`, `note_search`
- `McpLive` composition layer with `ManagedRuntime` for long-lived process

### Claude Code Plugin

File-based Claude Code plugin with MCP auto-registration, hooks, skills, and commands.

- `.mcp.json` auto-registers the MCP server when the plugin is enabled
- `SessionStart` hook injects project status and available tools into Claude's context
- `PostToolUse` hook detects test runs and suggests MCP tools when tests fail
- Skills: TDD workflow, debugging guide, configuration reference
- Commands: `/setup` (add plugin to vitest config), `/configure` (view/modify settings)
- Distributed via `spencerbeggs/bot` Claude Code marketplace
