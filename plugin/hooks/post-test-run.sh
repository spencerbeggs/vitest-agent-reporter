#!/bin/bash
# PostToolUse hook: detect vitest runs and suggest MCP tools
#
# Reads stdin JSON for the Bash command that was executed.
# If it looks like a test run, output a reminder about MCP tools.

set -euo pipefail

# Read the tool input from stdin
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null || echo "")

# Check if the command looks like a test run
if echo "$COMMAND" | grep -qE '(vitest|jest|pnpm test|npm test|bun test|yarn test)'; then
  # Check exit code from tool result
  EXIT_CODE=$(echo "$INPUT" | jq -r '.tool_result.exit_code // "0"' 2>/dev/null || echo "0")

  if [ "$EXIT_CODE" != "0" ]; then
    # Tests failed -- suggest debugging tools
    jq -n '{
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: "Tests failed. Use MCP tools for analysis:\n- `test_errors` to search errors by type\n- `test_history` to check if failures are flaky\n- `test_for_file` to find related tests\n- `note_create` to record debugging findings"
      }
    }'
  fi
  # If tests passed, stay silent (no noise)
fi

# Exit 0 for non-test commands (no output)
exit 0
