#!/bin/bash
# Records a user_prompt turn payload for UserPromptSubmit.
set -e

read -r hook_json

cc_session_id=$(jq -r '.session_id // ""' <<< "$hook_json")
cwd=$(jq -r '.cwd // ""' <<< "$hook_json")
prompt=$(jq -r '.prompt // ""' <<< "$hook_json")

if [ -z "$cc_session_id" ] || [ -z "$cwd" ] || [ -z "$prompt" ]; then
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

payload=$(jq -nc --arg p "$prompt" --arg cc "$cc_session_id" \
	'{type: "user_prompt", prompt: $p, cc_message_id: $cc}')

cd "$cwd" && $pm_exec vitest-agent-reporter record turn \
	--cc-session-id "$cc_session_id" \
	"$payload" \
	>/dev/null 2>&1 \
	|| echo "record turn (user_prompt) failed (non-fatal)" >&2

exit 0
