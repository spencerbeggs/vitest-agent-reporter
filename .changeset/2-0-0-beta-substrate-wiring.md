---
"vitest-agent-reporter-shared": minor
"vitest-agent-reporter": minor
"vitest-agent-reporter-cli": minor
"vitest-agent-reporter-mcp": minor
---

## Features

### Failure-signature reporter wiring

The reporter now computes a stable failure signature for every error and persists it to `failure_signatures` (with occurrence count) and `test_errors.signature_hash`. Top non-framework frames are source-mapped and AST-resolved to the enclosing function boundary, written to `stack_frames.source_mapped_line` and `stack_frames.function_boundary_line`.

### TypeScript-aware function boundary

`findFunctionBoundary` now parses TypeScript syntax via `acorn-typescript`. Pre-β it only handled `.js` source and returned `null` on `.ts` files (which are most Vitest projects), so signatures clustered only within ~10-line buckets. β provides function-stable signatures for the common case.

### `record` CLI subcommand

Three new subcommands on the `vitest-agent-reporter` bin:

- `record session-start --cc-session-id ... --project ... --cwd ...` — insert a sessions row.
- `record turn --cc-session-id ... '<TurnPayload-JSON>'` — validate the payload against the seven-variant `TurnPayload` Effect Schema discriminated union and write a turn row. Auto-assigns `turn_no` per session.
- `record session-end --cc-session-id ... [--end-reason ...]` — update `sessions.ended_at` + `end_reason`.

Hook scripts shell out to these subcommands.

### Plugin hook scripts that emit turns

Six new shell scripts at `plugin/hooks/`:

- `session-start-record.sh`
- `user-prompt-submit-record.sh`
- `pre-tool-use-record.sh`
- `post-tool-use-record.sh` — emits both `tool_result` and (for `Edit`/`Write`/`MultiEdit`) `file_edit` turns
- `session-end-record.sh`
- `pre-compact-record.sh` (β only records the firing; the prompt-injection nudge graduates to RC's interpretive hooks)

Wired through `plugin/hooks/hooks.json`. All scripts degrade gracefully — a `record` failure logs to stderr but never blocks the user's tool call.

### Seven new read-only MCP tools

- `session_list` — list recorded sessions (filter by project, agentKind)
- `session_get` — full detail for one session by integer id
- `turn_search` — search turns by sessionId / since / type / limit (default limit 100)
- `failure_signature_get` — signature + recent example errors by hash
- `tdd_session_get` — TDD session with phases + artifacts rolled up
- `hypothesis_list` — list hypotheses (filter by sessionId / outcome)
- `acceptance_metrics` — the four spec Annex A acceptance metrics

All seven are auto-allowed by the plugin's `PreToolUse` matcher.

### New `DataStore` methods

- `writeFailureSignature` — idempotent upsert on `failure_signatures` (`ON CONFLICT` increments `occurrence_count`).
- `endSession` — updates `sessions.ended_at` + `end_reason`.
- `writeTurn` now auto-assigns `turn_no` when the caller omits it (computes `MAX(turn_no) + 1` per session).

### New `DataReader` methods

- `getSessionByCcId` — lookup by Claude Code session id (used by record CLI).
- `listSessions` — filtered/paginated session listing.
- `getFailureSignatureByHash` — signature plus recent linked errors.
- `getTddSessionById` — TDD session with phases + artifacts rolled up.
- `listHypotheses` — filtered hypothesis listing.

## Dependencies

| Dependency | Type | Action | From | To |
| --- | --- | --- | --- | --- |
| (shared) acorn-typescript | dependency | added | — | ^1.4.13 |
