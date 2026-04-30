---
"vitest-agent-reporter-shared": minor
"vitest-agent-reporter": minor
"vitest-agent-reporter-cli": minor
"vitest-agent-reporter-mcp": minor
---

## Features

### Orientation triage report (W3)

A new `format-triage` shared lib generator powers two surfaces:

- `vitest-agent-reporter triage [--format] [--project] [--max-lines]` CLI subcommand
- `triage_brief` MCP tool

The Claude Code plugin's `SessionStart` hook now calls the CLI and injects the brief via `additionalContext`. The hook also writes `sessions.triage_was_non_empty` so acceptance metric #3 is queryable. The earlier β `session-start-record.sh` script is deleted; its job is folded into the rewritten `session-start.sh`.

### Interpretive hook upgrades (W5)

The β record-only hooks for `SessionEnd`, `PreCompact`, and `UserPromptSubmit` graduate to interpretive: each still writes its turn AND injects a tailored prompt. A new `Stop` hook is registered for the first time. Wrap-up content comes from a single shared generator in `format-wrapup`, keyed by a `kind` parameter:

- `stop` — Before-you-finish nudge after each main agent turn
- `session_end` — full wrap-up at end of session
- `pre_compact` — what-matters-next prompt before context compaction
- `tdd_handoff` — pointer-shaped handoff message after a TDD subagent finishes
- `user_prompt_nudge` — light nudge when the user prompt mentions test failure

The `PreToolUse` and `PostToolUse` record hooks stay record-only — they fire too often for prompt injection.

### Hypothesis MCP write tools (W6)

- `hypothesis_record({ sessionId, content, citedTestErrorId?, citedStackFrameId?, createdTurnId? })` — idempotent on `(sessionId, content)`
- `hypothesis_validate({ id, outcome, validatedAt, validatedTurnId? })` — idempotent on `(id, outcome)`

Both ride a new tRPC idempotency middleware at `packages/mcp/src/middleware/idempotency.ts` keyed on `(procedure_path, key)` and backed by an additive `mcp_idempotent_responses` table. Duplicate calls return the cached response with `_idempotentReplay: true` instead of double-writing.

### `wrapup` CLI subcommand and `wrapup_prompt` MCP tool

```bash
vitest-agent-reporter wrapup --since 42 --kind session_end
vitest-agent-reporter wrapup --cc-session-id cc-x --kind stop
```

Same generator as the interpretive hooks. The `wrapup_prompt` MCP tool gives agents a programmatic path to the same tailored prompt without going through a hook.

### `cache prune` CLI subcommand

```bash
vitest-agent-reporter cache prune --keep-recent 30
```

Implements W1 turn-log retention. Drops `turns` rows for sessions older than the cutoff; FK CASCADE removes the linked `tool_invocations` and `file_edits`. The `sessions` summary rows themselves are retained. Default keeps the last 30 sessions in full.

### New `DataStore` methods

- `recordIdempotentResponse({ procedurePath, key, resultJson, createdAt })` — `INSERT … ON CONFLICT DO NOTHING` so duplicate keys are no-ops
- `writeHypothesis({ sessionId, content, citedTestErrorId?, citedStackFrameId?, createdTurnId? })` — returns the new id
- `validateHypothesis({ id, outcome, validatedAt, validatedTurnId? })` — raises a DataStoreError on unknown hypothesis id
- `pruneSessions(keepRecent)` — returns `{ prunedSessions, prunedTurns }`

### New `DataReader` method

- `findIdempotentResponse(procedurePath, key)` — returns `Option<string>` of the cached `result_json`

### Additive schema migration

Adds migration `0003_idempotent_responses` — a single `CREATE TABLE mcp_idempotent_responses(procedure_path, key, result_json, created_at)` with composite PK and a `(procedure_path, created_at DESC)` index. Purely additive: no DROP, so Decision D9 (0002 is the last drop-and-recreate) stays intact. The 41-table count includes this addition.

### MCP tool surface bumps to 37

`triage_brief`, `wrapup_prompt`, `hypothesis_record`, and `hypothesis_validate` are added on top of the β surface (was 31). All four are auto-allowed by the plugin's `PreToolUse` matcher via the `safe-mcp-vitest-agent-reporter-ops.txt` allowlist.
