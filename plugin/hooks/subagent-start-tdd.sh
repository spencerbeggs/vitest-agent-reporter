#!/bin/bash
# SubagentStart hook scoped to tdd-task: capture the launch
# into the sessions table as a subagent row.
#
# The tdd-task agent's tdd_session_start MCP call (issued from inside
# the subagent) will write the tdd_sessions row; this hook just makes
# sure the parent sessions row exists with agent_kind='subagent' and
# the parent's session id linked.

set -e

# shellcheck source=lib/hook-output.sh
. "$(dirname "$0")/lib/hook-output.sh"
# shellcheck source=lib/hook-debug.sh
. "$(dirname "$0")/lib/hook-debug.sh"

_HOOK="subagent-start-tdd"

hook_json=$(cat)

agent_type=$(echo "$hook_json" | jq -r '.agent_type // ""')
# shellcheck source=lib/match-tdd-agent.sh
. "$(dirname "$0")/lib/match-tdd-agent.sh"
if ! is_tdd_agent "$agent_type"; then
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
# calls when context:fork is active, so the parent's session row
# already exists. Mint a synthetic per-dispatch key by appending a
# timestamp+PID suffix. Artifacts still resolve via the real
# cc_session_id (written by PostToolUse hooks), but this row lets
# session_list(agentKind:'subagent') confirm the dispatch fired.
subagent_session_key="${cc_session_id}-subagent-$(date +%s)-$$"

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

project=$(jq -r '.name // "unknown"' < "$cwd/package.json" 2>/dev/null || echo "unknown")
started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

hook_debug "$_HOOK" "INPUT session_id=$cc_session_id parent=$parent_cc_session_id synthetic_key=$subagent_session_key cwd=$cwd pm_exec=$pm_exec"

_session_out=$(cd "$cwd" && $pm_exec vitest-agent record session-start \
	--cc-session-id "$subagent_session_key" \
	--project "$project" \
	--cwd "$cwd" \
	--agent-kind subagent \
	--agent-type tdd-task \
	${parent_cc_session_id:+--parent-cc-session-id "$cc_session_id"} \
	--started-at "$started_at" 2>&1) || {
	hook_error "$_HOOK" "record session-start rc=$? synthetic_key=$subagent_session_key: $_session_out"
}
hook_debug "$_HOOK" "record session-start: $_session_out"

emit_noop
exit 0
