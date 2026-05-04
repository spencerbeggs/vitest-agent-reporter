#!/bin/bash
# PostToolUse hook: detect vitest runs, associate the run with the current
# session, and suggest MCP tools for analysis.
#
# Reads stdin JSON for the Bash command that was executed.

set -euo pipefail

# shellcheck source=lib/hook-output.sh
. "$(dirname "$0")/lib/hook-output.sh"
# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

# Check if the command looks like a test run.
# Matches: `vitest`, `./vitest`, `npx vitest`, `pnpm exec vitest`, `pnpm vitest`,
# `bunx vitest`, `yarn vitest`, `pnpm test`, `npm test`, `bun test`, `yarn test`.
if echo "$COMMAND" | grep -qE '(^|/|npx[[:space:]]+|pnpm[[:space:]]+(exec[[:space:]]+)?|bunx[[:space:]]+|yarn[[:space:]]+)(vitest|jest)([[:space:]]|$)|([[:space:]]|^)(pnpm|npm|bun|yarn)[[:space:]]+(run[[:space:]]+)?test([[:space:]]|$)'; then
  CC_SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""' 2>/dev/null || echo "")
  CWD=$(echo "$INPUT" | jq -r '.cwd // ""' 2>/dev/null || echo "")

  # Associate the latest test run with the current Claude Code session.
  # Best-effort: errors are silently ignored so the hook never blocks on
  # a DB failure. The association enables session-scoped test-run queries.
  if [ -n "$CC_SESSION_ID" ] && [ -n "$CWD" ]; then
    pm_exec=$(detect_pm_exec "$CWD")
    (cd "$CWD" && $pm_exec vitest-agent record run-trigger \
      --cc-session-id "$CC_SESSION_ID" \
      --invocation-method bash 2>/dev/null) || true
    (cd "$CWD" && $pm_exec vitest-agent record test-case-turns \
      --cc-session-id "$CC_SESSION_ID" 2>/dev/null) || true
  fi

  EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_result.exit_code // "0"' 2>/dev/null || echo "0")

  if [ "$EXIT_CODE" != "0" ]; then
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
    CONTEXT="<test_run_tip>
Tip: Use the run_tests MCP tool instead of running vitest via Bash. It uses Vitest's programmatic API and automatically updates the database so all query tools (test_status, test_coverage, etc.) reflect the latest results.
</test_run_tip>"

    emit_additional_context "PostToolUse" "$CONTEXT"
  fi
else
  emit_noop
fi

exit 0
