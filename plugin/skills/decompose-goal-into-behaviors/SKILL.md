---
name: decompose-goal-into-behaviors
description: Map a fuzzy "/tdd <goal>" into an ordered backlog of single-behavior goals stored in tdd_session_behaviors. Required for non-toy goals; the orchestrator iterates the cycle once per behavior.
---

# Decompose a goal into behaviors

Given a goal like "add login validation", produce an ordered backlog where each entry is a single observable behavior.

## Process

1. Call `decompose_goal_into_behaviors({ tddSessionId, goal })`. The MCP tool splits on `and` / `,` / `;` and writes `tdd_session_behaviors` rows with sequential ordinals.
2. Inspect the result. If the auto-decomposition is coarse, refine by calling again with a comma-separated explicit list — idempotency on `(tddSessionId, goal)` makes re-calls safe.
3. The orchestrator iterates: after each `tdd_session_end(child)` with `outcome=succeeded`, it queries the next pending behavior and starts a child TDD session for it.

## Rules

1. Each behavior asserts one observable outcome. If a behavior contains "and", split it.
2. Order matters when behaviors have data dependencies. Use `dependsOnBehaviorIds` to encode that.
3. Re-running with the same `(tddSessionId, goal)` returns the cached decomposition (idempotent replay). Refine by calling with a different goal text.

## Reusable outside TDD

Feature-planning workflows can use this scaffold to produce backlog items; the artifact-writing path is TDD-specific but the decomposition heuristic is general.
