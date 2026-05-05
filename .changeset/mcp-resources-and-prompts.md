---
"vitest-agent-mcp": minor
"vitest-agent-plugin": minor
---

## Features

### MCP Resources

The MCP server now exposes Vitest documentation and curated patterns as resources:

- `vitest://docs/` — index of the vendored Vitest documentation snapshot
- `vitest://docs/{path}` — any page from the snapshot (e.g., `vitest://docs/api/mock`)
- `vitest-agent://patterns/` — index of the curated patterns library
- `vitest-agent://patterns/{slug}` — a single pattern (3 launch patterns: testing-effect-services-with-mock-layers, testing-effect-schema-definitions, authoring-a-custom-vitest-agent-reporter)

The Vitest documentation snapshot is vendored at `packages/mcp/src/vendor/vitest-docs/` (pinned to a specific upstream tag) and ships via `copyPatterns` in `rslib.config.ts`. Per-page metadata in `manifest.json` (validated against an Effect Schema) drives the per-page `title` and `description` clients see in `resources/list`. Refreshing the snapshot is a guided workflow in the project-local `update-vitest-snapshot` skill at `.claude/skills/update-vitest-snapshot/`, backed by Effect-based maintenance scripts at `packages/mcp/lib/scripts/`.

### MCP Prompts

The MCP server now exposes six framing-only prompts:

- `triage` — orient toward a failure-triage workflow
- `why-flaky` — diagnose a named flaky test
- `regression-since-pass` — find the change that broke a test
- `explain-failure` — synthesize a root cause from a failure signature's recurrence history
- `tdd-resume` — resume the active TDD session from its current phase
- `wrapup` — generate the same content the post-hooks emit automatically

Each prompt is a small templated message that orients the agent toward the right tools — no tool data is pre-fetched on the server.

## Maintenance

- New project-local `update-vitest-snapshot` skill at `.claude/skills/update-vitest-snapshot/` driving a 5-phase fetch → prune → scaffold → enrich → validate workflow. Backed by Effect-based scripts at `packages/mcp/lib/scripts/` (`fetch-upstream-docs.ts`, `build-snapshot.ts`, `validate-snapshot.ts`).
- `packages/mcp/src/vendor/` and `packages/mcp/src/patterns/` now live under `src/` and ship via `rslib-builder` `copyPatterns`. The previous postbuild copy script is removed.
