# playground/CLAUDE.md

This workspace is the **dogfooding sandbox** for `vitest-agent`. It is not a real application — it exists so the vitest-agent plugin, TDD orchestrator, and MCP tools have a live target to operate on during development and demos.

## Purpose

The `playground` package runs as part of the monorepo test suite (project name `playground` in `vitest.config.ts`). Its coverage numbers feed the agent-facing terminal output, the `vitest-agent` CLI commands (`status`, `coverage`, `trends`), and the MCP tools. By keeping coverage visibly below the 80 % aspirational targets, the agent always has something actionable to report.

## Intentional defects and gaps

The source files contain deliberately imperfect code. **Do not "fix" these in the monorepo** — they are the fodder:

### `src/math.ts`

| Gap | Description |
| --- | ----------- |
| `average([])` returns `NaN` | No test exercises the empty-array path. |
| `clamp` with `min > max` | Undefined behavior; no guard, no test. |
| `isPrime` is untested | 0 % function coverage. |

### `src/strings.ts`

| Gap | Description |
| --- | ----------- |
| `truncate` when `maxLen < 4` | Output can exceed `maxLen`. Untested. |
| `slugify` with consecutive spaces | Produces double hyphens. Untested. |
| `countWords("hello  world")` | Returns `3` instead of `2` (splits on single space). |
| `isPalindrome` is untested | 0 % function coverage. |

### `src/cache.ts`

| Gap | Description |
| --- | ----------- |
| `size()` counts expired entries | Lazy eviction means stale entries are included. Untested. |
| `has()` is untested | 0 % function coverage. |

### `src/notebook.ts`

`Notebook` composes the three utility modules into a class. Its happy-path methods are tested, but two paths produce hard runtime crashes, not just wrong values.

| Gap | Description |
| --- | ----------- |
| `getEntry(index)` out of range | `this.entries[index]` is `undefined`; `.toUpperCase()` throws `TypeError`. |
| `slugEntry(index)` out of range | Same crash — `slugify(undefined)` throws inside the string utility. |
| `averageWordCount()` on empty notebook | Delegates to `average([])`, returns `NaN`. |

The `TypeError` paths are the primary target: the agent should write a failing test for `getEntry(-1)` or `getEntry(99)`, watch it throw, then add a `RangeError` guard with a descriptive message and make the test pass.

## What agents should do here

When the TDD orchestrator or a coverage-improvement session targets this package, it should:

1. Write a failing test for `notebook.getEntry` with an out-of-range index and observe the `TypeError`.
2. Fix `getEntry` (and `slugEntry`) with a `RangeError` guard so the test passes.
3. Write failing tests for the other untested functions (`isPrime`, `isPalindrome`, `Cache.has`).
4. Write edge-case tests that expose the known defects (`countWords` double-space, `average([])`, `size()` after TTL expiry).
5. Fix the defects so all new tests pass.
6. Verify coverage climbs toward the 80 % aspirational targets.

That workflow is exactly what `vitest-agent` is designed to support.

## What agents should NOT do here

- Do not remove the intentional gaps without adding the corresponding tests first (TDD).
- Do not add unrelated utility functions — keep the surface area small and focused.
- Do not change the package name (`playground`) or its position in the workspace.
