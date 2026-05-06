---
"vitest-agent-mcp": patch
---

## Bug Fixes

### Claude Code plugin: session ID and task panel fixes

Fixes a session ID contamination bug where `get_current_session_id()` could return a stale synthetic subagent key after a `context:fork` dispatch, causing all PostToolUse artifact writes to fail with "no open TDD session" errors. Replaced with `session_list({ agentKind: "main", limit: 1 })` which reads the correct value from the database.

Fixes an orphaned-task bug in the task panel where abandoned sessions (which fire `behaviors_ready` but never `behavior_started`) would leave pending `□` tasks with no associated work. `TaskCreate` is now deferred from `behaviors_ready` to `behavior_started`.

## Maintenance

* `hook-debug.sh` added to `hooks/lib/` — structured `hook_error` (always-on) and `hook_debug` (env-gated via `VITEST_AGENT_HOOK_DEBUG=1`) logging for all hook scripts
* `hooks/fixtures/` added — synthetic JSON payloads for manual hook invocation during development
* `match-tdd-agent.sh` narrowed — legacy agent_type forms (`plugin:vitest-agent:tdd-task`, bare `tdd-task`) removed after being confirmed never observed in practice
