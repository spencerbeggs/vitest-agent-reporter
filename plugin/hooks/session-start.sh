#!/bin/bash
# SessionStart hook: inject test context into Claude session
#
# Reads stdin JSON for session info, queries the vitest-agent-reporter
# CLI for project status and notes, outputs markdown context.

set -euo pipefail

# Try to get status from CLI (may fail if no DB exists yet)
STATUS=$(npx vitest-agent-reporter status --format json 2>/dev/null || echo '{}')

# Check if we have test data (keyed on project count for resilience to format changes)
HAS_DATA=$(echo "$STATUS" | jq -r 'if (.manifest.projects // [] | length) > 0 then "true" else "false" end' 2>/dev/null || echo "false")

if [ "$HAS_DATA" = "true" ]; then
  # Extract project summary
  PROJECT_COUNT=$(echo "$STATUS" | jq -r '.manifest.projects | length' 2>/dev/null || echo "0")
  LAST_RESULT=$(echo "$STATUS" | jq -r '.manifest.projects[0].lastResult // "unknown"' 2>/dev/null || echo "unknown")

  cat <<EOF
# Vitest Agent Reporter

This project uses **vitest-agent-reporter**, a Vitest reporter and plugin
designed for LLM coding agents. It separates test output — you see structured,
token-efficient summaries while the developer sees standard Vitest output.
Test results, coverage, failure history, and trends persist to a SQLite
database across runs so you always have context from previous test runs.

**Prefer MCP tools over raw \`vitest run\` commands.** The MCP tools give you
structured data — coverage gaps with exact uncovered lines, flaky test
detection, per-file test mapping — without parsing console output. You can
still run \`vitest run\` directly when needed, but the MCP tools are faster
and more precise for targeted queries.

## MCP Tools Available

| Tool | Description |
| ---- | ----------- |
| \`help\` | List all available MCP tools with parameters |
| \`run_tests\` | Execute vitest for specific files or projects |
| \`project_list\` | List all known projects |
| \`test_list\` | List test cases with state and duration |
| \`module_list\` | List test modules (files) |
| \`suite_list\` | List test suites (describe blocks) |
| \`test_status\` | Per-project test pass/fail state |
| \`test_overview\` | Test landscape: files, suites, counts |
| \`test_for_file\` | Tests covering a source file |
| \`test_coverage\` | Coverage gaps with uncovered lines |
| \`test_history\` | Flaky/persistent/recovered tests |
| \`test_trends\` | Coverage trajectory per project |
| \`test_errors\` | Search errors by type/message |
| \`note_create\` | Create a note |
| \`note_list\` | List notes by scope |
| \`note_get\` | Get a note by ID |
| \`note_update\` | Update an existing note |
| \`note_delete\` | Delete a note |
| \`note_search\` | Full-text search notes |
| \`cache_health\` | Database health and staleness check |
| \`configure\` | View captured Vitest settings |
| \`settings_list\` | List Vitest config snapshots |

## Running Tests via MCP

Use \`run_tests\` to execute tests at different scopes:

- **All tests:** \`run_tests({})\`
- **By project:** \`run_tests({ project: "my-project" })\`
- **Individual files:** \`run_tests({ files: ["src/utils.test.ts"] })\`
- **By suite/pattern:** \`run_tests({ files: ["src/services/"] })\`

The tool runs \`vitest run\` under the hood and returns structured output.
Default timeout is 120 seconds (override with \`timeout\` parameter).

## Best Practices

- Use \`test_for_file\` before modifying code to know which tests cover it
- Use \`test_history\` to check if failures are flaky before debugging
- Use \`note_create\` to record debugging findings for future sessions
- Check \`test_coverage\` for uncovered lines after writing code

## Project Status

- **Projects:** ${PROJECT_COUNT}
- **Last result:** ${LAST_RESULT}
EOF

else
  cat <<EOF
# Vitest Agent Reporter

This project uses **vitest-agent-reporter**, a Vitest reporter and plugin
designed for LLM coding agents. It separates test output — you see structured,
token-efficient summaries while the developer sees standard Vitest output.
Test results, coverage, failure history, and trends persist to a SQLite
database across runs so you always have context from previous test runs.

**Prefer MCP tools over raw \`vitest run\` commands.** The MCP tools give you
structured data — coverage gaps with exact uncovered lines, flaky test
detection, per-file test mapping — without parsing console output. You can
still run \`vitest run\` directly when needed, but the MCP tools are faster
and more precise for targeted queries.

## Status

No test data yet. Run tests to populate:

\`\`\`bash
pnpm test
\`\`\`

MCP tools are available but will return empty results until tests
have been run. You can use \`note_create\` immediately to capture
planning notes.

## MCP Tools Available

All 22 tools are registered but most return empty results until tests
have been run. After running tests, use \`help\`, \`test_status\`,
\`test_overview\`, \`test_coverage\`, \`test_history\`, \`test_trends\`,
\`test_errors\`, \`test_for_file\`, \`run_tests\`, \`cache_health\`,
\`configure\`, \`project_list\`, \`test_list\`, \`module_list\`,
\`suite_list\`, \`settings_list\`, \`note_create\`, \`note_list\`,
\`note_get\`, \`note_update\`, \`note_delete\`, \`note_search\`.

Use \`run_tests({})\` to run all tests, or \`run_tests({ project: "name" })\`
for a specific project.
EOF

fi
