---
"vitest-agent-reporter": major
"vitest-agent-reporter-shared": major
"vitest-agent-reporter-cli": major
"vitest-agent-reporter-mcp": major
---

## Breaking Changes

### 2.0 schema migration drops 1.x history

The 2.0 release introduces a comprehensive new SQLite schema (`0002_comprehensive`) with twelve new tables for session/turn logging, TDD session state, code-change context, hook execution data, and stable failure signatures. The migration drops all 1.x tables and recreates them under the new layout.

Existing test history, coverage trends, baselines, and notes are not preserved. Per Decision D9, this is the last drop-and-recreate migration; future schema changes (2.0+) will be ALTER-only with one-shot export/import paths for major bumps.

To verify migration succeeded after upgrade:

```bash
pnpm vitest-agent-reporter doctor
```

## Features

### Comprehensive turn-log schema

Captures Claude Code session state, agent edits with diffs, tool invocations, and hypotheses. Foundation for orientation triage, TDD evidence-based phase transitions, and anti-pattern detection (the full surface lands across subsequent 2.0 release phases). New tables: `sessions`, `turns`, `tool_invocations`, `file_edits`, `hypotheses`, `commits`, `run_changed_files`, `run_triggers`, `build_artifacts`, `tdd_sessions`, `tdd_session_behaviors`, `tdd_phases`, `tdd_artifacts`, `failure_signatures`, `hook_executions`.

### Stable failure signature hashing

Failure signatures hash on `(error.name, normalized assertion shape, top non-framework function name, function-boundary line)` using AST-based function-boundary identification (acorn). Stable across line drift in unrelated code within the same function. Exposed via `computeFailureSignature` and `findFunctionBoundary` from `vitest-agent-reporter-shared`.

### Phase-transition validation

The new `validatePhaseTransition` pure function encodes the three D2 evidence-binding rules: cited test must be authored in the phase window AND the session, cited artifact behavior_id must match the requested behavior, and a cited `test_failed_run` must not predate the session. Returns a discriminated `PhaseTransitionResult` with denial reason and remediation hint.

### Acceptance metrics

`DataReader.computeAcceptanceMetrics` returns the four spec Annex A metrics: phase-evidence integrity (red-before-code), compliance-hook responsiveness, orientation usefulness, and anti-pattern detection rate.

### Effect Schema turn payloads

A discriminated `TurnPayload` union over seven payload types (`UserPromptPayload`, `ToolCallPayload`, `ToolResultPayload`, `FileEditPayload`, `HookFirePayload`, `NotePayload`, `HypothesisPayload`) is exported from `vitest-agent-reporter-shared/schemas/turns`. The forthcoming `record` CLI uses these to validate `turns.payload` JSON at write time.

## Bug Fixes

### `notes_fts` UPDATE preserves new content

The 1.x triggers used `AFTER UPDATE` for both delete and insert steps, which read the already-updated row and accumulated stale tokens in the FTS5 index. The fix uses `BEFORE UPDATE` (capturing OLD values) for the delete step and `AFTER UPDATE` (with NEW values) for the insert step.

## Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| `acorn` | dependency | added | — | 8.16.0 |
| `@types/acorn` | devDependency | added | — | 6.0.4 |
