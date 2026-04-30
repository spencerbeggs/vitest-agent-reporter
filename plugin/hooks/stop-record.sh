#!/bin/bash
# Stop hook: record a hook_fire turn AND inject a tailored wrap-up nudge.
#
# Per spec W5: lighter-weight than SessionEnd (every turn vs end of
# session). Nudge content comes from the shared format-wrapup generator
# via the wrapup CLI subcommand.

set -e

read -r hook_json

cc_session_id=$(jq -r '.session_id // ""' <<< "$hook_json")
cwd=$(jq -r '.cwd // ""' <<< "$hook_json")

if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

# 1. Record the firing as a hook_fire turn.
fire_payload=$(jq -nc --arg cc "$cc_session_id" \
	'{type: "hook_fire", hook_kind: "Stop", cc_session_id: $cc}')
cd "$cwd" && $pm_exec vitest-agent-reporter record turn \
	--cc-session-id "$cc_session_id" \
	"$fire_payload" \
	>/dev/null 2>&1 \
	|| echo "record turn (hook_fire Stop) failed (non-fatal)" >&2

# 2. Compute the wrap-up nudge.
nudge=$(cd "$cwd" && $pm_exec vitest-agent-reporter wrapup \
	--cc-session-id "$cc_session_id" \
	--kind stop \
	--format markdown 2>/dev/null || echo "")

# 3. If non-empty, emit hookSpecificOutput so Claude Code injects it.
if [ -n "$nudge" ]; then
	jq -n --arg ctx "$nudge" '{
		hookSpecificOutput: {
			hookEventName: "Stop",
			additionalContext: $ctx
		}
	}'
fi

exit 0
