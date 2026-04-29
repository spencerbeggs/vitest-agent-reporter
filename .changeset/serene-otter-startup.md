---
"vitest-agent-reporter": patch
---

## Bug Fixes

### Migration race in multi-project Vitest configs

Fixes intermittent `SqliteError: database is locked` when running tests on a fresh database in a multi-project Vitest configuration. Concurrent reporter instances opening their own SqliteClient connections raced on the initial migration; SQLite's busy_handler does not retry write-write upgrades in deferred transactions, so one instance failed instead of waiting.

* Added `ensureMigrated(dbPath)` which serializes migrations once per database path within a process, using a `globalThis`-keyed promise cache so it works across the separate plugin module instances Vite creates per project.
* `AgentReporter.onTestRunEnd` now awaits `ensureMigrated(dbPath, logLevel, logFile)` before opening its own runtime; subsequent concurrent reads/writes work normally under WAL plus better-sqlite3's 5s busy_timeout.

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
