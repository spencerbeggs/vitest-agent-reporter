import { publicProcedure } from "../context.js";

const HELP_TEXT = `# vitest-agent-reporter MCP Tools

> 43 tools total.

## General

| Tool | Parameters | Description |
| ---- | ---------- | ----------- |
| \`help\` | _(none)_ | List all available MCP tools with parameters |

## Test Data

| Tool | Parameters | Description |
| ---- | ---------- | ----------- |
| \`test_status\` | \`project?\` | Per-project test pass/fail state |
| \`test_overview\` | \`project?\` | Test landscape with run metrics |
| \`test_get\` | \`fullName\`, \`project?\`, \`subProject?\` | Single test drill-down: state, errors, history, classification |
| \`test_coverage\` | \`project?\`, \`subProject?\` | Coverage gaps with uncovered lines |
| \`file_coverage\` | \`filePath\`, \`project?\`, \`subProject?\` | Per-file coverage with uncovered lines and related tests |
| \`test_history\` | \`project\`, \`subProject?\` | Flaky/persistent/recovered tests |
| \`test_trends\` | \`project\`, \`subProject?\`, \`limit?\` | Coverage trajectory over time |
| \`test_errors\` | \`project\`, \`subProject?\`, \`errorName?\` | Errors with diffs and stacks |
| \`test_for_file\` | \`filePath\` | Tests covering a source file |

## Discovery

| Tool | Parameters | Description |
| ---- | ---------- | ----------- |
| \`project_list\` | _(none)_ | All projects with latest run summary |
| \`test_list\` | \`project?\`, \`subProject?\`, \`state?\`, \`module?\`, \`limit?\` | Test cases with state and duration |
| \`module_list\` | \`project?\`, \`subProject?\` | Test modules (files) with test counts |
| \`suite_list\` | \`project?\`, \`subProject?\`, \`module?\` | Test suites (describe blocks) |
| \`settings_list\` | _(none)_ | Vitest config snapshots |

## Execution

| Tool | Parameters | Description |
| ---- | ---------- | ----------- |
| \`run_tests\` | \`files?\`, \`project?\`, \`timeout?\` | Run vitest with optional filters |

Scopes: \`run_tests({})\` all tests, \`run_tests({ project: "name" })\` by project, \`run_tests({ files: ["path"] })\` specific files.

## Diagnostics

| Tool | Parameters | Description |
| ---- | ---------- | ----------- |
| \`cache_health\` | _(none)_ | Database health and staleness check |
| \`configure\` | \`settingsHash?\` | View captured Vitest settings |

## Notes

| Tool | Parameters | Description |
| ---- | ---------- | ----------- |
| \`note_create\` | \`title\`, \`content\`, \`scope\`, \`project?\`, \`subProject?\`, \`testFullName?\`, \`modulePath?\`, \`parentNoteId?\`, \`createdBy?\`, \`expiresAt?\`, \`pinned?\` | Create a scoped note |
| \`note_list\` | \`scope?\`, \`project?\`, \`testFullName?\` | List notes with filters |
| \`note_get\` | \`id\` | Get a note by ID |
| \`note_update\` | \`id\`, \`title?\`, \`content?\`, \`pinned?\`, \`expiresAt?\` | Update a note |
| \`note_delete\` | \`id\` | Delete a note |
| \`note_search\` | \`query\` | Full-text search notes |

## Sessions / Turns / TDD reads (β)

| Tool | Parameters | Description |
| ---- | ---------- | ----------- |
| \`session_list\` | \`project?\`, \`agentKind?\`, \`limit?\` | List recorded Claude Code sessions |
| \`session_get\` | \`id\` | Full detail for one session by integer id |
| \`turn_search\` | \`sessionId?\`, \`since?\`, \`type?\`, \`limit?\` | Search turns (default limit 100) |
| \`failure_signature_get\` | \`hash\` | Stable failure signature with recent example errors |
| \`tdd_session_get\` | \`id\` | TDD session with phases and artifacts rolled up |
| \`hypothesis_list\` | \`sessionId?\`, \`outcome?\`, \`limit?\` | List recorded hypotheses (\`outcome=open\` for unvalidated) |
| \`acceptance_metrics\` | _(none)_ | Four spec Annex A acceptance metrics |
| \`triage_brief\` | \`project?\`, \`maxLines?\` | Orientation triage: failing tests, flaky tests, open TDD sessions, next actions |

## Hypothesis writes (RC)

| Tool | Parameters | Description |
| ---- | ---------- | ----------- |
| \`hypothesis_record\` | \`sessionId\`, \`content\`, \`createdTurnId?\`, \`citedTestErrorId?\`, \`citedStackFrameId?\` | Record an agent hypothesis; returns \`{ id }\` |
| \`hypothesis_validate\` | \`id\`, \`outcome\`, \`validatedAt\`, \`validatedTurnId?\` | Record validation outcome for a hypothesis; returns \`{}\` |

## Wrap-up prompts (RC)

| Tool | Parameters | Description |
| ---- | ---------- | ----------- |
| \`wrapup_prompt\` | \`sessionId?\`, \`ccSessionId?\`, \`kind?\`, \`userPromptHint?\` | Tailored wrap-up prompt for a session (Stop / SessionEnd / PreCompact / TDD handoff / UserPromptSubmit nudge variants) |

## TDD lifecycle (final)

- tdd_session_start — open a TDD session for a goal (idempotent on sessionId+goal)
- tdd_session_end — close a TDD session with succeeded/blocked/abandoned (idempotent on tddSessionId+outcome)
- tdd_session_resume — markdown digest of an open session for resume context
- decompose_goal_into_behaviors — split a goal into a backlog (idempotent on tddSessionId+goal)
- tdd_phase_transition_request — request a phase transition with cited artifact (validates D2 binding rules)

## Workspace history (final)

- commit_changes — commit metadata + changed files (populated by post-commit hook)

## Parameter Key

- **Required** parameters are unmarked
- **Optional** parameters have \`?\` suffix
- \`project\` / \`subProject\` filter to Vitest project names (supports \`project:subProject\` format)
- \`state\` accepts: \`passed\`, \`failed\`, \`skipped\`, \`pending\`
- \`scope\` accepts: \`global\`, \`project\`, \`module\`, \`suite\`, \`test\`, \`note\`
`;

export const help = publicProcedure.query(() => HELP_TEXT);
