---
name: tdd
description: Use when starting any TDD cycle, before writing any test file, editing any production file, running tests, or advancing a phase — required before any of those actions.
---

# TDD: Mandatory MCP Instrumentation

Three MCP calls are required protocol. Skipping any one of them is a named violation that corrupts the session record and all downstream metrics.

## For the main agent: dispatch the tdd-task agent

If you are the main agent: dispatch the `plugin:vitest-agent:tdd-task` subagent. Pass the `goal` and your current `ccSessionId` explicitly in the launch prompt. Do not attempt TDD yourself — the tdd-task agent carries the required MCP tools and skill context for evidence-based phase transitions.

### Channel-event handling (main agent)

When Claude Code is started with `--dangerously-load-development-channels server:mcp` (dev) or `--channels` (once approved), the orchestrator's progress events arrive as `<channel source="mcp">` tags carrying a JSON payload. Parse the `type` field and update the task list. **The orchestrator's three-tier hierarchy (objective → goals → behaviors) renders flat in the task list** — Claude Code's `TaskCreate` does not nest cleanly past one parent, so encode the goal index in the task label as `[G<n>.B<m>] <behavior>` rather than building a 3-level tree.

Maintain three pieces of state per session:

- `parentTaskId` — the parent `TDD Session: {objective}` task created at orchestrator launch.
- `goalById: Map<goalId, { ordinal, taskId? }>` — goal metadata. Goal-level events render as marker tasks (e.g. `--- Goal 1 done ---`) inserted between behavior groups; goal status is conveyed via the marker, not a real task.
- `behaviorById: Map<behaviorId, { goalOrdinal, behaviorOrdinal, taskId }>` — keyed lookup for behavior-level updates.

Event handlers:

| `type` | Action |
| ------ | ------ |
| `goals_ready` | Record each `{id, ordinal, goal}` in `goalById`. No tasks yet — wait for `behaviors_ready` so the rendered labels carry both goal and behavior ordinals. |
| `goal_added` | Append the new goal to `goalById` (mid-session addition after the initial batch). |
| `goal_started` | No-op (the goal's behaviors will start producing `behavior_started` events). |
| `behaviors_ready` | For each behavior under the named `goalId`, `TaskCreate({ content: "[G<goalOrdinal+1>.B<behaviorOrdinal+1>] <behavior>", status: "pending", parentTaskId })`. Store the returned task id in `behaviorById`. |
| `behavior_added` | `TaskCreate` a single sibling labeled `[G<n>.B<m>] <behavior>` and store its id. |
| `behavior_started` | `TaskUpdate({ id: <behavior taskId>, status: "in_progress" })`. |
| `phase_transition` | `TaskUpdate({ id: <behavior taskId>, content: "[G<n>.B<m>] <behavior> · <toPhase>" })` so the user sees the current phase inline on the task label. |
| `behavior_completed` | `TaskUpdate({ id: <behavior taskId>, status: "completed" })`. |
| `behavior_abandoned` | `TaskUpdate({ id: <behavior taskId>, status: "cancelled" })`; surface the `reason` to the user as context. |
| `goal_completed` | Reconcile against `behaviorIds[]`: any behavior in the goal whose task is still pending or in_progress should be marked `completed` (the goal_completed event is order-independent, so this catches any dropped intermediate `behavior_completed` events). Then `TaskCreate({ content: "--- Goal <goalOrdinal+1> done ---", status: "completed", parentTaskId })` as a marker. |
| `goal_abandoned` | Same reconcile logic but mark unfinished children `cancelled`. Insert marker `--- Goal <goalOrdinal+1> abandoned: <reason> ---`. |
| `blocked` | `TaskUpdate({ id: <behavior taskId>, status: "blocked" })`; surface `reason` and `failureSignatureHash` to the user. |
| `session_complete` | Reconcile against `goalIds[]` (catch dropped `goal_completed` events). `TaskUpdate({ id: parentTaskId, status: "completed" })` (or `cancelled` if outcome is `abandoned`). |

If no `<channel>` events arrive (channels not active or not enabled), wait for the background completion notification. You can check progress at any time with `tdd_session_get(id)` via the MCP tool — it returns the full goal+behavior tree so you can rebuild the task list shape from a single read. (`tdd_session_resume(id)` returns only a short status summary; reach for `tdd_session_get` when you need the tree.)

---

## Hard Gate 1 — `tdd_session_start`

Skipping this gate is the **UNREGISTERED SESSION** violation. This is the first action. Before any file read or write toward the goal:

```text
tdd_session_start({ goal, ccSessionId })
```

Without a session ID there is no TDD session. Every phase artifact is homeless. RED-phase test failures are misclassified as flaky (the DB sees repeated failures with no session context and computes a low pass rate). `acceptance_metrics` returns 0% because zero evidence is bound to any session.

The `ccSessionId` is passed in your launch prompt. Use it exactly. Do not call `session_list` to derive it — that risks picking up a stale row from a concurrent session.

## Hard Gate 2 — `hypothesis_record` before every production edit

Skipping this gate is the **UNCITED FIX** violation.

**REQUIRED SUB-SKILL:** `vitest-agent:record-hypothesis-before-fix`

Before editing any non-test file, call:

```text
hypothesis_record({
  content: "<causal claim: why this edit will make the test pass>",
  citedTestErrorId: <id from test_errors output>,
  citedStackFrameId: <id from test_errors output>,
  sessionId: <tdd session id>
})
```

Both `citedTestErrorId` and `citedStackFrameId` are required — they prove the hypothesis addresses a specific observed failure. A hypothesis without cited evidence is a guess.

- "Fix the validation" — not a hypothesis
- "The bounds check at line 42 runs after the index access, causing TypeError on index N" — is a hypothesis

After the fix: `hypothesis_validate({ id, outcome: "confirmed" | "refuted" | "abandoned" })`.

## Hard Gate 3 — `tdd_phase_transition_request`

Skipping this gate is the **UNRECORDED PHASE CHANGE** violation. At every RED→GREEN and GREEN→REFACTOR boundary:

```text
tdd_phase_transition_request({
  tddSessionId: <id>,
  requestedPhase: "green" | "refactor",
  citedArtifactId: <tdd_artifacts.id>
})
```

Phase boundaries without MCP confirmation do not exist in the database. The validator enforces evidence-binding rules (D2): the cited artifact must belong to the current phase window and session. If the validator denies, read the `remediation` field and act on it before retrying. Do not advance the phase unilaterally.

---

## Observed Rationalizations (baseline session, 2026-05-04)

These are the exact behaviors from the previous orchestrator session. All four are violations:

| What the orchestrator did | Named violation | Consequence |
| --- | --- | --- |
| Fixed bugs without calling `tdd_session_start` | UNREGISTERED SESSION | `acceptance_metrics` 0%; RED failures classified as flaky (67% pass rate) |
| Edited production code without `hypothesis_record` | UNCITED FIX | No causal evidence bound to the fix; hypothesis audit is empty |
| Advanced phases without `tdd_phase_transition_request` | UNRECORDED PHASE CHANGE | DB has no phase record; evidence-based transitions cannot validate |
| Used `pnpm vitest run` via Bash instead of `run_tests` MCP | SESSION BYPASS | Results bypass persistence; `test_history` and phase artifacts are not written |

**Violating the letter of these rules IS violating the spirit of these rules.**

---

## Red Flags — STOP before continuing

| If you are about to... | Required action |
| --- | --- |
| Write any file before `tdd_session_start` returned a session ID | STOP — UNREGISTERED SESSION. Call `tdd_session_start` first. |
| Edit any production file without a recorded hypothesis | STOP — UNCITED FIX. Call `hypothesis_record` first. |
| Begin the next phase without `tdd_phase_transition_request` | STOP — UNRECORDED PHASE CHANGE. Request the transition first. |
| Run `vitest`, `pnpm vitest`, `npx vitest`, or any Bash test runner | STOP — SESSION BYPASS. Use `run_tests` MCP instead. |
| "Skip setup just this once, the goal is simple" | UNREGISTERED SESSION + UNCITED FIX combined. No exceptions. |
| Call `session_list` to find your `ccSessionId` | STOP — the `ccSessionId` is in your launch prompt. Use it directly. |
