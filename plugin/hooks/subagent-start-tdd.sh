#!/bin/bash
# SubagentStart hook scoped to tdd-orchestrator: capture the launch
# into the sessions table as a subagent row.
#
# The orchestrator's tdd_session_start MCP call (issued from inside
# the subagent) will write the tdd_sessions row; this hook just makes
# sure the parent sessions row exists with agent_kind='subagent' and
# the parent's session id linked.

set -e

# shellcheck source=lib/hook-output.sh
. "$(dirname "$0")/lib/hook-output.sh"

hook_json=$(cat)

agent_type=$(echo "$hook_json" | jq -r '.agent_type // ""')
# shellcheck source=lib/match-tdd-agent.sh
. "$(dirname "$0")/lib/match-tdd-agent.sh"
if ! is_tdd_orchestrator "$agent_type"; then
	emit_noop
	exit 0
fi

cc_session_id=$(echo "$hook_json" | jq -r '.session_id // ""')
parent_cc_session_id=$(echo "$hook_json" | jq -r '.parent_session_id // ""')
cwd=$(echo "$hook_json" | jq -r '.cwd // ""')

if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	emit_noop
	exit 0
fi

# Claude Code reuses the parent's cc_session_id for subagent tool
# calls, so the parent's session row already exists by the time this
# hook fires. The sessions table has UNIQUE(cc_session_id), so a
# blind INSERT here would always trip the constraint. Treat the
# write as best-effort: if it succeeds, we got a fresh subagent row;
# if it fails (most commonly because the row already exists), the
# downstream artifact writes will still resolve the parent's row by
# cc_session_id and write artifacts under that. Either way, the
# orchestrator's TDD lifecycle keeps working.

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

project=$(jq -r '.name // "unknown"' < "$cwd/package.json" 2>/dev/null || echo "unknown")
started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cd "$cwd" >/dev/null && $pm_exec vitest-agent record session-start \
	--cc-session-id "$cc_session_id" \
	--project "$project" \
	--cwd "$cwd" \
	--agent-kind subagent \
	--agent-type tdd-orchestrator \
	${parent_cc_session_id:+--parent-cc-session-id "$parent_cc_session_id"} \
	--started-at "$started_at" \
	>/dev/null 2>&1 \
	|| true

emit_noop
exit 0
