#!/bin/bash
# Records a hook_fire turn for PreCompact. β only records the firing;
# the prompt-injection nudge graduates to RC's interpretive hooks.
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

payload=$(jq -nc --arg cc "$cc_session_id" \
	'{type: "hook_fire", hook_kind: "PreCompact", cc_session_id: $cc}')

cd "$cwd" && $pm_exec vitest-agent-reporter record turn \
	--cc-session-id "$cc_session_id" \
	"$payload" \
	>/dev/null 2>&1 \
	|| echo "record turn (hook_fire PreCompact) failed (non-fatal)" >&2

exit 0
