#!/bin/bash
# SessionEnd hook: record + inject full wrap-up prompt.
#
# Per spec W5: agent reviews touched tests/files, records insights via
# note_create, marks hypotheses validated/invalidated, updates
# tdd_sessions.outcome. Wrap-up content from formatWrapupEffect via
# the wrapup CLI.

set -e

read -r hook_json

cc_session_id=$(jq -r '.session_id // ""' <<< "$hook_json")
cwd=$(jq -r '.cwd // ""' <<< "$hook_json")
reason=$(jq -r '.reason // ""' <<< "$hook_json")

if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

ended_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 1. Record the session end.
if [ -n "$reason" ]; then
	cd "$cwd" && $pm_exec vitest-agent-reporter record session-end \
		--cc-session-id "$cc_session_id" \
		--ended-at "$ended_at" \
		--end-reason "$reason" \
		>/dev/null 2>&1 \
		|| echo "record session-end failed (non-fatal)" >&2
else
	cd "$cwd" && $pm_exec vitest-agent-reporter record session-end \
		--cc-session-id "$cc_session_id" \
		--ended-at "$ended_at" \
		>/dev/null 2>&1 \
		|| echo "record session-end failed (non-fatal)" >&2
fi

# 2. Compute the wrap-up prompt.
wrapup=$(cd "$cwd" && $pm_exec vitest-agent-reporter wrapup \
	--cc-session-id "$cc_session_id" \
	--kind session_end \
	--format markdown 2>/dev/null || echo "")

# 3. Inject if non-empty.
if [ -n "$wrapup" ]; then
	jq -n --arg ctx "$wrapup" '{
		hookSpecificOutput: {
			hookEventName: "SessionEnd",
			additionalContext: $ctx
		}
	}'
fi

exit 0
