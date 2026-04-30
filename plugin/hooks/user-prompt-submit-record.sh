#!/bin/bash
# UserPromptSubmit hook: record the prompt + inject a light nudge when
# the prompt looks failure-related.
#
# Per spec W5: nudge to use test_history / failure_signature_get
# before fixing. The text-match logic lives in format-wrapup.ts under
# kind=user_prompt_nudge so the rule stays DRY across the CLI and
# MCP tool.

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

# 1. Record the prompt as a user_prompt turn.
payload=$(jq -nc --arg p "$prompt" --arg cc "$cc_session_id" \
	'{type: "user_prompt", prompt: $p, cc_message_id: $cc}')
cd "$cwd" && $pm_exec vitest-agent-reporter record turn \
	--cc-session-id "$cc_session_id" \
	"$payload" \
	>/dev/null 2>&1 \
	|| echo "record turn (user_prompt) failed (non-fatal)" >&2

# 2. Compute the nudge (empty when the prompt isn't failure-related).
nudge=$(cd "$cwd" && $pm_exec vitest-agent-reporter wrapup \
	--cc-session-id "$cc_session_id" \
	--kind user_prompt_nudge \
	--user-prompt-hint "$prompt" \
	--format markdown 2>/dev/null || echo "")

# 3. Inject if non-empty.
if [ -n "$nudge" ]; then
	jq -n --arg ctx "$nudge" '{
		hookSpecificOutput: {
			hookEventName: "UserPromptSubmit",
			additionalContext: $ctx
		}
	}'
fi

exit 0
