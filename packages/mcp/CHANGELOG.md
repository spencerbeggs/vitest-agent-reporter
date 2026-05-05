# vitest-agent-mcp

## 2.0.0

### Breaking Changes

* [`b5fb28f`](https://github.com/spencerbeggs/vitest-agent/commit/b5fb28f7e4f656fa48420051d1c97fbbe6e6320c) ### Package and directory renames

- `vitest-agent` (Vitest plugin) renamed to `vitest-agent-plugin`; update your `package.json` dependency and `vitest.config.ts` import accordingly
- `packages/agent/` moved to `packages/plugin/`; `packages/shared/` moved to `packages/sdk/`

### Breaking Changes

* [`8bffd58`](https://github.com/spencerbeggs/vitest-agent/commit/8bffd58be1ab3ea5151e57b4d63eb0196245a4c2) ### Removed `decompose_goal_into_behaviors` MCP tool

Server-side goal-string-splitting is removed. The orchestrator now decomposes via LLM reasoning and creates each entity individually through `tdd_goal_create` and `tdd_behavior_create`. Callers using the old tool will get an unknown-procedure error from the MCP router.

### Features

* [`0a196c0`](https://github.com/spencerbeggs/vitest-agent/commit/0a196c04f78a84eb31d69d09156d014f9433ed73) Introduces the 2.0 MCP server: 41 tools via tRPC, session ID association for `run_tests`, and per-window `currentSessionId` tracking.

- [`b5fb28f`](https://github.com/spencerbeggs/vitest-agent/commit/b5fb28f7e4f656fa48420051d1c97fbbe6e6320c) ### Playground sandbox

* Added `playground/` workspace with intentionally imperfect source (`math`, `strings`, `cache`, `Notebook`) as a live dogfooding target for the TDD orchestrator and MCP tools

- [`8bffd58`](https://github.com/spencerbeggs/vitest-agent/commit/8bffd58be1ab3ea5151e57b4d63eb0196245a4c2) ### Three-tier goal/behavior hierarchy

* [`8bffd58`](https://github.com/spencerbeggs/vitest-agent/commit/8bffd58be1ab3ea5151e57b4d63eb0196245a4c2) ### Removed `decompose_goal_into_behaviors` MCP tool

Server-side goal-string-splitting is removed. The orchestrator now decomposes via LLM reasoning and creates each entity individually through `tdd_goal_create` and `tdd_behavior_create`. Callers using the old tool will get an unknown-procedure error from the MCP router.

`vitest-agent-sdk` defines the new entity tiers. `tdd_session_goals` stores coherent slices of an objective; `tdd_session_behaviors` stores atomic red-green-refactor units under a goal; `tdd_behavior_dependencies` records ordering constraints without JSON-in-TEXT. Status lifecycle is `pending → in_progress → done | abandoned`; deletes are reserved for cleanup of mistakes and `abandoned` is the normal way to drop work.

* [`93e3d14`](https://github.com/spencerbeggs/vitest-agent/commit/93e3d147c3ce750b2c2cd946fe45cbd58d82236c) ### MCP Resources

The MCP server now exposes Vitest documentation and curated patterns as resources:

* `vitest://docs/` — index of the vendored Vitest documentation snapshot
* `vitest://docs/{path}` — any page from the snapshot (e.g., `vitest://docs/api/mock`)
* `vitest-agent://patterns/` — index of the curated patterns library
* `vitest-agent://patterns/{slug}` — a single pattern (3 launch patterns: testing-effect-services-with-mock-layers, testing-effect-schema-definitions, authoring-a-custom-vitest-agent-reporter)

The Vitest documentation snapshot is vendored at `packages/mcp/src/vendor/vitest-docs/` (pinned to a specific upstream tag) and ships via `copyPatterns` in `rslib.config.ts`. Per-page metadata in `manifest.json` (validated against an Effect Schema) drives the per-page `title` and `description` clients see in `resources/list`. Refreshing the snapshot is a guided workflow in the project-local `update-vitest-snapshot` skill at `.claude/skills/update-vitest-snapshot/`, backed by Effect-based maintenance scripts at `packages/mcp/lib/scripts/`.

### Refactoring

* [`8bffd58`](https://github.com/spencerbeggs/vitest-agent/commit/8bffd58be1ab3ea5151e57b4d63eb0196245a4c2) ### Single-statement ordinal allocation

`createGoal` and `createBehavior` allocate ordinals via a single `INSERT ... SELECT COALESCE(MAX(ordinal), -1) + 1 ...` statement so concurrent inserts under one parent never collide without needing `BEGIN IMMEDIATE`.

### Maintenance

* [`93e3d14`](https://github.com/spencerbeggs/vitest-agent/commit/93e3d147c3ce750b2c2cd946fe45cbd58d82236c) New project-local `update-vitest-snapshot` skill at `.claude/skills/update-vitest-snapshot/` driving a 5-phase fetch → prune → scaffold → enrich → validate workflow. Backed by Effect-based scripts at `packages/mcp/lib/scripts/` (`fetch-upstream-docs.ts`, `build-snapshot.ts`, `validate-snapshot.ts`).
* `packages/mcp/src/vendor/` and `packages/mcp/src/patterns/` now live under `src/` and ship via `rslib-builder` `copyPatterns`. The previous postbuild copy script is removed.

### App namespace

* Config file renamed from `vitest-agent-reporter.config.toml` to `vitest-agent.config.toml`
* XDG data directory changed from `~/.local/share/vitest-agent-reporter/` to `~/.local/share/vitest-agent/`; existing databases are not migrated automatically
* `VitestAgentReporterConfig` renamed to `VitestAgentConfig`; `VitestAgentReporterConfigFile` renamed to `VitestAgentConfigFile`
* Effect `Context.Tag` keys updated from `"vitest-agent-reporter/*"` to `"vitest-agent/*"`

### AgentPlugin options

* The `reporter` field in `AgentPlugin({})` is now typed as a factory function only; pass coverage thresholds and other config bag options under `reporterOptions` instead

### `tdd_phase_transition_request` requires `goalId` and an explicit `red` phase

The input schema gains a required `goalId: number`. Existing callers that pass only `tddSessionId`, `requestedPhase`, and `citedArtifactId` will fail validation. Pass the parent goal's id alongside; the tool now also pre-validates that the goal status is `in_progress` and that any cited `behaviorId` belongs to the named goal.

Additionally, transitions to `green` are now rejected unless the current phase is `red`, `red.triangulate`, or `green.fake-it`. Callers that previously relied on `spike→green` or `refactor→green` "free transitions" will receive a `wrong_source_phase` denial with a remediation hint pointing at `requestedPhase: "red"`. The `red` phase must now be an explicit named DB row in every TDD cycle.

### Reshaped `tdd_session_behaviors` schema

The behaviors table no longer has `parent_tdd_session_id`, `child_tdd_session_id`, or `depends_on_behavior_ids`. It now references the new `tdd_session_goals` table via `goal_id NOT NULL`, with dependencies stored in a separate `tdd_behavior_dependencies` junction table. `tdd_phases.behavior_id` cascade changed from `SET NULL` to `CASCADE`. `tdd_artifacts` gains a `behavior_id` column for behavior-scoped queries. Pre-2.0 dev databases must be wiped on first pull (the migration ledger has no content hash, so editing `0002_comprehensive` in place does not auto-replay).

### Removed `writeTddSessionBehaviors` from DataStore

The batch behavior-insert path is gone alongside the tool that drove it. Use `createBehavior` per behavior instead.

### 10 new MCP CRUD tools

* `tdd_goal_create` (idempotent on `(sessionId, goal)`), `tdd_goal_get`, `tdd_goal_update`, `tdd_goal_delete`, `tdd_goal_list`.
* `tdd_behavior_create` (idempotent on `(goalId, behavior)`), `tdd_behavior_get`, `tdd_behavior_update`, `tdd_behavior_delete`, `tdd_behavior_list` (discriminated input: `{ scope: "goal" | "session", ... }`).
* Read tools return the full nested shape (goals with nested behaviors; behaviors with parentGoal summary and dependency list) so an agent can analyze a session in one round trip.
* Errors return as `{ ok: false, error: { _tag, ..., remediation } }` success-shape envelopes — never tRPC error envelopes.

### Tagged error API for goal/behavior CRUD

`vitest-agent-sdk` exports `GoalNotFoundError`, `BehaviorNotFoundError`, `TddSessionNotFoundError`, `TddSessionAlreadyEndedError`, and `IllegalStatusTransitionError`. Each carries a derived message and is surfaced through the MCP envelope shape with a remediation hint pointing the caller at the right recovery tool.

### `tdd_session_get` renders Goals and Behaviors

When a session has `tdd_session_goals` and `tdd_session_behaviors` rows, `tdd_session_get` now renders a `## Goals and Behaviors` section beneath Phases and Artifacts. Each goal is listed with its 1-based ordinal and text; each behavior is nested under its parent goal with its current status.

### Auto-promote behavior status on phase transition

When `tdd_phase_transition_request` accepts a transition with a `behaviorId` and the behavior is currently `pending`, the server auto-promotes it to `in_progress`. Callers do not need a separate `tdd_behavior_update` for the start-of-cycle transition; only the final `done` transition.

### `ChannelEvent` schema union

`vitest-agent-sdk` defines a typed union over the 13 orchestrator → main-agent progress events: `goals_ready`, `goal_added`, `goal_started`, `goal_completed` (with `behaviorIds[]` for order-independent rendering), `goal_abandoned`, `behaviors_ready`, `behavior_added`, `behavior_started`, `phase_transition`, `behavior_completed`, `behavior_abandoned`, `blocked`, and `session_complete` (with `goalIds[]`). `tdd_progress_push` validates payloads against this union and resolves `goalId` / `sessionId` server-side from `behaviorId` for behavior-scoped events so a stale orchestrator context cannot push the wrong tree coordinates.

### Orchestrator restricted-tools hook

`vitest-agent-plugin` ships `pre-tool-use-tdd-restricted.sh`, a PreToolUse hook scoped to the TDD orchestrator subagent that denies `tdd_goal_delete`, `tdd_behavior_delete`, and `tdd_artifact_record` with a remediation hint pointing at `status: 'abandoned'`. Defense-in-depth — the orchestrator's `tools[]` frontmatter is a soft enumeration; the hook is the runtime gate. Delete tools are also intentionally omitted from the auto-allow list so main-agent calls require explicit user confirmation before a cascade.

### Three-tier task list rendering

The main-agent skill (`plugin/skills/tdd/SKILL.md`) takes ownership of channel-event handling and renders the goal+behavior hierarchy flat with `[G<n>.B<m>]` label encoding (Claude Code's `TaskCreate` does not nest cleanly past one parent). Goals appear as marker tasks (`--- Goal N done ---`) inserted between behavior groups. `goal_completed` and `session_complete` carry reconciliation arrays so the renderer is order-independent against dropped intermediate events.

### Status validation in DataStore boundary

Goal and behavior status transitions are validated at the DataStore service tag (typed `IllegalStatusTransitionError`) rather than via SQL triggers. Triggers would surface as raw `SqlError`, defeating the "errors are typed and carry remediation" design principle.

### MCP Prompts

The MCP server now exposes six framing-only prompts:

* `triage` — orient toward a failure-triage workflow
* `why-flaky` — diagnose a named flaky test
* `regression-since-pass` — find the change that broke a test
* `explain-failure` — synthesize a root cause from a failure signature's recurrence history
* `tdd-resume` — resume the active TDD session from its current phase
* `wrapup` — generate the same content the post-hooks emit automatically

Each prompt is a small templated message that orients the agent toward the right tools — no tool data is pre-fetched on the server.

### Patch Changes

| Dependency       | Type       | Action  | From  | To    |
| ---------------- | ---------- | ------- | ----- | ----- |
| vitest-agent-sdk | dependency | updated | 1.3.1 | 2.0.0 |
