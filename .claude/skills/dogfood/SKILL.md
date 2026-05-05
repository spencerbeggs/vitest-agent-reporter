---
name: dogfood
description: Use when starting a dogfood session for the vitest-agent plugin in this repo, when continuing one from an existing handoff at docs/superpowers/dogfood/<chain>/, or after the TDD orchestrator subagent completes a dogfood task. Repo-internal — does not apply to projects that consume vitest-agent as a dependency.
argument-hint: [--start | --from <path>]
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Glob Grep
---

# Dogfood

You are the **main agent** running a dogfood session in the vitest-agent repo. The TDD orchestrator subagent is the system under test. The `playground/` workspace is the live target; intentional defects there are the fodder. Your job is to dispatch the orchestrator, observe it, audit the result against the meta-goal, and leave a paper trail.

## Current dogfood state

Open chains and their latest entries:

!`find docs/superpowers/dogfood -mindepth 2 -name "0*.md" -not -path "*_baseline*" 2>/dev/null | sort | tail -20`

Open-status handoffs (anything you should pick up):

!`grep -l "^status: open" docs/superpowers/dogfood/*/*.md 2>/dev/null | grep -v _baseline || echo "(none)"`

## Iron law: the orchestrator does not know it is being tested

The orchestrator subagent receives the **task prompt only**. Never:

- Pass it the handoff file path or its `what_were_testing` frontmatter
- Add hints like "be thorough" or "watch for X" that telegraph the meta-goal
- Reference `.claude/playground-cheatsheet.md` (the answer key) in any orchestrator-visible artifact
- Ask the orchestrator to "report extra info" unless the handoff explicitly requested it

The cheatsheet at `.claude/playground-cheatsheet.md` is yours; do not surface its existence in any prompt or commit message visible to the orchestrator.

## Argument routing

Parse `$ARGUMENTS`:

- **No args** → show the current state above and the four-option menu. If there are open handoffs, suggest `/dogfood --from <path>` for the most recent.
- **`--start`** → new chain. See "Starting a chain" below.
- **`--from <path>`** → continue from a specific handoff after a reboot. See "Continuing from a handoff" below.

## Starting a chain (`--start`)

1. Look at the most recent conversation. What was the user discussing? What aspect of the system are they curious about (orchestrator behavior, channel events, hook denial, MCP tool surface)?
2. **Propose a chain in chat first; do not write any files.** Output a draft with: a chain slug (kebab-case), a `what_were_testing` line stating the system aspect under observation, and a sanitized orchestrator task prompt that describes a playground-level problem without revealing the meta-goal.
3. **Ask the user to confirm or edit.** If the recent conversation is ambiguous (e.g. they typed `/dogfood --start` cold), ask: "What aspect of the orchestrator or the dogfood system do you want to test?" and offer 2-3 candidates from the cheatsheet's intentional defects.
4. Once the user confirms, write the first handoff at `docs/superpowers/dogfood/<chain-slug>/01-<title-slug>.md` using the template at `${CLAUDE_SKILL_DIR}/handoff-template.md`. Write `findings.md` in the same folder using the template at `${CLAUDE_SKILL_DIR}/findings-template.md`.
5. Dispatch the orchestrator (see "Dispatching" below).

## Continuing from a handoff (`--from <path>`)

1. Read the handoff. Walk backward through `prev_handoff` to read the chain's full history before acting.
2. Read `findings.md` in the same folder.
3. Read `.claude/playground-cheatsheet.md` so you have the answer key for the verification phase.
4. Dispatch the orchestrator.

## Dispatching

Use the Task tool with `subagent_type: "vitest-agent:TDD Orchestrator"`. The dispatch prompt contains **only** the contents of the handoff's `# Task for the TDD orchestrator` section — never the frontmatter, never the `# What the orchestrator MUST NOT know` section, never the verification checklist, never the cheatsheet.

Capture the dispatched session id immediately:

```text
mcp__plugin_vitest-agent_mcp__tdd_session_resume(latest_open)
```

or query `session_list` for the most recently created subagent session.

## Verification (after orchestrator completes)

Run the seven-step audit. Skipping any step defeats the experiment.

1. `tdd_session_get(<id>)` — full goal+behavior tree, phase ledger. Every transition has a cited artifact, no skipped phases, no backdated rows.
2. `acceptance_metrics({})` — phase-evidence integrity, hook responsiveness, anti-pattern detection rate.
3. `test_history({ project: "playground" })` — flaky / new-failure / persistent classifications.
4. `turn_search({ ccSessionId: <subagent cc id>, type: "tool_call" })` and grep for Bash `vitest` invocations — confirm the orchestrator used `run_tests` MCP, not Bash workarounds.
5. `failure_signature_get` for any signatures the run produced — cross-check against past dogfood runs in the chain.
6. `git diff playground/` and `git status` — code change matches what the cheatsheet says is the right fix; no unintended files outside `playground/`; no untracked files left behind.
7. `hypothesis_list({ sessionId: <subagent cc id> })` — the orchestrator recorded hypotheses before non-test edits (Gate 2).

For channel-event work, additionally inspect `tdd_progress_push` payloads in the turn log: `goalId` and `sessionId` resolved server-side correctly, `goal_completed` carried `behaviorIds[]`, `session_complete` carried `goalIds[]`.

## Findings + four-option menu

Append a new entry to `findings.md` covering: what worked, what broke, what was attempted, what's still open. Then present the user with four options. Pick the one that fits; do not invent a fifth.

| Option | When | Action |
| --- | --- | --- |
| **1. Local fix + retask** | Context fresh, change is .sh / skill / agent-md only | Revert `git checkout playground/`. Edit core. If MCP code, `pnpm ci:build` then `/reload-plugins`. Append `## System changes` to current handoff. Dispatch a fresh orchestrator on the same task. |
| **2. Reboot + new handoff** | Context heavy, OR the change touches `hooks.json` (needs full Claude Code restart), OR the next experiment needs a clean slate | Make the system change. Write the next handoff at `<chain>/NN-<title>.md` with `prev_handoff` set. Tell the user to restart and run `/dogfood --from <new path>`. |
| **3. Update tracking** | Findings are partial; we'll come back later | Update `findings.md` with the open question. Leave handoff `status: open`. Tell the user where the chain is and that nothing else is needed right now. |
| **4. Confirm complete** | The meta-goal is answered; system either works or the bug is documented | Flip latest handoff `status: closed`. Append a final summary to `findings.md`. Tell the user the chain is done and they can delete the folder when ready. |

## Reboot levels (canonical reference)

| Change | Action needed |
| --- | --- |
| `.sh` hook script body | Takes effect on next call. No rebuild. |
| Skill / agent / command markdown | Takes effect on next subagent dispatch. No rebuild. |
| Plugin allowlist (`safe-mcp-vitest-agent-ops.txt`) | Takes effect on next tool call. No rebuild. |
| MCP server / SDK code | `pnpm ci:build` + `/reload-plugins`. |
| Database schema / migration | `pnpm ci:build` + delete `$XDG_DATA_HOME/vitest-agent/<key>/data.db` + `/reload-plugins`. |
| `hooks.json` registration (new matcher, new hook entry) | **Full Claude Code restart.** `/reload-plugins` is not enough. |
| `plugin.json` manifest | **Full Claude Code restart.** |

When in doubt, reboot. The cost of a wrong-positive reboot is low; the cost of a wrong-negative ("`/reload-plugins` probably picks it up") is observing broken behavior on a shrinking context.

## Common rationalizations (verbatim near-misses, plug them when they appear)

| If you think... | Reality |
| --- | --- |
| "I'll just add 'watch for X' to the orchestrator prompt as a helpful nudge" | That leaks the experiment. The orchestrator's behavior under uncontaminated conditions is what we're measuring. |
| "I'll just pick the most recent chain and start" | That's guessing at user intent. Ask. |
| "Orchestrator said complete and 14/14 pass — probably fine, I can spot-check" | The test passing is the least-interesting outcome. The dogfood is about how it got there. Run all seven verification steps. |
| "/reload-plugins probably picks up hooks.json too, the docs are being conservative" | Wishful reading of an explicit rule. `hooks.json` needs a full restart. |
| "Typo in core is trivial, just fix it without writing it down" | Friction in the system is exactly what dogfood exists to surface. Append it to `findings.md`. |
| "findings.md is the user's to update, not mine" | You are the agent running the session. Logging is your job. |
| "I'll save context by skipping the handoff write" | The next agent reads the chain to know what was tried. Skipping writes makes future work redundant. |

## Quick reference

- Chain folder: `docs/superpowers/dogfood/<chain-slug>/`
- Handoff: `<chain>/NN-<title>.md` (frontmatter has `chain`, `chain_index`, `title`, `status`, `created`, `parent_session`, `prev_handoff`, `what_were_testing`)
- Findings: `<chain>/findings.md`
- Cheatsheet (yours, never shared): `.claude/playground-cheatsheet.md`
- Templates: `${CLAUDE_SKILL_DIR}/handoff-template.md`, `${CLAUDE_SKILL_DIR}/findings-template.md`
- Build/reload: `pnpm ci:build`, `/reload-plugins`, full Claude Code restart
- Key MCP tools: `tdd_session_get`, `acceptance_metrics`, `test_history`, `turn_search`, `failure_signature_get`, `hypothesis_list`
