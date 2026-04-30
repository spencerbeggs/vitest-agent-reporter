#!/bin/bash
# SubagentStop hook scoped to tdd-orchestrator: write end_reason +
# generate the structured handoff message via wrapup --kind=tdd_handoff
# and store it as a note for the parent agent's next Stop-hook injection.

set -e

read -r hook_json

agent_type=$(echo "$hook_json" | jq -r '.agent_type // ""')
if [ "$agent_type" != "tdd-orchestrator" ]; then
	exit 0
fi

cc_session_id=$(echo "$hook_json" | jq -r '.session_id // ""')
cwd=$(echo "$hook_json" | jq -r '.cwd // ""')

if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

ended_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 1. Close the subagent session row.
cd "$cwd" && $pm_exec vitest-agent-reporter record session-end \
	--cc-session-id "$cc_session_id" \
	--ended-at "$ended_at" \
	--end-reason "subagent_stop" \
	>/dev/null 2>&1 \
	|| echo "record session-end (subagent) failed (non-fatal)" >&2

# 2. Generate the handoff message using the wrapup CLI in tdd_handoff mode.
handoff=$(cd "$cwd" && $pm_exec vitest-agent-reporter wrapup \
	--cc-session-id "$cc_session_id" \
	--kind tdd_handoff \
	--format markdown 2>/dev/null || echo "")

# 3. The parent agent's next Stop hook injects from notes; we don't
#    write directly to additionalContext here because SubagentStop
#    lifecycle isn't an injection point (per spec W5).
if [ -n "$handoff" ]; then
	# Attempt to record the handoff as a turn (note type) on the parent session.
	parent_cc=$(echo "$hook_json" | jq -r '.parent_session_id // ""')
	if [ -n "$parent_cc" ]; then
		payload=$(jq -nc --arg c "$handoff" '{type: "note", scope: "tdd_handoff", content: $c}')
		cd "$cwd" && $pm_exec vitest-agent-reporter record turn \
			--cc-session-id "$parent_cc" \
			"$payload" \
			>/dev/null 2>&1 \
			|| echo "record turn (tdd_handoff note) failed (non-fatal)" >&2
	fi
fi

exit 0
