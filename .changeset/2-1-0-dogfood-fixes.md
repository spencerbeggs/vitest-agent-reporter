---
"vitest-agent-reporter-shared": minor
"vitest-agent-reporter": minor
"vitest-agent-reporter-cli": minor
"vitest-agent-reporter-mcp": minor
---

## Features

### `run_tests` MCP tool gains a `format` parameter

Pass `format: "json"` to receive the raw `AgentReport` plus per-test classifications as pretty-printed JSON instead of the default markdown digest. Useful for non-conversational consumers that need to drive UI off structured fields rather than parse markdown headers.

The default remains `format: "markdown"`; existing callers see no behavior change. The same shape is exported from the package as `formatReportJson(report, classifications?)` for direct use.

## Bug Fixes

### `post-tool-use-record.sh` no longer crashes on MCP tool results

The hook read `.tool_response.success`, but Claude Code passes an array of MCP content blocks (not an object) as `tool_response` for `mcp__*` tool calls. jq raised `Cannot index array with string "success"` and `set -e` aborted the hook on every MCP invocation, surfacing as a debug-console error per call.

Replaced with `(try .tool_response.success catch null)` so type mismatches resolve to `null` instead of throwing.

### `post-tool-use-record.sh` preserves explicit `success: false`

The original implementation used `// true` to default missing values, but jq's `//` operator treats both `null` and `false` as "missing", silently coercing an explicit `success: false` into `success: true`. Real tool failures were being recorded as successes in the turn log.

Replaced the `//` default with an explicit `null` check so only missing values default to `true`; an explicit `false` is now preserved as `false` in the recorded `tool_result` payload.

### Stop / SessionEnd / PreCompact hooks now use a schema-valid envelope

The three interpretive hooks emitted `hookSpecificOutput.additionalContext`, but Claude Code restricts that field to `PreToolUse` / `UserPromptSubmit` / `PostToolUse` / `PostToolBatch` events. Stop hook output validation was failing with `(root): Invalid input` on every fire.

Switched all three hooks to top-level `systemMessage`, which the Claude Code schema accepts on any hook event. The wrap-up nudge is still surfaced; only the field name changed. `user-prompt-submit-record.sh` is unchanged — `additionalContext` remains valid for `UserPromptSubmit`.

### Every hook emits valid JSON to stdout

Several hooks exited silently when there was nothing to inject (record-only branches, early guards, non-test commands), which surfaced in the debug log as `Hook output does not start with {, treating as plain text`. Claude Code was treating empty or stray stdout as plain text and echoing it.

Every hook now emits `{"continue": true}` on the no-op path — semantically equivalent to an empty envelope, but explicit, schema-valid, and self-documenting in debug logs. The active branches (permission decisions, `systemMessage` nudges, `additionalContext` injections) keep their richer envelopes.

## Tests

- New `formatReportJson` helper in `vitest-agent-reporter-mcp` with unit tests covering classifications round-trip, the empty-classifications branch, and a failing-report fixture.
- New unit tests for `recordTurnEffect` in `vitest-agent-reporter-cli` covering the success path, unknown-session failure, malformed-JSON failure, and shape-mismatch failure. `record-turn.ts` is no longer below the 80% coverage target.
