#!/usr/bin/env bash
# PreToolUse hook: auto-allow read-only and project-scoped MCP tools provided
# by the vitest-agent-reporter MCP server.
#
# All 24 tools are listed in lib/safe-mcp-vitest-agent-reporter-ops.txt.
# Anything else (or a future tool not yet added to the list) falls through
# without a decision so the standard permission prompt fires.
set -euo pipefail

ENVELOPE=$(cat)
TOOL=$(echo "$ENVELOPE" | jq -r '.tool_name // empty')
[ -z "$TOOL" ] && exit 0

case "$TOOL" in
  mcp__vitest-agent-reporter__*)  OP="${TOOL#mcp__vitest-agent-reporter__}" ;;
  *) exit 0 ;;
esac

ALLOW="${CLAUDE_PLUGIN_ROOT}/hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt"
[ -f "$ALLOW" ] || exit 0

# Strip comments and blank lines, then check for an exact match.
if grep -vE '^[[:space:]]*(#|$)' "$ALLOW" | grep -Fxq "$OP"; then
  jq -n --arg t "$TOOL" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: ("auto-allowed MCP tool: " + $t)
    }
  }'
fi

exit 0
