#!/bin/bash
# Shared helper for TDD-scoped hooks. Returns 0 if the supplied
# agent_type value identifies the tdd-task subagent, else 1.
#
# Claude Code emits `.agent_type` in plugin-prefixed form
# `plugin:<plugin-name>:<agent-name>` for plugin-bundled subagents, so
# our agent (declared as `name: tdd-task` in the vitest-agent plugin)
# shows up as `"plugin:vitest-agent:tdd-task"`. We also accept the bare
# `"tdd-task"` slug for resilience if the agent is invoked from a
# non-plugin context.

is_tdd_agent() {
	case "$1" in
		"plugin:vitest-agent:tdd-task") return 0 ;;
		"vitest-agent:tdd-task") return 0 ;;
		"tdd-task") return 0 ;;
		*) return 1 ;;
	esac
}
