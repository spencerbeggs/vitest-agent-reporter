---
name: update-vitest-snapshot
description: Use when refreshing the vendored upstream Vitest documentation snapshot at packages/mcp/src/vendor/vitest-docs/. Drives a 5-phase fetch → prune → scaffold → enrich → validate workflow with explicit user checkpoints. Repo-internal — does not apply to projects that consume vitest-agent as a dependency.
argument-hint: "[--tag vN.M.K]"
allowed-tools: Read Write Edit Bash Glob Grep
---

# Update Vitest Snapshot

You are refreshing the vendored upstream Vitest documentation snapshot the MCP server serves under `vitest://docs/...`. The snapshot ships in `vitest-agent-mcp` and is the primary way agents discover Vitest API behavior without a network fetch. Quality of the per-page `description` field directly determines whether future agents can find the right page when they need it.

This is not a fast workflow. The user is reviewing alongside you. Take your time with descriptions — this snapshot is refreshed every several months at most.

## When to use

- The user asks to bump the snapshot (`update vitest docs`, `bump vitest snapshot to v4.2.0`).
- A Vitest peer-dep bump landed and the docs should track.
- An MCP client reports unhelpful or stale resource descriptions.

## Architecture context

The cleaned snapshot lives at `packages/mcp/src/vendor/vitest-docs/`. Files there ship in the published package via `copyPatterns` in `rslib.config.ts`. The raw upstream download is gitignored at `packages/mcp/lib/vitest-docs-raw/` — a working area, never committed.

`manifest.json` is the source of truth for which pages exist and what `title`/`description` the MCP `resources/list` response advertises. The schema lives at `packages/mcp/src/resources/manifest-schema.ts` and is enforced both at write time (via the build script) and at runtime (via the registrar).

## Phase 1 — Fetch

Resolve the target tag with the user (default to latest stable Vitest release). Then run:

```bash
pnpm exec tsx packages/mcp/lib/scripts/fetch-upstream-docs.ts --tag vN.M.K
```

This sparse-clones `vitest-dev/vitest`, populates `packages/mcp/lib/vitest-docs-raw/`, and writes `.upstream-info.json` with the resolved commit SHA. Report the SHA and file count back to the user.

## Phase 2 — Inventory and prune

Walk `packages/mcp/lib/vitest-docs-raw/` with `Glob` to enumerate every `.md` file. For each top-level directory and each loose file, decide:

- **Keep** — substantive technical content, likely to answer agent questions.
- **Drop** — VitePress site chrome (team pages, blog posts, marketing landing pages, internal repo notes, navigation-only index pages).

The build script's hardcoded denylist already drops `index.md`, `team.md`, `todo.md`, `blog.md`, and the `blog/`, `.vitepress/`, `public/` directories. Look for additional cruft: TIPS, contribution guides, release notes, sponsor pages, anything matching `<!-- @include` directives or VitePress-specific Vue components.

Present your proposed drop list to the user before running Phase 3. The user adjusts. Drops not in the script's denylist need to be physically removed from `packages/mcp/lib/vitest-docs-raw/` before the build step (or you can extend the build script's `DENYLIST_FILES` / `DENYLIST_DIRS` if the omission should be permanent — discuss with the user which is appropriate).

## Phase 3 — Scaffold

Run the build script to produce a first-cut snapshot:

```bash
pnpm exec tsx packages/mcp/lib/scripts/build-snapshot.ts
```

This:

- Strips VitePress YAML frontmatter from every kept file.
- Derives mechanical titles from H1 headings (or filename casing fallback).
- Writes the cleaned tree under `packages/mcp/src/vendor/vitest-docs/`.
- Generates `manifest.json` with placeholder descriptions marked `[TODO: replace with load-when signal]`.
- Generates `ATTRIBUTION.md`.

The placeholder marker exists so Phase 4 can find every entry that still needs work, and so `validate-snapshot.ts` will refuse to bless an un-enriched manifest.

## Phase 4 — Author "load when" descriptions

This phase is the headline reason this skill exists. Read each cleaned page and rewrite its `manifest.json` description to be a strong "load when" signal.

### What "load when" means

A good description tells a future agent reading the MCP `resources/list` response *which questions this page can answer*. Concrete APIs, scenarios, or symptoms — not a generic restatement of the title.

| ✗ Bad | ✓ Good |
| ----- | ------ |
| `Vitest API documentation about mocking.` | `Use when working with vi.fn, vi.spyOn, vi.mock, or vi.doMock — covers MockInstance methods, mock state inspection, mockReturnValue / mockResolvedValue, and timer mocks via vi.useFakeTimers.` |
| `Configuration options for the test runner.` | `Use when configuring test discovery (include/exclude globs, testTimeout, hookTimeout), the run pool (forks vs threads, isolate, poolOptions), or environment selection (jsdom, happy-dom, node).` |
| `How to debug Vitest tests.` | `Use when a test fails unexpectedly and you need to attach a debugger, run a single test (-t pattern, --reporter=verbose), inspect snapshot diffs, or use Vitest UI for failure investigation.` |

### How to author them

Read each page's actual content (not just the title). For each:

1. Identify the 3–5 concrete things on the page — function names, config keys, error messages, scenarios.
2. Lead with `Use when <verb> ...` so the description reads as a triggering condition.
3. Mention the specific identifiers an agent would search for, so substring matching surfaces the right page.
4. Keep it to 1–2 sentences (under 250 chars when possible).

Update each entry's `description` field in `packages/mcp/src/vendor/vitest-docs/manifest.json` directly. Edit the entries one at a time using `Edit`. The `[TODO: ...]` marker tells you which haven't been done yet.

For pages with marginal content (short stubs, redirects, deprecation notices), check whether they should actually be dropped — return to Phase 2 thinking. The user reviews any drops.

### Title quality

The mechanical H1 extraction in Phase 3 produces reasonable titles for most pages, but check for:

- Overly generic titles (`Index`, `Overview`) — replace with section-aware names.
- Vue/VitePress artifacts (`<script setup>` mentions in titles) — clean up.
- Pages where the H1 is actually a sub-section header — pick a better title from context.

## Phase 5 — Validate and verify

Run the validator:

```bash
pnpm exec tsx packages/mcp/lib/scripts/validate-snapshot.ts
```

This checks every file has a manifest entry, every entry resolves to a file, no description still carries the `[TODO` marker, and every description meets the minimum length. Fix any reported issues.

Then verify the build:

```bash
pnpm ci:build --filter='./packages/mcp'
```

The build copies `src/vendor/vitest-docs/` and `src/patterns/` into `dist/dev/` and `dist/npm/` via `copyPatterns`. If `pnpm ci:build` fails, the path resolution in `packages/mcp/src/resources/index.ts` is the most likely suspect — it has an `existsSync` fallback for source vs built layouts.

Smoke-test the registrar by reading a few resource URIs through an MCP client (or by calling the read functions directly in a Node REPL).

## Phase 6 — Commit

Stage everything under `packages/mcp/src/vendor/vitest-docs/` plus `manifest.json`. Show the user the diff summary (`git diff --stat`) before committing. Suggested commit message:

```text
chore(mcp): bump vitest docs snapshot to <tag>

Refreshed vendored Vitest documentation to <tag> (commit <sha-prefix>).
- N pages indexed in manifest.json
- Dropped: <list of intentional drops>
- Per-page descriptions rewritten as load-when signals.
```

A patch-level changeset is appropriate (`## Maintenance` section).

## What this skill does NOT do

- Bump the Vitest peer-dep version in `packages/plugin/package.json` — that's a separate concern.
- Resolve broken cross-references in `packages/mcp/src/patterns/` — flag for human follow-up.
- Run downstream MCP integration tests — defer to CI.
