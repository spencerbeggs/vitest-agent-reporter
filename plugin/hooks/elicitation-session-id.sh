#!/usr/bin/env bash
set -euo pipefail
INPUT=$(cat)
SERVER=$(echo "$INPUT" | jq -r '.mcp_server_name // empty')
# Accept "plugin:vitest-agent:vitest-reporter" (fully-qualified by CC)
# or the bare "vitest-reporter" for resilience.
case "$SERVER" in
  *":vitest-reporter" | "vitest-reporter") ;;
  *) echo '{}'; exit 0 ;;
esac
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
if [ -z "$SESSION_ID" ]; then echo '{}'; exit 0; fi
jq -n --arg sid "$SESSION_ID" '{
  "hookSpecificOutput": {
    "hookEventName": "Elicitation",
    "action": "accept",
    "content": { "sessionId": $sid }
  }
}'
exit 0
