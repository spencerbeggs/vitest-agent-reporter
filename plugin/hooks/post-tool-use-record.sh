#!/bin/bash
# Records a tool_result turn for PostToolUse. For Edit/Write/MultiEdit
# additionally emits a file_edit turn so file_edit_history is queryable.
set -e

# shellcheck source=lib/hook-output.sh
. "$(dirname "$0")/lib/hook-output.sh"

hook_json=$(cat)

cc_session_id=$(jq -r '.session_id // ""' <<< "$hook_json")
cwd=$(jq -r '.cwd // ""' <<< "$hook_json")
tool_name=$(jq -r '.tool_name // ""' <<< "$hook_json")
tool_use_id=$(jq -r '.tool_use_id // ""' <<< "$hook_json")
success=$(jq -r '
	(try .tool_response.success catch null)
	| if . == null then "true" elif . == true then "true" else "false" end
' <<< "$hook_json")

if [ -z "$cc_session_id" ] || [ -z "$cwd" ] || [ -z "$tool_name" ]; then
	emit_noop
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$cwd")

# 1. Always emit a tool_result turn.
result_payload=$(jq -nc \
	--arg tn "$tool_name" \
	--arg tuid "$tool_use_id" \
	--argjson ok "$success" \
	'{type: "tool_result", tool_name: $tn, success: $ok} + (if $tuid != "" then {tool_use_id: $tuid} else {} end)')

cd "$cwd" >/dev/null && $pm_exec vitest-agent-reporter record turn \
	--cc-session-id "$cc_session_id" \
	"$result_payload" \
	>/dev/null 2>&1 \
	|| true

# 2. For Edit/Write/MultiEdit, additionally emit a file_edit turn.
case "$tool_name" in
	Edit|Write|MultiEdit)
		file_path=$(jq -r '.tool_input.file_path // .tool_input.path // ""' <<< "$hook_json")
		if [ -z "$file_path" ]; then
			emit_noop
			exit 0
		fi
		case "$tool_name" in
			Edit)      edit_kind="edit" ;;
			Write)     edit_kind="write" ;;
			MultiEdit) edit_kind="multi_edit" ;;
		esac
		edit_payload=$(jq -nc \
			--arg fp "$file_path" \
			--arg ek "$edit_kind" \
			'{type: "file_edit", file_path: $fp, edit_kind: $ek}')
		cd "$cwd" >/dev/null && $pm_exec vitest-agent-reporter record turn \
			--cc-session-id "$cc_session_id" \
			"$edit_payload" \
			>/dev/null 2>&1 \
			|| true
		;;
esac

emit_noop
exit 0
