#!/bin/bash
# SessionStart hook: orientation triage injection + sessions row write.
#
# Per Decision D1, the orientation triage report is injected here via
# additionalContext. The sessions row is written with
# triage_was_non_empty so acceptance metric #3 is queryable.

set -euo pipefail

# shellcheck source=lib/hook-output.sh
. "$(dirname "$0")/lib/hook-output.sh"

# Read and discard the JSON envelope to avoid broken-pipe; we re-read
# session_id and cwd below.
hook_json=$(cat)

cc_session_id=$(jq -r '.session_id // ""' <<< "$hook_json")
cwd=$(jq -r '.cwd // ""' <<< "$hook_json")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$cwd}"

if [ -z "$cc_session_id" ] || [ -z "$PROJECT_DIR" ]; then
	# Nothing to inject and no session to record.
	emit_noop
	exit 0
fi

# shellcheck source=lib/detect-pm.sh
. "$(dirname "$0")/lib/detect-pm.sh"
pm_exec=$(detect_pm_exec "$PROJECT_DIR")

# 1. Generate the triage brief.
triage_md=$(cd "$PROJECT_DIR" && $pm_exec vitest-agent triage --format markdown 2>/dev/null || echo "")

# 2. Compute the triage_was_non_empty flag.
if [ -n "$triage_md" ]; then
	triage_flag="--triage-was-non-empty"
else
	triage_flag=""
fi

# 3. Write the sessions row.
project=$(jq -r '.name // "unknown"' < "$PROJECT_DIR/package.json" 2>/dev/null || echo "unknown")
started_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cd "$PROJECT_DIR" >/dev/null && $pm_exec vitest-agent record session-start \
	--cc-session-id "$cc_session_id" \
	--project "$project" \
	--cwd "$PROJECT_DIR" \
	--agent-kind main \
	--started-at "$started_at" \
	$triage_flag \
	>/dev/null 2>&1 \
	|| true

# 4. Build the additionalContext markdown.
#
# An imperative preamble is ALWAYS injected — both to push the main agent
# toward the MCP tool surface (rather than re-running raw vitest via Bash)
# and to advertise the TDD orchestrator subagent as a delegate for any
# work that fits the red/green/refactor loop. The triage brief (or the
# empty-state fallback) is appended below the preamble so the agent reads
# the directives first and the situational context after.
preamble="<EXTREMELY_IMPORTANT>
<vitest_agent_reporter>

This project ships with the vitest-agent MCP server. **Always prefer the \`mcp__vitest-agent_mcp__*\` tools over invoking \`vitest\` directly via Bash.** Every reporter run persists test results, errors, coverage, history, and turn data to a SQLite database, so the MCP query surface (\`test_status\`, \`test_overview\`, \`test_errors\`, \`test_history\`, \`test_coverage\`, \`failure_signature_get\`, \`turn_search\`, \`commit_changes\`, etc.) is the authoritative view of project state. Re-running \`vitest\` via Bash bypasses persistence and the post-tool-use hooks that record TDD artifacts, classifications, and failure signatures. Use \`run_tests\` for execution, \`help\` for the full tool list.

**A specialized TDD Orchestrator subagent is available.** It enforces a strict red → green → refactor loop with evidence-bound phase transitions, per-cycle commits, hypothesis recording before any production-code edit, and anti-pattern detection (skipped tests, snapshot mutation, threshold downgrades, etc.). When the user asks for a feature, bug fix, or behavior change that is testable against this codebase's vitest suite, **delegate to the TDD Orchestrator via the \`/tdd <goal>\` slash command (or by invoking the \`tdd-orchestrator\` agent through the Task tool) instead of writing tests and code yourself.** Reserve direct work for: pure refactors with no behavioral change, exploratory spikes the user explicitly flags as throwaway, and non-code tasks (docs, configuration, dependency bumps).

If the user's request is ambiguous about whether it warrants TDD, ask once before delegating; do not silently bypass the orchestrator on testable work.

**This conversation's session id is \`$cc_session_id\`.** As your first MCP tool call, run \`mcp__vitest-agent_mcp__set_current_session_id({ id: \"$cc_session_id\" })\` so the MCP server's session-aware tools default to this id. (If the server was already seeded by the plugin manifest, the call is a harmless no-op.)

</vitest_agent_reporter>

<vitest_resources>
MCP resources are available: \`vitest://docs/\` (Vitest upstream docs snapshot) and \`vitest-agent://patterns/\` (curated project patterns). Use \`ListMcpResourcesTool\` to explore, \`ReadMcpResourceTool\` to fetch pages — always load an index URI first. Six user-facing prompts are exposed as slash commands: \`/plugin:vitest-agent:mcp:triage\`, \`why-flaky\`, \`regression-since-pass\`, \`explain-failure\`, \`tdd-resume\`, \`wrapup\`. Load the \`vitest-context\` skill for the full navigation guide.
</vitest_resources>
</EXTREMELY_IMPORTANT>"

#    Prefer triage when non-empty; fall back to the empty-state message.
if [ -n "$triage_md" ]; then
	context="$preamble

$triage_md"
else
	context="$preamble

_No orientation signal yet (no failing tests, flaky tests, or open TDD sessions). Run \`run_tests({})\` to populate the database, or call \`help\` to see the full tool list._"
fi

# 5. Emit the hookSpecificOutput JSON for Claude Code to inject.
emit_additional_context "SessionStart" "$context"
