---
"vitest-agent-reporter-shared": patch
"vitest-agent-reporter": patch
"vitest-agent-reporter-cli": patch
"vitest-agent-reporter-mcp": patch
---

## Bug Fixes

### TDD orchestrator now resolves the active main `cc_session_id` at launch

The orchestrator subagent had no documented mechanism to discover its own current `cc_session_id`, so it was passing whichever value it happened to find — frequently a stale row from an earlier conversation. The downstream effect was that `tdd_sessions.session_id` linked to a long-ended agent session, the `post-tool-use-tdd-artifact.sh` hook resolved the live `cc_session_id` to that stale row's id (or to no row at all), and `tdd_artifacts` writes silently fell on the floor under `|| true`. The visible symptom was `tdd_phase_transition_request` denying `red→green` with `missing_artifact_evidence` even after several `run_tests` failures during the red phase. Confirmed empirically against TDD session 5 of this week's dogfooding: zero artifacts under its red phase despite multiple MCP test runs.

The orchestrator's launch step now calls `session_list({ agentKind: "main", limit: 1 })` first and uses the most recent row's `cc_session_id` as its `ccSessionId` argument to `tdd_session_start`.

### Orchestrator gains read-side tools for codebase navigation, task tracking, and full MCP coverage

The orchestrator could not search the codebase by pattern, find files by glob, list its own task backlog, or load deferred MCP tool schemas. Its MCP tool list also enumerated only 15 of the 41 server tools, omitting routine reads like `coverage`, `triage_brief`, `session_list`, and `commit_changes`. The `tools:` array now includes `Grep`, `Glob`, `ToolSearch`, `TaskList`, `TaskGet`, and the wildcard `mcp__plugin_vitest-agent-reporter_vitest-reporter__*`. The write surface (`Edit`, `Write`, `Bash`, the four MCP mutations the orchestrator already had) is unchanged, and the iron law plus the restricted-Bash and post-tool-use hooks continue to enforce the TDD discipline regardless of which read tools are available.
