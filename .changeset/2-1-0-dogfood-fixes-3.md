---
"vitest-agent-reporter-shared": patch
"vitest-agent-reporter": patch
"vitest-agent-reporter-cli": patch
"vitest-agent-reporter-mcp": patch
---

## Bug Fixes

### TDD-scoped plugin hooks now match the actual `agent_type` Claude Code emits

The prior fix to `lib/match-tdd-agent.sh` accepted `"TDD Orchestrator"` and the legacy `"tdd-orchestrator"` slug, but Claude Code emits plugin-bundled subagents with a plugin-prefixed `agent_type` of the form `<plugin-name>:<agent name field>` — for our orchestrator, `"vitest-agent-reporter:TDD Orchestrator"`. None of the prior accepted values matched, so all five orchestrator-scoped hooks (`subagent-start-tdd.sh`, `subagent-stop-tdd.sh`, `pre-tool-use-bash-tdd.sh`, `post-tool-use-tdd-artifact.sh`, `post-tool-use-test-quality.sh`) silently no-opped: no SubagentStart row, no Bash anti-pattern denials, no `tdd_artifacts` writes.

`is_tdd_orchestrator` now matches `"vitest-agent-reporter:TDD Orchestrator"` first; the bare `"TDD Orchestrator"` and the legacy `"tdd-orchestrator"` slug remain as fallbacks for resilience.

### `post-tool-use-tdd-artifact.sh` now matches the plugin-namespaced MCP tool name

The hook's `mcp__vitest-agent-reporter__run_tests` case never matched real MCP invocations, because Claude Code emits plugin-loaded MCP tool calls under `mcp__plugin_<plugin>_<server>__<op>` — `mcp__plugin_vitest-agent-reporter_vitest-reporter__run_tests` for our reporter. The hook now matches both the plugin-namespaced and legacy bare tool names, so MCP-invoked test runs once again record `test_passed_run` / `test_failed_run` artifacts under the active TDD phase.

### `subagent-start-tdd.sh` documents the cc_session_id collision

Claude Code reuses the parent agent's `cc_session_id` for subagent tool calls, but `sessions.cc_session_id` is `UNIQUE`. The hook's `record session-start` write therefore always trips the constraint. The hook is unchanged in behavior (the failure was already swallowed by `|| true`), but a comment now explains the collision and the parent-row fallback that keeps the orchestrator's TDD lifecycle working.

### `vitest-agent-reporter coverage --format markdown` no longer leaves an empty `## Coverage Gaps` body

When every project's coverage data shows no files below thresholds and no files below targets, the formatter emitted a bare `## Coverage Gaps` heading with no body. Agents could not distinguish "no gaps" from "the formatter forgot to render the body". The body now includes an explicit `All targets met — no coverage gaps.` line.

### `failure_signature_get` markdown body now includes the hash explicitly

The tool's response carried the signature hash only as an inline-code section header. If the response was clipped before the agent reached the rest of the body, the hash was lost. The body now includes a `**Hash:** <signature_hash>` line directly under the heading so the value is preserved in clip-tolerant form.
