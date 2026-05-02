---
"vitest-agent-reporter-shared": major
"vitest-agent-reporter": major
"vitest-agent-reporter-cli": major
"vitest-agent-reporter-mcp": major
---

## Features

The 2.0 line ships. This release rolls up the work from the four pre-release branches (alpha schema, beta substrate wiring, RC interpretive hooks, and final TDD orchestrator) into a single major version.

### W2 TDD orchestrator subagent

- `/tdd <goal>` slash command spawns a `tdd-orchestrator` subagent.
- Iron-law system prompt: production code cannot be written before a failing test.
- Eight-state state machine with structurally-enforced phase transitions via `tdd_phase_transition_request` and the D2 evidence-binding rules.
- Restricted-Bash hook (`pre-tool-use-bash-tdd.sh`) blocks `--update`, `-u`, `--reporter=silent`, `--bail`, `-t`, `--testNamePattern`, `*.snap` edits, and edits to `coverage.exclude` / `setupFiles` / `globalSetup`.
- 9 sub-skill primitives ship as both inline system-prompt sections (per Decision D6) AND standalone `plugin/skills/tdd-primitives/` Skill files.

### W6 TDD lifecycle MCP write tools

Six new tools registered with the MCP server (41 total, up from RC's 35):

- `tdd_session_start` — open a session (idempotent on `(sessionId, goal)`).
- `tdd_session_end` — close with succeeded/blocked/abandoned (idempotent on `(tddSessionId, outcome)`).
- `tdd_session_resume` — read-only digest of an open session.
- `decompose_goal_into_behaviors` — split a fuzzy goal into atomic behaviors (idempotent on `(tddSessionId, goal)`).
- `tdd_phase_transition_request` — validates D2 binding rules and writes `tdd_phases` on accept; returns `{ accepted: false, denialReason, remediation }` on deny. Not registered for idempotency replay (artifact log changes meaningfully between calls).
- `commit_changes` — read-only `commits` + `run_changed_files` view.

### CLI additions

- `vitest-agent-reporter record tdd-artifact` — Decision D7 says artifacts are written by hooks, not by agents.
- `vitest-agent-reporter record run-workspace-changes` — populates the `commits` substrate.

### W4 polish

- New `--format=ci-annotations` formatter emits GitHub Actions `::error file=...,line=...::` syntax. Auto-selected when running in `ci-github`.
- Terminal OSC-8 hyperlinks in CLI/console output (markdown formatter, stdout target only). Never emitted in MCP responses.

### Anti-pattern detection

- PostToolUse hooks on test-file edits scan for escape-hatch tokens (`it.skip`, `it.todo`, `it.fails`, `it.concurrent`, `.skipIf`, `.todoIf`) and record `tdd_artifacts(kind='test_weakened')`.
- PostToolUse hook on Bash test runs records `test_failed_run` / `test_passed_run` artifacts.
- PostToolUse hook on Edit/Write to non-test files records `code_written`; on test files, `test_written`.
- All anti-pattern hooks are scoped via `agent_type='tdd-orchestrator'` so the main agent is unaffected.

## Breaking Changes

This is the cumulative 2.0 break from 1.x. Highlights from earlier pre-releases:

- 1.x users lose pre-2.0 history on first 2.0 run (database location moves from `node_modules/.vite/.../data.db` to the deterministic XDG path).
- The reporter package no longer exports the MCP server via `./mcp` subpath — the MCP server is its own bin in `vitest-agent-reporter-mcp`.
- Direct schema imports must change from `vitest-agent-reporter` to `vitest-agent-reporter-shared`.
- `AgentReporter.onInit` is now async (only breaks consumers manually instantiating `AgentReporter` and synchronously calling `onInit`).
- `coverageThreshold: number` becomes `coverageThresholds: Record<string, unknown>` (Vitest-native format) — landed earlier in the 1.x line.
- `consoleStrategy` plugin option renamed to `strategy`.
- `debug: boolean` plugin option replaced by `logLevel`/`logFile` plus env-var fallback.

See the per-pre-release changesets in this directory for the detailed breakdown of alpha/beta/RC work.

## Build System

One new additive SQLite migration: `0004_test_cases_created_turn_id` adds the `test_cases.created_turn_id` column required by D2 binding rule 1. Tables count is unchanged (still 41); migration count is now 4. Decision D9 (last drop-and-recreate was 0002) holds.

## Other

### Acceptance metrics (queryable via `acceptance_metrics` MCP tool)

The four metrics from spec Annex A are now load-bearing on the dogfood corpus:

1. Phase-evidence integrity: at least 80% of TDD sessions produce `test_failed_run` before `code_written`.
2. Compliance-hook responsiveness: at least 40% of `SessionEnd` / `PreCompact` wrap-up prompts result in a `note_create` / `hypothesis_validate` / `tdd_session_end` call within the same session.
3. Orientation usefulness: at least 50% of triaged sessions reference a triage suggestion in the first 3 user prompts.
4. Anti-pattern detection rate: at least 95% of TDD sessions produce zero `tdd_artifacts(kind='test_weakened')` events.

These are dogfood metrics, not external commitments. They tell us what 2.1's hard-enforcement hooks should target.
