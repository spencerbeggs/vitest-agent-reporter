import { publicProcedure } from "../context.js";

const HELP_TEXT = `# vitest-agent-reporter MCP Tools

> 24 tools total.

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

## Parameter Key

- **Required** parameters are unmarked
- **Optional** parameters have \`?\` suffix
- \`project\` / \`subProject\` filter to Vitest project names (supports \`project:subProject\` format)
- \`state\` accepts: \`passed\`, \`failed\`, \`skipped\`, \`pending\`
- \`scope\` accepts: \`global\`, \`project\`, \`module\`, \`suite\`, \`test\`, \`note\`
`;

export const help = publicProcedure.query(() => HELP_TEXT);
