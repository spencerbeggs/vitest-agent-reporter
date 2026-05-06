# vitest-agent Claude Code plugin

A Claude Code plugin that integrates `vitest-agent` into your coding sessions. Provides MCP tools for test data queries, session context injection via hooks, a TDD orchestrator subagent, and sub-skill primitives for every step of the red-green-refactor cycle.

## Installation

### From the marketplace

```bash
# Add the plugin marketplace (one-time setup)
/plugin marketplace add spencerbeggs/bot

# Install the plugin for this project
/plugin install vitest-agent@spencerbeggs --scope project
```

This adds the plugin to your `.claude/settings.json`:

```json
{
  "enabledPlugins": {
    "vitest-agent@spencerbeggs": true
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

## What the plugin provides

### MCP server (auto-registered)

The plugin registers the `vitest-agent` MCP server automatically via the `mcpServers` field in `.claude-plugin/plugin.json`. A zero-dependency POSIX shell loader (`bin/start-mcp.sh`) shipped with the plugin detects your package manager (npm, pnpm, yarn or bun) from `packageManager` in `package.json` or your lockfile, then `exec`-replaces itself with the `vitest-agent-mcp` bin so it resolves from your project's `node_modules` with no wrapper process left behind.

This means `vitest-agent-plugin` must be installed as a dependency of your project for the plugin's MCP server to start. The package's required peer dependencies (`vitest-agent-mcp` and `vitest-agent-cli`) are auto-installed by modern pnpm and npm. If the MCP bin is missing, the loader prints PM-specific install instructions and exits non-zero. See [Prerequisites](#prerequisites) below.

The server exposes 50+ tools, four resources (vendored Vitest docs at `vitest://docs/...` and curated testing patterns at `vitest-agent://patterns/...`) and six framing-only prompts for common workflows. Use the `help` tool for the full tool list with parameters.

| Category | Tools |
| --- | --- |
| Queries | `test_status`, `test_overview`, `test_coverage`, `test_history`, `test_trends`, `test_errors`, `test_for_file`, `test_get`, `file_coverage`, `cache_health`, `configure` |
| Discovery | `project_list`, `test_list`, `module_list`, `suite_list`, `settings_list` |
| Execution | `run_tests` |
| Notes | `note_create`, `note_list`, `note_get`, `note_update`, `note_delete`, `note_search` |
| Sessions / turns | `session_list`, `session_get`, `turn_search`, `failure_signature_get`, `acceptance_metrics` |
| Triage / wrap-up | `triage_brief`, `wrapup_prompt` |
| Hypotheses | `hypothesis_record`, `hypothesis_validate`, `hypothesis_list` |
| TDD lifecycle | `tdd_session_start`, `tdd_session_end`, `tdd_session_resume`, `tdd_session_get`, `tdd_phase_transition_request`, `tdd_progress_push` |
| TDD goal CRUD | `tdd_goal_create`, `tdd_goal_get`, `tdd_goal_update`, `tdd_goal_delete`, `tdd_goal_list` |
| TDD behavior CRUD | `tdd_behavior_create`, `tdd_behavior_get`, `tdd_behavior_update`, `tdd_behavior_delete`, `tdd_behavior_list` |
| Workspace history | `commit_changes` |
| Session ID | `get_current_session_id`, `set_current_session_id` |
| Meta | `help`, `ping` |

### Hooks

Hook scripts run at Claude Code lifecycle events to record session data, inject context and gate tool calls.

| Script | Trigger | Behavior |
| --- | --- | --- |
| `session-start.sh` | `SessionStart` | Writes the session row; injects project test status and MCP tool reference into context |
| `pre-tool-use-mcp.sh` | `PreToolUse` (MCP tools) | Auto-allows non-destructive MCP tools without per-call prompts |
| `pre-tool-use-tdd-restricted.sh` | `PreToolUse` (tdd-task subagent) | Blocks `tdd_goal_delete` and `tdd_behavior_delete` inside the orchestrator |
| `pre-tool-use-bash-tdd.sh` | `PreToolUse` (Bash, tdd-task subagent) | Blocks `--update`, `--bail`, `--testNamePattern`; injects reminder to use `run_tests` MCP |
| `post-tool-use-tdd-artifact.sh` | `PostToolUse` (Write/Edit/run_tests, tdd-task) | Records `test_written`, `test_failed_run`, `test_passed_run`, `code_written` artifacts |
| `post-tool-use-test-quality.sh` | `PostToolUse` (Write/Edit, tdd-task) | Detects test-weakening edits; records `test_weakened` artifact |
| `subagent-start-tdd.sh` | `SubagentStart` | Creates a subagent session row for the dispatched tdd-task |
| `subagent-stop-tdd.sh` | `SubagentStop` | Runs `vitest-agent wrapup --kind tdd_handoff` and records the handoff note |
| `post-tool-use-record.sh` | `PostToolUse` (all) | Records tool-call turns for session analytics |
| `user-prompt-submit-record.sh` | `UserPromptSubmit` | Records user prompt turns |

The auto-allow list for `pre-tool-use-mcp.sh` lives at `hooks/lib/safe-mcp-vitest-agent-ops.txt`. Destructive tools (`tdd_goal_delete`, `tdd_behavior_delete`) are intentionally absent and fall through to Claude Code's standard permission dialog.

Structured error and debug logging for all hook scripts is provided by `hooks/lib/hook-debug.sh`: `hook_error` always appends to `/tmp/vitest-agent-hook-errors.log` (overrideable via `VITEST_AGENT_HOOK_ERROR_LOG`); `hook_debug` appends to `/tmp/vitest-agent-hook-debug.log` only when `VITEST_AGENT_HOOK_DEBUG=1` is set.

### Agent

| Agent | Invocation | Description |
| --- | --- | --- |
| `tdd-task` | `vitest-agent:tdd-task` | TDD orchestrator with `context:fork`. Drives red-green-refactor cycles with evidence-based phase transitions and mandatory MCP gates. Cannot write production code without a preceding failing test. |

### Skills

| Skill | Description |
| --- | --- |
| `tdd` | Main TDD workflow: session lifecycle, phase transitions, goal/behavior hierarchy, channel events |
| `debugging` | Systematic failure diagnosis using `test_history`, `test_errors`, `test_for_file` |
| `coverage-improvement` | Systematic coverage improvement using `file_coverage`, `test_trends` |
| `configuration` | `AgentPlugin` setup and option reference |
| `interpret-test-failure` | Parse failure output, classify failure kind |
| `derive-test-name-from-behavior` | Name a test from a behavior description |
| `derive-test-shape-from-name` | Choose `it`, `describe/it`, parametric etc. from test name |
| `verify-test-quality` | Check written test for escape hatches and weak assertions |
| `run-and-classify` | Run tests via MCP, classify result, record artifact |
| `record-hypothesis-before-fix` | Gate 2 — record hypothesis before any non-test file edit |
| `commit-cycle` | Commit at green and refactor phase exit |
| `revert-on-extended-red` | Revert if stuck in red for more than 5 turns or 3 failed runs |
| `decompose-goal-into-behaviors` | Break a goal into atomic red-green-refactor behaviors |
| `vitest-context` | Vitest-specific test context helpers |

### Commands

| Command | Description |
| --- | --- |
| `/setup` | Add `AgentPlugin` to the current project's `vitest.config.ts` |
| `/configure [setting] [value]` | View or modify reporter settings |
| `/tdd <goal>` | Launch a TDD session by dispatching the orchestrator with a goal |

## Prerequisites

`vitest-agent-plugin` must be installed as a project dependency so the plugin's loader can spawn the MCP server through your package manager:

```bash
npm install --save-dev vitest-agent-plugin
# or
pnpm add -D vitest-agent-plugin
```

The required peer dependencies (`vitest-agent-mcp` for the MCP bin and `vitest-agent-cli` for the CLI) are auto-installed by modern pnpm and npm. If your package manager is configured to skip peer deps (e.g. pnpm with `auto-install-peers: false`), install them explicitly:

```bash
pnpm add -D vitest-agent-plugin vitest-agent-cli vitest-agent-mcp
```

Additional setup:

- `AgentPlugin` added to `vitest.config.ts` (use `/setup` to automate this)
- Tests run at least once to populate the database

## How it works

After each `vitest` run, `AgentReporter` writes structured data to a SQLite database under your XDG data directory (default `$XDG_DATA_HOME/vitest-agent/<workspaceName>/data.db`, falling back to `~/.local/share/vitest-agent/<workspaceName>/data.db`). The location is derived from your root `package.json` `name`, so two worktrees of the same repo share history; override it via `vitest-agent.config.toml` (`cacheDir` or `projectKey`) at the workspace root. The MCP server reads this database on demand — no background process required.

The `SessionStart` hook queries the CLI at session start and injects a markdown summary with available tools, test status and an imperative preamble that directs the agent to use MCP tools and the TDD orchestrator.

## Development

To dogfood this plugin while developing `vitest-agent`:

```bash
# Run Claude Code with this plugin loaded from the local directory
claude --plugin-dir ./plugin

# Test hooks manually using the bundled fixtures
cat plugin/hooks/fixtures/post-tool-use-write-test.json \
  | bash plugin/hooks/post-tool-use-tdd-artifact.sh

# Enable debug logging for a manual run
VITEST_AGENT_HOOK_DEBUG=1 \
  cat plugin/hooks/fixtures/user-prompt-submit.json \
  | bash plugin/hooks/user-prompt-submit-record.sh

# Then inspect logs
cat /tmp/vitest-agent-hook-debug.log
cat /tmp/vitest-agent-hook-errors.log
```

See `hooks/fixtures/README.md` for the full fixture inventory and substitution instructions.

## Repository

- GitHub: <https://github.com/spencerbeggs/vitest-agent>
- Issues: <https://github.com/spencerbeggs/vitest-agent/issues>
- License: MIT
