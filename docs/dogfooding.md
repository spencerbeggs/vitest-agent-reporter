# Dogfooding

Contributor guide to the dogfood workflow. The vitest-agent package family is built around a TDD orchestrator subagent and a stack of MCP tools, hooks and skills. Dogfooding is how we exercise that system on ourselves — we point the orchestrator at intentional defects in the `playground/` workspace and audit how the system behaves while it works.

This doc is for people working on the vitest-agent monorepo. If you are a consumer of the published packages, you can stop reading here.

## What you are testing

Dogfood sessions test the *system*, not the orchestrator's ability to fix a bug. The bug fix is the cover story. What we are actually checking varies per session and might include any of:

- Whether the orchestrator picks the right MCP tool for a job (or falls back to Bash)
- Whether channel events arrive with `goalId` and `sessionId` resolved correctly
- Whether anti-pattern hooks fire when the orchestrator weakens a test
- Whether `tdd_phase_transition_request` denials surface the right remediation
- Whether the database tracks evidence binding the way we think it does

The aspect under test goes in the handoff prompt's `what_were_testing` field — visible to the main agent (you), invisible to the orchestrator subagent.

## The flow

```text
1. Start or continue a chain     →  /dogfood --start
                                 →  /dogfood --from <path>
2. Dispatch the orchestrator     →  blind to the meta-goal
3. Audit when it returns         →  seven-step verification
4. Decide what to do next        →  four-option menu
```

A chain groups related handoffs that test one aspect of the system. Each handoff is one experiment. After the orchestrator returns, you log findings and decide whether to fix the system inline, write the next handoff and reboot, leave a note for later or close the chain.

## Quick start

In a Claude Code session in this repo:

```text
/dogfood --start
```

The agent will look at the recent conversation, propose a chain slug and a sanitized task prompt, and ask you to confirm before writing any files. If your conversation has not given the agent enough to go on, it will ask what aspect of the system you want to test.

To continue a chain after a reboot:

```text
/dogfood --from docs/superpowers/dogfood/<chain>/02-<title>.md
```

To see what is open right now:

```text
/dogfood
```

## Folder layout

```text
docs/superpowers/dogfood/
  <chain-slug>/
    findings.md           # rolling notes for the whole chain
    01-<title>.md         # first handoff
    02-<title>.md         # next handoff after a reboot
    03-<title>.md
```

Each handoff is self-contained but carries a `prev_handoff` field so a new agent can walk backward through the chain's history. `findings.md` is the cross-handoff accumulator: what worked, what broke, what was attempted, what is still open.

## The cheatsheet

`.claude/playground-cheatsheet.md` is the answer key for the intentional defects in `playground/`. The main agent uses it to verify the orchestrator's work. **It is invisible to the orchestrator** — never reference its path in a dispatch prompt, a commit message visible to the orchestrator or a comment in the playground source. If you add new intentional defects, document them in the cheatsheet.

## Iron law

The orchestrator subagent does not know it is being tested. It receives the `## Task for the TDD orchestrator` section of the handoff and nothing else. No "be thorough" hints, no "watch for X" prompts, no extra reporting asks unless the meta-goal genuinely requires structured output as part of the task.

## Fixes during a session

Different changes need different reboot actions. The skill at `.claude/skills/dogfood/SKILL.md` carries the full table; the abridged version:

| Change | What it takes |
| --- | --- |
| `.sh` hook script body | Effective on the next call, no rebuild |
| Skill, agent or command markdown | Effective on the next subagent dispatch |
| MCP server or SDK code | `pnpm ci:build` then `/reload-plugins` |
| `hooks.json` registration | Full Claude Code restart |
| `plugin.json` manifest | Full Claude Code restart |

When the change needs a full restart, write the next handoff before exiting so the new session has somewhere to pick up.

## When you are done

Flip the latest handoff's `status` to `closed`, append a final summary block to `findings.md` and tell the agent the chain is complete. The chain folder is ephemeral working state — once you have absorbed the findings and any system fixes have landed, delete the folder.

## Where the rules live

The canonical procedure is `.claude/skills/dogfood/SKILL.md`. The skill carries the seven-step verification checklist, the full reboot table, the four-option findings menu and the rationalization counters. The agent reads it on every `/dogfood` invocation; you do not have to.

If you are extending the dogfood system itself (new event types, new verification steps, new playground defects), the skill and the cheatsheet are what you change. Keep them in sync.
