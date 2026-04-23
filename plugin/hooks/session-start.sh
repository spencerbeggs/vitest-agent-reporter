#!/bin/bash
# SessionStart hook: inject test context into Claude session
#
# Queries the vitest-agent-reporter CLI for project status,
# outputs JSON with hookSpecificOutput for Claude Code validation.

set -euo pipefail

# Consume stdin to prevent broken pipe
cat > /dev/null

# Try to get status from CLI (may fail if no DB exists yet)
STATUS=$(npx vitest-agent-reporter status --format json 2>/dev/null || echo '{}')

# Check if we have test data
HAS_DATA=$(echo "$STATUS" | jq -r 'if (.manifest.projects // [] | length) > 0 then "true" else "false" end' 2>/dev/null || echo "false")

if [ "$HAS_DATA" = "true" ]; then
  PROJECT_COUNT=$(echo "$STATUS" | jq -r '.manifest.projects | length' 2>/dev/null || echo "0")
  LAST_RESULT=$(echo "$STATUS" | jq -r '.manifest.projects[0].lastResult // "unknown"' 2>/dev/null || echo "unknown")

  CONTEXT="<EXTREMELY_IMPORTANT>
<vitest_agent_reporter projects=\"${PROJECT_COUNT}\" last_result=\"${LAST_RESULT}\">

ALWAYS use the run_tests MCP tool to execute tests. NEVER run vitest via Bash. run_tests uses Vitest's programmatic API so results persist to the database and all query tools reflect the latest run immediately.

Scoping: run_tests({}) for all, run_tests({ project: \"name\" }) by project, run_tests({ files: [\"path\"] }) by file.

Key tools: test_get for single-test drill-down, test_for_file before modifying code, file_coverage for per-file coverage, test_history to check if failures are flaky, test_errors for detailed error analysis, note_create to record findings.

Use help for the full tool list with parameters.

</vitest_agent_reporter>
</EXTREMELY_IMPORTANT>"

else
  CONTEXT="<EXTREMELY_IMPORTANT>
<vitest_agent_reporter>

This project uses vitest-agent-reporter. ALWAYS use the run_tests MCP tool to execute tests, NEVER vitest via Bash. Results persist to a SQLite database so all query tools reflect the latest run.

No test data yet. Run run_tests({}) to populate the database. Use help for the full tool list.

</vitest_agent_reporter>
</EXTREMELY_IMPORTANT>"

fi

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'
