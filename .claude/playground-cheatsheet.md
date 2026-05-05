# playground cheatsheet (do not surface to orchestrator)

This is the answer key for the intentional defects in `playground/`. The TDD orchestrator subagent is **the system under test** during dogfood sessions and must NOT see this file or any path leading to it. The main agent uses this to verify the orchestrator's work — never to brief it.

## Purpose

The `playground/` package runs as part of the monorepo test suite (project name `playground` in `vitest.config.ts`). Its coverage numbers feed the agent-facing terminal output, the `vitest-agent` CLI commands (`status`, `coverage`, `trends`), and the MCP tools. By keeping coverage visibly below the 80% aspirational targets, the agent always has something actionable to report.

## Intentional defects and gaps

The source files contain deliberately imperfect code. **Do not fix these in the monorepo** — they are the fodder for the orchestrator to find.

### `src/math.ts`

| Gap | Description |
| --- | ----------- |
| `average([])` returns `NaN` | No test exercises the empty-array path. |
| `clamp` with `min > max` | Undefined behavior; no guard, no test. |
| `isPrime` is untested | 0% function coverage. |

### `src/strings.ts`

| Gap | Description |
| --- | ----------- |
| `truncate` when `maxLen < 4` | Output can exceed `maxLen`. Untested. |
| `slugify` with consecutive spaces | Produces double hyphens. Untested. |
| `countWords("hello  world")` | Returns `3` instead of `2` (splits on single space). |
| `isPalindrome` is untested | 0% function coverage. |

### `src/cache.ts`

| Gap | Description |
| --- | ----------- |
| `size()` counts expired entries | Lazy eviction means stale entries are included. Untested. |
| `has()` is untested | 0% function coverage. |

### `src/notebook.ts`

`Notebook` composes the three utility modules into a class. The bounds-check `RangeError` guards on `getEntry` and `slugEntry` were added in the goal-hierarchy redesign cycle (commits `8ad5676` / `53715bf` on `dogfood/round-1`); those rows are removed.

| Gap | Description |
| --- | ----------- |
| `averageWordCount()` on empty notebook | Delegates to `average([])`, returns `NaN`. |

## What a typical dogfood handoff prompts the orchestrator to do

When the TDD orchestrator targets this package, a sanitized task prompt should ask it to:

1. Write a failing test for `notebook.getEntry` with an out-of-range index and observe the `TypeError`.
2. Fix `getEntry` (and `slugEntry`) with a `RangeError` guard so the test passes.
3. Write failing tests for the other untested functions (`isPrime`, `isPalindrome`, `Cache.has`).
4. Write edge-case tests that expose the known defects (`countWords` double-space, `average([])`, `size()` after TTL expiry).
5. Fix the defects so all new tests pass.
6. Verify coverage climbs toward the 80% aspirational targets.

The orchestrator should arrive at the above by exploring the playground source on its own — never by being handed this file or pointed at any of its findings verbatim.

## Maintenance

When defects in `playground/` are intentionally fixed (because the dogfood chain proved a behavior), update this cheatsheet to remove the corresponding row. When new intentional defects are added, add rows here so the main agent can verify the orchestrator's work against the answer key. Constraints:

- Do not add unrelated utility functions — keep the surface area small and focused.
- Do not change the package name (`playground`) or its position in the workspace.
- Do not link to this file from anywhere inside `playground/` — keep it invisible to a code-search radius rooted at the playground directory.
