---
"vitest-agent-reporter-shared": minor
"vitest-agent-reporter": minor
"vitest-agent-reporter-cli": minor
"vitest-agent-reporter-mcp": minor
---

## Bug Fixes

### `run_tests` JSON output no longer renders stack traces as `[object Object]`

`buildAgentReport`'s `mapErrors` joined Vitest stack frames with `.join("\n")`, but Vitest 4's `TestError.stacks` is `ParsedStack[]` (objects with `method` / `file` / `line` / `column`) — not the `string[]` the duck-type interface assumed. Each frame stringified to `[object Object]`, which surfaced in `run_tests({ format: "json" })` output as a literal `"stack": "[object Object]"` field.

Stack frames are now formatted as `at <method> (<file>:<line>:<column>)` per frame before joining; an empty `method` falls back to `<anonymous>`. Plain string frames pass through unchanged so the existing `coerceErrors` path in `run-tests.ts` (which wraps `err.stack` into `[err.stack]`) keeps working.

### TDD orchestrator subagent could not call any MCP tool

The orchestrator's `tools:` array referenced names of the form `mcp__vitest-agent-reporter__<tool>`, but plugin-loaded MCP tools surface to subagents under the verbose `mcp__plugin_vitest-agent-reporter_vitest-reporter__<tool>` namespace. None of the orchestrator's MCP entries matched, so the subagent received only `Read` / `Write` / `Edit` / `Bash` and could not call `tdd_session_start`, `tdd_phase_transition_request`, `run_tests`, or any of its declared MCP tools — leaving the W2 / W6 evidence-binding workflow unreachable.

Updated all 14 MCP tool entries in `plugin/agents/tdd-orchestrator.md` to use the verbose namespace that matches what Claude Code actually surfaces.

### TDD-scoped plugin hooks now match Claude Code's `agent_type` field

Per Claude Code's hook docs, the `agent_type` field in PostToolUse / SubagentStart / SubagentStop envelopes equals the agent's `name:` frontmatter — for our orchestrator, `"TDD Orchestrator"`. The five TDD-scoped hooks (`subagent-start-tdd.sh`, `subagent-stop-tdd.sh`, `pre-tool-use-bash-tdd.sh`, `post-tool-use-tdd-artifact.sh`, `post-tool-use-test-quality.sh`) gated on `agent_type == "tdd-orchestrator"` (the orchestrator's custom `agent_type:` frontmatter), which Claude Code silently ignores for plugin subagents. The gate never matched: no SubagentStart row was written, no Bash anti-patterns were blocked, no `tdd_artifacts` rows were ever recorded.

Extracted a shared `lib/match-tdd-agent.sh` helper that accepts both `"TDD Orchestrator"` and the legacy `"tdd-orchestrator"` slug, and updated all five hooks to use it. The legacy slug is kept as a fallback in case a future Claude Code runtime change starts propagating the custom `agent_type:` frontmatter.

## Other

### Added a `subtract` function to the basic example

`examples/basic/src/math.ts` now exports `subtract(a, b)` alongside `add`, `multiply`, and `fibonacci`, with a matching test. The function was added by walking the TDD orchestrator subagent through a real red → green cycle as part of dogfooding the orchestrator.
