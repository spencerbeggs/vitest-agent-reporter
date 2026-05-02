#!/bin/bash
# SubagentStart hook scoped to tdd-orchestrator: capture the launch
# into the sessions table as a subagent row.
#
# The orchestrator's tdd_session_start MCP call (issued from inside
# the subagent) will write the tdd_sessions row; this hook just makes
# sure the parent sessions row exists with agent_kind='subagent' and
# the parent's session id linked.

set -e

read -r hook_json

agent_type=$(echo "$hook_json" | jq -r '.agent_type // ""')
if [ "$agent_type" != "tdd-orchestrator" ]; then
	exit 0
fi

cc_session_id=$(echo "$hook_json" | jq -r '.session_id // ""')
parent_cc_session_id=$(echo "$hook_json" | jq -r '.parent_session_id // ""')
cwd=$(echo "$hook_json" | jq -r '.cwd // ""')

if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

project=$(jq -r '.name // "unknown"' < "$cwd/package.json" 2>/dev/null || echo "unknown")
started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cd "$cwd" && $pm_exec vitest-agent-reporter record session-start \
	--cc-session-id "$cc_session_id" \
	--project "$project" \
	--cwd "$cwd" \
	--agent-kind subagent \
	--agent-type tdd-orchestrator \
	${parent_cc_session_id:+--parent-cc-session-id "$parent_cc_session_id"} \
	--started-at "$started_at" \
	>/dev/null 2>&1 \
	|| echo "record session-start (subagent) failed (non-fatal)" >&2

exit 0
