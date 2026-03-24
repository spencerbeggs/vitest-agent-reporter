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

## MCP Tools Available

| Tool | Description |
| ---- | ----------- |
| \`test_status\` | Per-project test pass/fail state |
| \`test_overview\` | Test landscape: files, suites, counts |
| \`test_coverage\` | Coverage gaps with uncovered lines |
| \`test_history\` | Flaky/persistent/recovered tests |
| \`test_trends\` | Coverage trajectory per project |
| \`test_errors\` | Search errors by type/message |
| \`test_for_file\` | Tests covering a source file |
| \`run_tests\` | Execute vitest for specific files |
| \`note_create\` | Create a note |
| \`note_list\` | List notes by scope |
| \`note_search\` | Full-text search notes |

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

## Status

No test data yet. Run tests to populate:

\`\`\`bash
pnpm test
\`\`\`

MCP tools are available but will return empty results until tests
have been run. You can use \`note_create\` immediately to capture
planning notes.

## MCP Tools Available

Use \`test_status\`, \`test_coverage\`, \`test_history\`,
\`test_trends\`, \`test_errors\`, \`test_for_file\`, \`run_tests\`,
\`note_create\`, \`note_list\`, \`note_search\` after running tests.
EOF

fi
