#!/bin/bash
# SessionStart hook: orientation triage injection + sessions row write.
#
# Per Decision D1, the orientation triage report is injected here via
# additionalContext. The sessions row is written with
# triage_was_non_empty so acceptance metric #3 is queryable.

set -euo pipefail

# Read and discard the JSON envelope to avoid broken-pipe; we re-read
# session_id and cwd below.
hook_json=$(cat)

cc_session_id=$(jq -r '.session_id // ""' <<< "$hook_json")
cwd=$(jq -r '.cwd // ""' <<< "$hook_json")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$cwd}"

if [ -z "$cc_session_id" ] || [ -z "$PROJECT_DIR" ]; then
	# Nothing to inject and no session to record.
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$PROJECT_DIR")

# 1. Generate the triage brief.
triage_md=$(cd "$PROJECT_DIR" && $pm_exec vitest-agent-reporter triage --format markdown 2>/dev/null || echo "")

# 2. Compute the triage_was_non_empty flag.
if [ -n "$triage_md" ]; then
	triage_flag="--triage-was-non-empty"
else
	triage_flag=""
fi

# 3. Write the sessions row.
project=$(jq -r '.name // "unknown"' < "$PROJECT_DIR/package.json" 2>/dev/null || echo "unknown")
started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cd "$PROJECT_DIR" && $pm_exec vitest-agent-reporter record session-start \
	--cc-session-id "$cc_session_id" \
	--project "$project" \
	--cwd "$PROJECT_DIR" \
	--agent-kind main \
	--started-at "$started_at" \
	$triage_flag \
	>/dev/null 2>&1 \
	|| echo "record session-start failed (non-fatal)" >&2

# 4. Build the additionalContext markdown -- prefer triage when non-empty,
#    fall back to the generic context message.
if [ -n "$triage_md" ]; then
	context="$triage_md"
else
	context="<EXTREMELY_IMPORTANT>
<vitest_agent_reporter>

This project uses vitest-agent-reporter. Use the run_tests MCP tool to execute tests; results persist to a SQLite database so all query tools reflect the latest run.

No orientation signal yet (no failing tests, flaky tests, or open TDD sessions). Run run_tests({}) to populate the database, or use \`help\` to see the full tool list.

</vitest_agent_reporter>
</EXTREMELY_IMPORTANT>"
fi

# 5. Emit the hookSpecificOutput JSON for Claude Code to inject.
jq -n --arg ctx "$context" '{
	hookSpecificOutput: {
		hookEventName: "SessionStart",
		additionalContext: $ctx
	}
}'
