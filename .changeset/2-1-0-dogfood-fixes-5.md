---
"vitest-agent-reporter-shared": patch
"vitest-agent-reporter": patch
"vitest-agent-reporter-cli": patch
"vitest-agent-reporter-mcp": patch
---

## Bug Fixes

### TDD orchestrator session discovery follow-up

The orchestrator's launch step previously called `session_list({ agentKind: "main", limit: 1 })` to derive the parent `cc_session_id`. When two Claude Code windows were open against the same workspace, this returned the most recently started main session — not necessarily the one that spawned the orchestrator. The downstream effect was that `tdd_sessions.session_id` linked to a session the artifact hooks couldn't resolve, so `tdd_artifacts` writes fell on the floor and `tdd_phase_transition_request` denied `red→green` with `missing_artifact_evidence`.

This race should not be considered fixed yet. The current `/tdd` command still resolves `cc_session_id` via `session_list({ agentKind: "main", limit: 1 })`, which remains a workspace-global heuristic and can still select the wrong parent session when multiple Claude Code windows are open for the same workspace. This entry documents the known limitation; the bug should only be called resolved once `/tdd` switches to a conversation-specific source such as the new session pointer and passes that value through to the orchestrator.

### Orchestrator gains `TaskList` and `TaskGet`

The orchestrator's `tools:` array was missing `TaskList` and `TaskGet`, preventing it from reading its own task backlog or checking task status mid-session. Both are now included alongside the existing `TodoWrite`, `Grep`, `Glob`, and `ToolSearch` entries.

### `withStdioCaptured` concurrency guard

The `run_tests` MCP tool's `withStdioCaptured` helper mutates `process.stdout.write` and `process.stderr.write` globally. Concurrent calls corrupted each other's saved originals, causing the wrong write function to be restored in `finally`. A module-level promise-chain mutex now serializes calls so process-global write mutation is never overlapping.
