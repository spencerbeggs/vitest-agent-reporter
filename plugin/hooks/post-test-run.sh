#!/bin/bash
# PostToolUse hook: detect vitest runs and suggest MCP tools
#
# Reads stdin JSON for the Bash command that was executed.
# If it looks like a failed test run, output a reminder about MCP tools.

set -euo pipefail

# shellcheck source=lib/hook-output.sh
. "$(dirname "$0")/lib/hook-output.sh"

# Read the tool input from stdin
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

# Check if the command looks like a test run
if echo "$COMMAND" | grep -qE '(^|/|npx[[:space:]]+|pnpm[[:space:]]+exec[[:space:]]+)(vitest|jest)([[:space:]]|$)|([[:space:]]|^)(pnpm|npm|bun|yarn)[[:space:]]+(run[[:space:]]+)?test([[:space:]]|$)'; then
  # Check exit code from tool result
  EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_result.exit_code // "0"' 2>/dev/null || echo "0")

  if [ "$EXIT_CODE" != "0" ]; then
    # Tests failed -- suggest debugging tools and run_tests
    CONTEXT="<test_failure_guidance>
Use MCP tools for analysis instead of re-running vitest via Bash:
- run_tests to re-run tests (uses Vitest programmatic API, updates the database)
- test_get for single-test drill-down with errors, history, and classification
- test_errors to search errors by type
- test_history to check if failures are flaky
- test_for_file to find related tests
- file_coverage to check coverage for affected files
- note_create to record debugging findings

Prefer run_tests over vitest via Bash so results persist to the database and all query tools reflect the latest run.
</test_failure_guidance>"

    emit_additional_context "PostToolUse" "$CONTEXT"
  else
    # Tests passed via Bash -- gentle nudge to use run_tests next time
    CONTEXT="<test_run_tip>
Tip: Use the run_tests MCP tool instead of running vitest via Bash. It uses Vitest's programmatic API and automatically updates the database so all query tools (test_status, test_coverage, etc.) reflect the latest results.
</test_run_tip>"

    emit_additional_context "PostToolUse" "$CONTEXT"
  fi
else
  # Non-test command: still emit valid JSON so Claude Code parses
  # stdout as structured rather than logging "treating as plain text".
  emit_noop
fi

exit 0
