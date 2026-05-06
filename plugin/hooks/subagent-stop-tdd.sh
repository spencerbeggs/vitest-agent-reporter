#!/bin/bash
# SubagentStop hook scoped to tdd-task: generate the structured
# handoff message via wrapup --kind=tdd_handoff and store it as a note
# turn on the parent session for the parent agent's next Stop-hook
# injection.

set -e

# shellcheck source=lib/hook-output.sh
. "$(dirname "$0")/lib/hook-output.sh"

hook_json=$(cat)

agent_type=$(echo "$hook_json" | jq -r '.agent_type // ""')
# shellcheck source=lib/match-tdd-agent.sh
. "$(dirname "$0")/lib/match-tdd-agent.sh"
if ! is_tdd_agent "$agent_type"; then
	emit_noop
	exit 0
fi

cc_session_id=$(echo "$hook_json" | jq -r '.session_id // ""')
cwd=$(echo "$hook_json" | jq -r '.cwd // ""')

if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	emit_noop
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

# subagent-start-tdd.sh inserts a subagent row under a synthetic key
# ("<cc_session_id>-subagent-<ts>-<pid>"), not the real cc_session_id.
# The wrapup CLI here uses the real cc_session_id so it can locate the
# session's TDD data. There is no session-end write — the synthetic row
# stays open and its lifetime is inferred from the start timestamp.

# Generate the handoff message using the wrapup CLI in tdd_handoff mode.
handoff=$(cd "$cwd" && $pm_exec vitest-agent wrapup \
	--cc-session-id "$cc_session_id" \
	--kind tdd_handoff \
	--format markdown 2>/dev/null || echo "")

# The parent agent's next Stop hook injects from notes; we don't
# write directly to additionalContext here because SubagentStop
# lifecycle isn't an injection point (per spec W5).
if [ -n "$handoff" ]; then
	# Attempt to record the handoff as a turn (note type) on the parent session.
	parent_cc=$(echo "$hook_json" | jq -r '.parent_session_id // ""')
	if [ -n "$parent_cc" ]; then
		payload=$(jq -nc --arg c "$handoff" '{type: "note", scope: "tdd_handoff", content: $c}')
		cd "$cwd" >/dev/null && $pm_exec vitest-agent record turn \
			--cc-session-id "$parent_cc" \
			"$payload" \
			>/dev/null 2>&1 \
			|| true
	fi
fi

emit_noop
exit 0
