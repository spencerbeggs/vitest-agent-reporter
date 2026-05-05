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

The Vitest documentation snapshot is vendored at a pinned tag and refreshed via the new `pnpm run update-vitest-snapshot` script in the MCP package or the `update-vitest-snapshot` Claude Code skill.

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

- New `update-vitest-snapshot` skill in the Claude Code plugin for bumping the vendored snapshot.
