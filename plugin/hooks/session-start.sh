#!/bin/bash
# SessionStart hook: inject test context into Claude session
#
# Queries the vitest-agent-reporter CLI for project status,
# outputs JSON with hookSpecificOutput for Claude Code validation.

set -euo pipefail

# Consume stdin to prevent broken pipe
cat > /dev/null

# Anchor to the user's project. In marketplace installs the hook's cwd is
# unrelated to the user's project; CLAUDE_PROJECT_DIR is the canonical
# anchor that Claude Code sets for plugin hooks.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Detect the project's package manager via packageManager field, then
# lockfile, then npm fallback. Mirrors the project's pre-commit hook.
detect_pm() {
  if [ -f "$PROJECT_DIR/package.json" ]; then
    pm=$(jq -r '.packageManager // empty' "$PROJECT_DIR/package.json" 2>/dev/null | cut -d'@' -f1)
    if [ -n "$pm" ]; then
      echo "$pm"
      return
    fi
  fi
  if [ -f "$PROJECT_DIR/pnpm-lock.yaml" ]; then
    echo "pnpm"
  elif [ -f "$PROJECT_DIR/yarn.lock" ]; then
    echo "yarn"
  elif [ -f "$PROJECT_DIR/bun.lock" ]; then
    echo "bun"
  else
    echo "npm"
  fi
}

# Run the CLI from the user's project so it discovers the right cache dir.
# Use the project's package manager so the binary resolves from the local
# node_modules/.bin without falling back to a remote npm fetch (`npx --no`
# fails fast instead of downloading).
run_status() {
  local pm
  pm=$(detect_pm)
  cd "$PROJECT_DIR" 2>/dev/null || return 1
  case "$pm" in
    pnpm) pnpm exec vitest-agent-reporter status --format json 2>/dev/null ;;
    yarn) yarn exec vitest-agent-reporter status --format json 2>/dev/null ;;
    bun)  bunx vitest-agent-reporter status --format json 2>/dev/null ;;
    *)    npx --no -- vitest-agent-reporter status --format json 2>/dev/null ;;
  esac
}

# Try to get status from CLI; fall back to empty object if unavailable.
STATUS=$(run_status || echo '{}')

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
