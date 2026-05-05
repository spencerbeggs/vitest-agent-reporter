---
name: update-vitest-snapshot
description: Use when bumping the vendored Vitest documentation snapshot in packages/mcp/vendor/vitest-docs/. Invokes the fetch script with a target tag, summarizes the diff, commits the result. Trigger on requests like "bump the vitest docs snapshot", "update the vendored vitest docs to v4.x.y", or as part of a Vitest peer-dep bump.
---

# Update Vitest Snapshot

Refresh the vendored Vitest documentation snapshot at `packages/mcp/vendor/vitest-docs/`.

## When to use

- The user asks to bump the snapshot (`update vitest docs`, `bump vitest snapshot to v4.2.0`).
- A Vitest peer-dep bump landed and the docs should track.
- Routine maintenance every few minor Vitest releases.

## Steps

1. Read the current pinned tag from `packages/mcp/vendor/vitest-docs/manifest.json`.
2. Ask the user for the target (latest stable, a specific tag like `v4.2.0`, or a SHA). Default: latest stable.
3. Run the fetch script:

   `cd packages/mcp && pnpm run update-vitest-snapshot --tag <target>`

4. Read the script's output for the new tag, SHA, and file count.
5. Run `git diff --stat packages/mcp/vendor/vitest-docs/` to summarize the diff.
6. Identify newly-added pages, removed pages, and pages with substantive changes (use `git diff --numstat` to find largest deltas).
7. If patterns reference removed pages (search `packages/mcp/patterns/` for `vitest://` URIs against the diff), surface this as a follow-up.
8. Stage and commit:

   ```bash
   git add packages/mcp/vendor/vitest-docs/
   git commit -m "chore(mcp): bump vitest docs snapshot to <tag>"
   ```

   Body should list pages added/removed/changed.

9. Suggest creating a changeset entry under `## Maintenance` since the bump is patch-level.

## What this skill does NOT do

- It does not automatically resolve broken cross-references in `packages/mcp/patterns/` — flag for human follow-up.
- It does not bump the Vitest peer-dep version in `package.json` — that is a separate concern.
- It does not run validation tests after the bump — defer to CI.
