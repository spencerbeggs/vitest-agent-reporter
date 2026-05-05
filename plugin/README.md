# vitest-agent-reporter Claude Code Plugin

A Claude Code plugin that integrates `vitest-agent-reporter` into your
coding sessions. Provides MCP tools for test data queries, session
context injection via hooks, and teaching skills for TDD, debugging,
and configuration.

## Installation

### From the marketplace

```bash
# Add the plugin marketplace (one-time setup)
/plugin marketplace add spencerbeggs/bot

# Install the plugin for this project
/plugin install vitest-agent-reporter@spencerbeggs-bot --scope project
```

This adds the plugin to your `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "vitest-agent-reporter@spencerbeggs-bot": true
  }
}
```

### From a local directory (development)

```bash
claude --plugin-dir ./plugin
```

Or configure permanently in your Claude Code settings:

```json
{
  "pluginDirs": ["./plugin"]
}
```

## What the Plugin Provides

### MCP Server (auto-registered)

The plugin registers the `vitest-reporter` MCP server automatically
via the `mcpServers` field in `.claude-plugin/plugin.json`. A small
zero-dependency loader (`bin/mcp-server.mjs`) shipped with the plugin
detects your package manager (npm, pnpm, yarn, or bun) from
`packageManager` in `package.json` or your lockfile, then spawns the
`vitest-agent-mcp` bin through that package manager so it
resolves from your project's `node_modules`.

This means `vitest-agent-reporter` must be installed as a dependency
of your project for the plugin's MCP server to start. The package's
required peer dependencies (`vitest-agent-mcp` and
`vitest-agent-cli`) are auto-installed by modern pnpm and
npm. If the MCP bin is missing, the loader prints PM-specific
install instructions and exits non-zero. See
[Prerequisites](#prerequisites) below.

The server exposes 50 tools. Use the `help` tool for the full list
with parameters, or see
[docs/mcp.md](https://github.com/spencerbeggs/vitest-agent-reporter/blob/main/docs/mcp.md)
for the complete reference.

| Category | Tools |
| --- | --- |
| Queries | `test_status`, `test_overview`, `test_coverage`, `test_history`, `test_trends`, `test_errors`, `test_for_file`, `test_get`, `file_coverage`, `cache_health`, `configure` |
| Discovery | `project_list`, `test_list`, `module_list`, `suite_list`, `settings_list` |
| Execution | `run_tests` |
| Notes | `note_create`, `note_list`, `note_get`, `note_update`, `note_delete`, `note_search` |
| Sessions / Turns | `session_list`, `session_get`, `turn_search`, `failure_signature_get`, `acceptance_metrics` |
| Triage / Wrap-up | `triage_brief`, `wrapup_prompt` |
| Hypotheses | `hypothesis_record`, `hypothesis_validate`, `hypothesis_list` |
| TDD lifecycle | `tdd_session_start`, `tdd_session_end`, `tdd_session_resume`, `tdd_session_get`, `tdd_phase_transition_request` |
| TDD goal CRUD | `tdd_goal_create`, `tdd_goal_get`, `tdd_goal_update`, `tdd_goal_delete`, `tdd_goal_list` |
| TDD behavior CRUD | `tdd_behavior_create`, `tdd_behavior_get`, `tdd_behavior_update`, `tdd_behavior_delete`, `tdd_behavior_list` |
| Workspace history | `commit_changes` |
| Meta | `help` |

### Hooks

| Hook | Trigger | Behavior |
| --- | --- | --- |
| `SessionStart` | Claude session begins | Injects project test status and MCP tool reference into context |
| `PreToolUse` (`mcp__vitest-agent-reporter__*` / `mcp__plugin_vitest-agent-reporter_vitest-reporter__*`) | Before any vitest-agent-reporter MCP tool call | Auto-allows the call without a permission prompt when the tool is on the bundled allowlist (non-destructive tools; the two delete tools require explicit user confirmation) |
| `PostToolUse` (Bash) | After any Bash tool call | Detects test runs; suggests MCP tools when tests fail |

The `PreToolUse` allowlist lives at
`hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt`. Every tool the MCP server exposes today is on the list. Future tools added to the server
fall back to the standard permission prompt until they are added to the
file.

### Skills

Skills are invoked via `/skill <name>` in Claude Code.

| Skill | Description |
| --- | --- |
| `tdd` | Red-green-refactor workflow using MCP tools |
| `debugging` | Systematic failure diagnosis using `test_history`, `test_errors`, `test_for_file` |
| `coverage-improvement` | Systematic coverage improvement using `file_coverage`, `test_for_file`, `test_trends` |
| `configuration` | Plugin setup and `AgentPlugin` option reference |

### Commands

Commands are invoked via `/<name>` in Claude Code.

| Command | Description |
| --- | --- |
| `/setup` | Add `AgentPlugin` to the current project's vitest config |
| `/configure [setting] [value]` | View or modify reporter settings |

## Prerequisites

`vitest-agent-reporter` must be installed as a project dependency so
the plugin's loader can spawn the MCP server through your package
manager:

```bash
npm install --save-dev vitest-agent-reporter
pnpm add -D vitest-agent-reporter
yarn add -D vitest-agent-reporter
bun add -d vitest-agent-reporter
```

The required peer dependencies (`vitest-agent-mcp` for the
MCP bin and `vitest-agent-cli` for the CLI) are
auto-installed by modern pnpm and npm. If your package manager is
configured to skip peer deps (e.g. pnpm with `auto-install-peers: false`),
install them explicitly:

```bash
pnpm add -D vitest-agent-reporter vitest-agent-cli vitest-agent-mcp
```

Additional setup:

- `AgentPlugin` added to `vitest.config.ts` (use `/setup` to automate this)
- Tests run at least once to populate the database

## How It Works

After each `vitest` run, `AgentReporter` writes structured data to a
SQLite database under your XDG data directory (default
`$XDG_DATA_HOME/vitest-agent-reporter/<workspaceName>/data.db`,
falling back to `~/.local/share/vitest-agent-reporter/<workspaceName>/data.db`).
The location is derived from your root `package.json` `name`, so two
worktrees of the same repo share history; override it via
`vitest-agent-reporter.config.toml` (`cacheDir` or `projectKey`) at
the workspace root. The MCP server reads this database on demand --
no background process required.

The `SessionStart` hook queries the CLI (`vitest-agent-reporter status`)
at session start and injects a markdown summary with available tools and
last-run status. The `PostToolUse` hook watches for failed test runs and
suggests relevant MCP tools for analysis.

## Development

To dogfood this plugin while developing `vitest-agent-reporter`:

```bash
# Run Claude Code with this plugin loaded from the local directory
claude --plugin-dir ./plugin

# Or test hooks manually
echo '{"session_id":"test","cwd":"'"$(pwd)"'","hook_event_name":"SessionStart"}' \
  | bash plugin/hooks/session-start.sh

echo '{"tool_input":{"command":"pnpm test"},"tool_result":{"exit_code":"1"}}' \
  | bash plugin/hooks/post-test-run.sh
```

## Repository

- GitHub: <https://github.com/spencerbeggs/vitest-agent-reporter>
- Issues: <https://github.com/spencerbeggs/vitest-agent-reporter/issues>
- License: MIT
