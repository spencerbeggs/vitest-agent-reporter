#!/bin/bash
# PostToolUse hook (matcher: agent_type=tdd-orchestrator). Records
# tdd_artifacts rows reflecting what the orchestrator just did:
#  - Bash test run -> test_passed_run / test_failed_run
#  - Edit/Write to *.test.* -> test_written
#  - Edit/Write to anything else -> code_written
#
# Per Decision D7, only hooks write artifacts; the agent never does.

set -e

read -r hook_json

agent_type=$(echo "$hook_json" | jq -r '.agent_type // ""')
if [ "$agent_type" != "tdd-orchestrator" ]; then
	exit 0
fi

cc_session_id=$(echo "$hook_json" | jq -r '.session_id // ""')
cwd=$(echo "$hook_json" | jq -r '.cwd // ""')
tool_name=$(echo "$hook_json" | jq -r '.tool_name // ""')

if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

recorded_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

case "$tool_name" in
	Bash)
		command=$(echo "$hook_json" | jq -r '.tool_input.command // ""')
		# Match common test-runner invocations.
		if echo "$command" | grep -E -q '(vitest|jest)|(npm|pnpm|yarn|bun) (run )?(test|vitest)'; then
			# Exit code surfacing differs by Claude Code version; check both.
			exit_code=$(echo "$hook_json" | jq -r '.tool_response.exit_code // .tool_response.code // 0')
			kind="test_passed_run"
			if [ "$exit_code" != "0" ]; then
				kind="test_failed_run"
			fi
			cd "$cwd" && $pm_exec vitest-agent-reporter record tdd-artifact \
				--cc-session-id "$cc_session_id" \
				--artifact-kind "$kind" \
				--recorded-at "$recorded_at" \
				>/dev/null 2>&1 \
				|| echo "record tdd-artifact ($kind) failed (non-fatal)" >&2
		fi
		;;
	mcp__vitest-agent-reporter__run_tests)
		# The orchestrator runs tests primarily through the run_tests
		# MCP tool, so a Bash-only matcher would silently miss every
		# real test execution and break evidence-based phase
		# transitions. The MCP tool returns markdown whose headline
		# starts with `## ❌ Vitest -- N failed, ...` on failure and
		# `## ✅ Vitest -- N passed ...` on success; classify the
		# response on that prefix.
		response_text=$(echo "$hook_json" | jq -r '
			(.tool_response.content // [])
			| map(select(.type == "text") | .text)
			| join("\n")
			// (.tool_response | tostring)
		')
		kind="test_passed_run"
		if echo "$response_text" | grep -q -E '^##[[:space:]]*❌|^##[[:space:]]*[^✅]*[0-9]+ failed,'; then
			kind="test_failed_run"
		fi
		cd "$cwd" && $pm_exec vitest-agent-reporter record tdd-artifact \
			--cc-session-id "$cc_session_id" \
			--artifact-kind "$kind" \
			--recorded-at "$recorded_at" \
			>/dev/null 2>&1 \
			|| echo "record tdd-artifact ($kind) failed (non-fatal)" >&2
		;;
	Edit|Write|MultiEdit)
		file_path=$(echo "$hook_json" | jq -r '.tool_input.file_path // .tool_input.path // ""')
		if [ -z "$file_path" ]; then
			exit 0
		fi
		case "$file_path" in
			*.test.ts|*.test.tsx|*.test.js|*.test.jsx|*.spec.ts|*.spec.tsx|*.spec.js|*.spec.jsx)
				kind="test_written"
				;;
			*)
				kind="code_written"
				;;
		esac
		cd "$cwd" && $pm_exec vitest-agent-reporter record tdd-artifact \
			--cc-session-id "$cc_session_id" \
			--artifact-kind "$kind" \
			--file-path "$file_path" \
			--recorded-at "$recorded_at" \
			>/dev/null 2>&1 \
			|| echo "record tdd-artifact ($kind) failed (non-fatal)" >&2
		;;
esac

exit 0
