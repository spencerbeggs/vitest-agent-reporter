#!/bin/bash
# Shared helper for TDD-scoped hooks. Returns 0 if the supplied
# agent_type value identifies the TDD orchestrator subagent, else 1.
#
# Empirically, Claude Code emits `.agent_type` in plugin-prefixed form
# `<plugin-name>:<agent name field>` for plugin-bundled subagents, so
# our orchestrator (declared as `name: TDD Orchestrator` in the
# vitest-agent-reporter plugin) shows up as
# `"vitest-agent-reporter:TDD Orchestrator"`. We also accept the bare
# `"TDD Orchestrator"` and the legacy `"tdd-orchestrator"` slug for
# resilience if Claude Code changes the prefix scheme or if the agent
# is invoked from a non-plugin context.

is_tdd_orchestrator() {
	case "$1" in
		"vitest-agent-reporter:TDD Orchestrator") return 0 ;;
		"TDD Orchestrator") return 0 ;;
		"tdd-orchestrator") return 0 ;;
		*) return 1 ;;
	esac
}
