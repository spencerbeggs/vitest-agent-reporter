#!/bin/bash
# Records a sessions row for SessionStart. Invoked by Claude Code with
# the hook JSON envelope on stdin. Degrades gracefully on failure.
set -e

read -r hook_json

cc_session_id=$(jq -r '.session_id // ""' <<< "$hook_json")
cwd=$(jq -r '.cwd // ""' <<< "$hook_json")

if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	exit 0
fi

# Project name: best-effort from cwd's package.json. Fall back to "unknown".
project=$(jq -r '.name // "unknown"' < "$cwd/package.json" 2>/dev/null || echo "unknown")

started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cd "$cwd" && pnpm exec vitest-agent-reporter record session-start \
	--cc-session-id "$cc_session_id" \
	--project "$project" \
	--cwd "$cwd" \
	--agent-kind main \
	--started-at "$started_at" \
	2>&1 \
	|| echo "record session-start failed (non-fatal)" >&2

exit 0
