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
via `.mcp.json`. The server exposes 16 tools for querying test data
stored in the SQLite database written by the reporter after each test
run.

| Tool | Description |
| --- | --- |
| `test_status` | Per-project test pass/fail state from the last run |
| `test_overview` | Full test landscape: files, suites, test counts |
| `test_coverage` | Coverage gaps with uncovered line ranges |
| `test_history` | Flaky, persistent, and recovered test detection |
| `test_trends` | Per-project coverage trajectory over time |
| `test_errors` | Search errors by type or message across projects |
| `test_for_file` | Find all tests that cover a given source file |
| `run_tests` | Execute vitest for specific files or patterns |
| `cache_health` | Database health diagnostic |
| `configure` | View captured Vitest settings |
| `note_create` | Create a note scoped to a file, test, or project |
| `note_list` | List notes by scope |
| `note_get` | Read a note by ID |
| `note_update` | Update note content, pin state, or expiration |
| `note_delete` | Delete a note |
| `note_search` | Full-text search across all notes |

### Hooks

| Hook | Trigger | Behavior |
| --- | --- | --- |
| `SessionStart` | Claude session begins | Injects project test status and MCP tool reference into context |
| `PostToolUse` (Bash) | After any Bash tool call | Detects test runs; suggests MCP tools when tests fail |

### Skills

Skills are invoked via `/skill <name>` in Claude Code.

| Skill | Description |
| --- | --- |
| `tdd` | Red-green-refactor workflow using MCP tools |
| `debugging` | Systematic failure diagnosis using `test_history`, `test_errors`, `test_for_file` |
| `configuration` | Plugin setup and `AgentPlugin` option reference |

### Commands

Commands are invoked via `/<name>` in Claude Code.

| Command | Description |
| --- | --- |
| `/setup` | Add `AgentPlugin` to the current project's vitest config |
| `/configure [setting] [value]` | View or modify reporter settings |

## Prerequisites

- `vitest-agent-reporter` installed in the project (`pnpm add -D vitest-agent-reporter`)
- `AgentPlugin` added to `vitest.config.ts` (use `/setup` to automate this)
- Tests run at least once to populate the database

## How It Works

After each `vitest` run, `AgentReporter` writes structured data to a
SQLite database (default: `node_modules/.vite/vitest-agent-reporter/data.db`
when using `AgentPlugin`, or `.vitest-agent-reporter/data.db` standalone).
The MCP server reads this database on demand -- no background process
required.

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
