---
name: vitest-context
description: Vitest documentation and curated testing patterns, accessible via MCP resources on the vitest-agent server. Provides authoritative API, configuration, and pattern references rather than relying on potentially-stale training-data knowledge.
when_to_use: |
  Load when uncertain about a Vitest configuration option, mocking approach, coverage setting, or API behavior. Trigger phrases: "how do I configure X in vitest", "vitest config option for", "what does vi.mock do", "vi.fn vs vi.spyOn", "how do I mock a module in vitest", "vitest expect API", "custom vitest reporter", "vitest plugin API", "how do I test async code in vitest", "vitest coverage thresholds", "v8 coverage config", "vitest setup file", "check the vitest docs", "look up vitest", "vitest API reference", "vitest timers", "vitest snapshots", "Effect service testing pattern". Also load when implementing a custom reporter or plugin, debugging snapshot or timer behavior, or needing the project's curated Effect testing patterns.
model: sonnet
effort: medium
allowed-tools: ListMcpResourcesTool ReadMcpResourceTool
---

# Vitest Context

The vitest-agent MCP server exposes two live documentation resources and six user-facing prompts. Reach for them before guessing or relying on training-data knowledge of Vitest APIs, which may be stale or incomplete.

## Resources

Two URI schemes are available. Always load the **index** first to get the current table of contents, then fetch individual pages.

**`vitest://docs/`** — Upstream Vitest documentation snapshot (pinned to the Vitest version this project targets). Covers the full API surface: `api/`, `config/`, `guide/`, and `blog/` sections. Fetch the index, find the relevant path, then read that page.

**`vitest-agent://patterns/`** — Curated patterns specific to this project: Effect service testing, Effect Schema testing, and custom reporter authoring. Fewer pages, higher signal-to-noise for vitest-agent development work.

## How to navigate

```text
1. ListMcpResourcesTool({})                       # discover what's available
2. ReadMcpResourceTool({ server, uri: "vitest://docs/" })          # load index
3. ReadMcpResourceTool({ server, uri: "vitest://docs/<path>" })    # fetch page
```

The `server` field is `plugin:vitest-agent:mcp` when using the bundled plugin, or `vitest-agent:mcp` when wired directly via settings.

Both indexes are stable entry points even as content is updated. The full table of contents is always at the index URI — do not guess at sub-paths without loading it first.
