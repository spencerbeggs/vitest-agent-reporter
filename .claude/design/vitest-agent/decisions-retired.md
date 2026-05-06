---
status: archived
module: vitest-agent-reporter
category: architecture
created: 2026-05-06
updated: 2026-05-06
last-synced: 2026-05-06
completeness: 100
related:
  - ./decisions.md
dependencies: []
---

# Decisions — Retired

Decisions that were superseded as the system evolved. These entries document
what was tried and why it didn't survive. They are not how the system works
now; load this file only when investigating archaeology or comparing against
a current decision's "Why this shape rather than the obvious alternative"
section.

For active decisions, see [./decisions.md](./decisions.md).

---

## Decision 11: Cache Directory Resolution (Retired)

**Superseded by:** [Decision 31 — Deterministic XDG Path
Resolution](./decisions.md#decision-31-deterministic-xdg-path-resolution)

**Why retired:** the resolver walked the filesystem looking for an existing
artifact (`node_modules/.vite/vitest/<hash>/.../data.db`) and fell back to a
literal path on a fresh project. This made the data path a function of
filesystem state ("does this artifact exist?") instead of workspace
identity, so the MCP server and the reporter could disagree about where
the database lived. D31 replaced the artifact probe with a deterministic
function of the workspace's `package.json` `name` under
`$XDG_DATA_HOME/vitest-agent/<workspaceKey>/data.db`.

**What it was:** three-priority resolution in `AgentPlugin`:

1. Explicit `reporter.cacheDir` option (user override)
2. `outputFile['vitest-agent-reporter']` from Vitest config
3. `vite.cacheDir + "/vitest-agent"` as default (typically
   `node_modules/.vite/.../vitest-agent/`)

CLI and MCP cache-dir resolution checked common locations independently.
When `AgentReporter` was used standalone (without the plugin), the default
was `.vitest-agent` in the project root.

---

## Decision 29: Plugin MCP Server Loader (Retired)

**Superseded by:** [Decision 30 — Plugin MCP Loader as PM-Detect +
Spawn](./decisions.md#decision-30-plugin-mcp-loader-as-pm-detect--spawn)

**Why retired:** the loader used a `file://` dynamic-import plus a manual
`node_modules` walk to locate the MCP server entrypoint inside the
single-package install. It depended on an exact `./mcp` subpath export,
duplicated Node's resolution algorithm (breaking under yarn berry PnP and
custom store directories), and surfaced errors as "couldn't find ./mcp
export" rather than "the package isn't installed". When the MCP server
became its own package (`vitest-agent-mcp`) with its own bin in the
five-package split, the user's package manager could resolve and execute
it directly — re-implementing PM resolution in the loader was the wrong
layer. D30 rewrote the loader as a zero-deps PM-detect + spawn script
that delegates to `pnpm exec` / `npx --no-install` / `yarn run` / `bun x`.

**What it was:** the loader resolved the MCP server module by walking up
from the plugin directory through `node_modules` looking for
`vitest-agent-reporter`'s `./mcp` subpath export, then dynamically
imported it as a `file://` URL.
