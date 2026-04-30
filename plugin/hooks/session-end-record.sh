#!/bin/bash
# Updates sessions.ended_at + end_reason for SessionEnd.
set -e

read -r hook_json

cc_session_id=$(jq -r '.session_id // ""' <<< "$hook_json")
cwd=$(jq -r '.cwd // ""' <<< "$hook_json")
reason=$(jq -r '.reason // ""' <<< "$hook_json")

if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	exit 0
fi

ended_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

if [ -n "$reason" ]; then
	cd "$cwd" && pnpm exec vitest-agent-reporter record session-end \
		--cc-session-id "$cc_session_id" \
		--ended-at "$ended_at" \
		--end-reason "$reason" \
		2>&1 \
		|| echo "record session-end failed (non-fatal)" >&2
else
	cd "$cwd" && pnpm exec vitest-agent-reporter record session-end \
		--cc-session-id "$cc_session_id" \
		--ended-at "$ended_at" \
		2>&1 \
		|| echo "record session-end failed (non-fatal)" >&2
fi

exit 0
