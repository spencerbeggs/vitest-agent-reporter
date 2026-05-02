#!/bin/bash
# PreToolUse hook for the TDD orchestrator subagent — restricted Bash.
#
# Matches on agent_type='tdd-orchestrator'. Blocks the W2 restricted
# command list (--update, -u, --reporter=silent, --bail, -t,
# --testNamePattern) plus anti-patterns 5-7 from the spec
# (coverage.exclude / setupFiles / globalSetup / *.snap edits).
#
# Matched-but-not-blocked tool calls fall through (exit 0). Blocked
# calls return JSON with a permission decision of "deny" so Claude
# Code surfaces the rejection to the orchestrator.

set -euo pipefail

read -r hook_json

agent_type=$(echo "$hook_json" | jq -r '.agent_type // .matcher.agent_type // ""')

# Only restrict inside the TDD orchestrator.
if [ "$agent_type" != "tdd-orchestrator" ]; then
	exit 0
fi

tool_name=$(echo "$hook_json" | jq -r '.tool_name // ""')

# We only restrict Bash, Edit, Write, MultiEdit.
case "$tool_name" in
	Bash|Edit|Write|MultiEdit) ;;
	*) exit 0 ;;
esac

if [ "$tool_name" = "Bash" ]; then
	command=$(echo "$hook_json" | jq -r '.tool_input.command // ""')
	# Anti-pattern set: any flag/path that weakens the test signal.
	forbidden_patterns=(
		'--update'
		' -u( |$)'
		'--reporter=silent'
		'--bail(=| )'
		' -t( |$)'
		'--testNamePattern'
		'\.snap'
	)
	for pattern in "${forbidden_patterns[@]}"; do
		if [[ "$command" =~ $pattern ]]; then
			jq -n --arg p "$pattern" --arg c "$command" '{
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: "TDD orchestrator may not use \($p) (matched in: \($c)). Run tests via the run_tests MCP tool instead."
				}
			}'
			exit 0
		fi
	done
	exit 0
fi

# Edit / Write / MultiEdit: block edits to config files that weaken
# the test signal.
file_path=$(echo "$hook_json" | jq -r '.tool_input.file_path // .tool_input.path // ""')
if [ -z "$file_path" ]; then
	exit 0
fi

# Snapshot files
if [[ "$file_path" =~ \.snap$ ]]; then
	jq -n --arg f "$file_path" '{
		hookSpecificOutput: {
			hookEventName: "PreToolUse",
			permissionDecision: "deny",
			permissionDecisionReason: "TDD orchestrator may not edit snapshot files: \($f). Snapshot mutations hide test changes."
		}
	}'
	exit 0
fi

# vitest config files: scan content for coverage.exclude / setupFiles / globalSetup
case "$file_path" in
	*vitest.config.*|*vitest.workspace.*|*vite.config.*)
		new_content=$(echo "$hook_json" | jq -r '.tool_input.content // .tool_input.new_string // ""')
		if [ -n "$new_content" ] && (echo "$new_content" | grep -E -q 'coverage\.exclude|setupFiles|globalSetup'); then
			jq -n --arg f "$file_path" '{
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: "TDD orchestrator may not edit coverage.exclude / setupFiles / globalSetup in \($f). These are signal-suppression vectors."
				}
			}'
			exit 0
		fi
		;;
esac

exit 0
