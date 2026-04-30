#!/bin/bash
# PostToolUse hook on Bash. Detects `git commit` / `git push` and
# records a commits row + run_changed_files via the record CLI.
#
# Not scoped to a specific agent_type; commit metadata is useful for
# both the orchestrator and the main agent.

set -e

read -r hook_json

tool_name=$(echo "$hook_json" | jq -r '.tool_name // ""')
if [ "$tool_name" != "Bash" ]; then
	exit 0
fi

command=$(echo "$hook_json" | jq -r '.tool_input.command // ""')
case "$command" in
	*"git commit"*|*"git push"*) ;;
	*) exit 0 ;;
esac

cc_session_id=$(echo "$hook_json" | jq -r '.session_id // ""')
cwd=$(echo "$hook_json" | jq -r '.cwd // ""')
if [ -z "$cwd" ]; then
	exit 0
fi

# Resolve git binary (prefer cwd's repo).
if ! (cd "$cwd" && git rev-parse --git-dir >/dev/null 2>&1); then
	exit 0
fi

# Get the most-recent commit metadata.
sha=$(cd "$cwd" && git log -1 --pretty=format:"%H" 2>/dev/null || echo "")
if [ -z "$sha" ]; then
	exit 0
fi
parent_sha=$(cd "$cwd" && git log -1 --pretty=format:"%P" 2>/dev/null | awk '{print $1}')
message=$(cd "$cwd" && git log -1 --pretty=format:"%s" 2>/dev/null)
author=$(cd "$cwd" && git log -1 --pretty=format:"%an <%ae>" 2>/dev/null)
committed_at=$(cd "$cwd" && git log -1 --pretty=format:"%cI" 2>/dev/null)
branch=$(cd "$cwd" && git rev-parse --abbrev-ref HEAD 2>/dev/null)
project=$(jq -r '.name // "unknown"' < "$cwd/package.json" 2>/dev/null || echo "unknown")

# Build the changed-files JSON. `git show --name-status HEAD` outputs lines
# like "M\tpath/to/file" or "A\tpath".
files_json=$(cd "$cwd" && git show --name-status --format= HEAD 2>/dev/null | jq -Rsn '
	[inputs | split("\n")[] | select(length > 0) | split("\t")
	 | { filePath: .[1],
	     changeKind: (
	       if   .[0] == "M" then "modified"
	       elif .[0] == "A" then "added"
	       elif .[0] == "D" then "deleted"
	       elif (.[0] | startswith("R")) then "renamed"
	       else "modified" end
	     )
	   }
	]
')
files_json=${files_json:-"[]"}

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

cd "$cwd" && $pm_exec vitest-agent-reporter record run-workspace-changes \
	--sha "$sha" \
	${parent_sha:+--parent-sha "$parent_sha"} \
	${message:+--message "$message"} \
	${author:+--author "$author"} \
	${committed_at:+--committed-at "$committed_at"} \
	${branch:+--branch "$branch"} \
	--project "$project" \
	"$files_json" \
	>/dev/null 2>&1 \
	|| echo "record run-workspace-changes failed (non-fatal)" >&2

exit 0
