---
"vitest-agent-reporter": major
"vitest-agent-reporter-shared": major
"vitest-agent-reporter-cli": major
"vitest-agent-reporter-mcp": major
---

## Breaking Changes

### Package split

`vitest-agent-reporter` is now four packages instead of one. The Vitest plugin and reporter stay in `vitest-agent-reporter`; the on-demand CLI moves to `vitest-agent-reporter-cli`; the MCP server moves to `vitest-agent-reporter-mcp`; and the shared data layer + services + formatters move to `vitest-agent-reporter-shared`. The CLI and MCP packages are required peer dependencies of `vitest-agent-reporter`, so a single `npm install vitest-agent-reporter` still gets you the full bin set on modern pnpm and npm.

```bash
# Before
pnpm add -D vitest-agent-reporter

# After (peers auto-install on pnpm and npm 7+)
pnpm add -D vitest-agent-reporter
# Or, if your PM does not auto-install peers:
pnpm add -D vitest-agent-reporter vitest-agent-reporter-cli vitest-agent-reporter-mcp
```

### Database location moved to XDG

The SQLite database now lives at `$XDG_DATA_HOME/vitest-agent-reporter/<workspaceName>/data.db` (defaulting to `~/.local/share/vitest-agent-reporter/<workspaceName>/data.db`) instead of `node_modules/.vite/vitest/<hash>/vitest-agent-reporter/data.db`. The location is derived from your root `package.json` `name`, so two checkouts of the same repo now share history. **No migration of old data is performed** — first run on 2.0 starts fresh. Override the location via `vitest-agent-reporter.config.toml` at the workspace root (`cacheDir` or `projectKey`) or the existing `reporter.cacheDir` plugin option.

### `AgentReporter.onInit` is now async

`onInit` now returns `Promise<void>` because dbPath resolution requires async filesystem access. Vitest awaits the hook, so this is transparent to plugin users. Direct callers of `onInit` (rare) must await the promise.

### Removed reporter exports

The reporter package no longer exports `./mcp` (now in `vitest-agent-reporter-mcp`) or the `vitest-agent-reporter-mcp` bin (now in the MCP package). The `vitest-agent-reporter` bin moves to `vitest-agent-reporter-cli`.

### Plugin loader rewrite

The Claude Code plugin's `bin/mcp-server.mjs` no longer walks `node_modules` to dynamically import the MCP server. It now detects your package manager and spawns `vitest-agent-reporter-mcp` through it (`pnpm exec`, `npx --no-install`, `yarn run`, or `bun x`). This eliminates the previous `file://` import workaround and the npx-fetch-from-npm hazard. Plugin users on older Claude Code versions where the plugin shipped the prior loader should reinstall the plugin to pick up the new bin.

## Features

### XDG path resolution closes #39

The MCP server's stale-`dbPath` bug is fixed by deriving the path from configuration (workspace name + XDG env vars) rather than probing the filesystem for the database file. Path is known a priori and cannot change after MCP startup. `resolveDataPath(projectDir, options?)` is the new shared resolver used by reporter, plugin, CLI, and MCP server. Closes [#39](https://github.com/spencerbeggs/vitest-agent-reporter/issues/39).

### Optional `vitest-agent-reporter.config.toml`

A new optional TOML config file at the workspace root lets you override the resolved database location:

```toml
# Override the entire data directory
cacheDir = "./.vitest-agent-reporter"

# Or override just the workspace key (useful when two unrelated projects
# on one machine share a package.json name)
projectKey = "my-app-personal"
```

Resolved via `WorkspaceRoot` → `GitRoot` → `UpwardWalk` from the project directory. Both fields are optional; when absent, the reporter derives the path from the root `package.json` `name`.

### Workspace-name keying

The data directory is keyed off the root workspace's `name`, normalized for filesystem safety (`@org/pkg` becomes `@org__pkg`). This gives you consistent history across worktrees, survives `rm -rf node_modules` and disk moves, and produces a human-readable directory listing under `~/.local/share/vitest-agent-reporter/`.

## Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| (shared) xdg-effect | dependency | added | — | ^1.0.1 |
| (shared) config-file-effect | dependency | added | — | ^0.2.0 |
| (shared) workspaces-effect | dependency | added | — | ^0.5.1 |
| (shared) std-env | dependency | added | — | ^4.1.0 |
| (cli) @effect/cli | dependency | added | — | ^0.75.1 |
| (mcp) @modelcontextprotocol/sdk | dependency | added | — | ^1.29.0 |
| (mcp) @trpc/server | dependency | added | — | ^11.17.0 |
| (mcp) zod | dependency | added | — | ^4.3.6 |
| (reporter) @modelcontextprotocol/sdk | dependency | removed | ^1.29.0 | — |
| (reporter) @trpc/server | dependency | removed | ^11.17.0 | — |
| (reporter) zod | dependency | removed | ^4.3.6 | — |
| (reporter) @effect/cli | dependency | removed | ^0.75.1 | — |
| (reporter) std-env | dependency | removed | ^4.1.0 | — |
| (reporter) vitest-agent-reporter-cli | peerDependency | added | — | ^2.0.0 |
| (reporter) vitest-agent-reporter-mcp | peerDependency | added | — | ^2.0.0 |

## Refactoring

### Internal restructure

The data layer (schemas, errors, migrations, DataStore/DataReader), output pipeline (5 services + 4 formatters), shared utilities (build-report, classify-test, compute-trend, ansi, etc.), and `LoggerLive` all moved into `vitest-agent-reporter-shared`. `AgentReporter`, `AgentPlugin`, `ReporterLive`, and the istanbul `CoverageAnalyzer` stay in `vitest-agent-reporter`. The reporter is now a thin Vitest integration on top of the shared library.
