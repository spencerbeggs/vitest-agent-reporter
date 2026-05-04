---
name: TDD
description: Start a test-driven development session for a goal
trigger: /tdd
arguments:
  - name: goal
    description: What behavior to implement
    required: true
---

# TDD

I'll help you implement {{ goal }} using test-driven development.

Before spawning the orchestrator, look up the current session id:

1. Call `session_list({ agentKind: "main", limit: 1 })` to find the most recently started main session row.
2. Note the `cc_session_id` from that row.

Then spawn the `tdd-orchestrator` subagent with a prompt that includes:

- The goal: `{{ goal }}`
- The resolved `ccSessionId` from step 2

The subagent will:

1. Open a TDD session for this goal.
2. Decompose the goal into single-behavior atoms if it's non-trivial.
3. Drive red → green → refactor cycles with evidence-based phase transitions.
4. Run with restricted Bash (no `--update`, `-u`, `--reporter=silent`, `--bail`, `-t`, `--testNamePattern`, no edits to `coverage.exclude` / `setupFiles` / `globalSetup` / `*.snap`).

When the subagent finishes, I'll receive a structured handoff message summarizing what was accomplished. You can resume an open TDD session anytime with `tdd_session_resume(id)` via the MCP tool.

Starting orchestrator now...
