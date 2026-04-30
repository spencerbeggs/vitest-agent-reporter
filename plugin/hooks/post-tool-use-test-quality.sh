#!/bin/bash
# PostToolUse hook on Edit/Write/MultiEdit to test files
# (matcher: agent_type=tdd-orchestrator).
#
# Detects escape-hatch tokens in the new file content and records a
# tdd_artifacts(kind='test_weakened') when they appear. Specifically
# matches anti-patterns 2 and 8 from the spec's "5+3" set:
#   - it.skip / it.todo / it.fails / it.concurrent
#   - test.skip / test.todo / test.fails
#   - describe.skip / describe.todo
#   - .skipIf / .todoIf  (Vitest-specific dynamic skips)
#
# Snapshot mutations are caught by the W2 restricted PreToolUse hook
# (which blocks .snap edits outright); this hook handles the runtime
# escape-hatch tokens.

set -e

read -r hook_json

agent_type=$(echo "$hook_json" | jq -r '.agent_type // ""')
if [ "$agent_type" != "tdd-orchestrator" ]; then
	exit 0
fi

tool_name=$(echo "$hook_json" | jq -r '.tool_name // ""')
case "$tool_name" in
	Edit|Write|MultiEdit) ;;
	*) exit 0 ;;
esac

file_path=$(echo "$hook_json" | jq -r '.tool_input.file_path // .tool_input.path // ""')
case "$file_path" in
	*.test.ts|*.test.tsx|*.test.js|*.test.jsx|*.spec.ts|*.spec.tsx|*.spec.js|*.spec.jsx) ;;
	*) exit 0 ;;
esac

cc_session_id=$(echo "$hook_json" | jq -r '.session_id // ""')
cwd=$(echo "$hook_json" | jq -r '.cwd // ""')
if [ -z "$cc_session_id" ] || [ -z "$cwd" ]; then
	exit 0
fi

# Capture the new content from any of the Edit / Write / MultiEdit shapes.
new_content=$(echo "$hook_json" | jq -r '.tool_input.content // .tool_input.new_string // ""')
if [ -z "$new_content" ]; then
	# MultiEdit: scan the joined new strings.
	new_content=$(echo "$hook_json" | jq -r '[.tool_input.edits[]?.new_string // empty] | join("\n")')
fi

# Anti-pattern token scan.
weakened_patterns=(
	'\bit\.skip\b'
	'\bit\.todo\b'
	'\bit\.fails\b'
	'\bit\.concurrent\b'
	'\btest\.skip\b'
	'\btest\.todo\b'
	'\btest\.fails\b'
	'\bdescribe\.skip\b'
	'\bdescribe\.todo\b'
	'\.skipIf\('
	'\.todoIf\('
)

matched=""
for pattern in "${weakened_patterns[@]}"; do
	if echo "$new_content" | grep -E -q "$pattern"; then
		matched="$pattern"
		break
	fi
done

if [ -z "$matched" ]; then
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

recorded_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
diff_excerpt=$(echo "$new_content" | head -c 4096)

cd "$cwd" && $pm_exec vitest-agent-reporter record tdd-artifact \
	--cc-session-id "$cc_session_id" \
	--artifact-kind "test_weakened" \
	--file-path "$file_path" \
	--diff-excerpt "$diff_excerpt" \
	--recorded-at "$recorded_at" \
	>/dev/null 2>&1 \
	|| echo "record tdd-artifact (test_weakened) failed (non-fatal)" >&2

# Emit a soft warning back to the orchestrator's transcript.
echo "WARNING: detected weakening token $matched in $file_path — recorded as tdd_artifacts(kind='test_weakened')" >&2

exit 0
