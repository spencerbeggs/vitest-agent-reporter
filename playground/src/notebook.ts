/**
 * A text notebook that composes the math, strings and cache utilities.
 *
 * @remarks
 * **Playground module — intentionally incomplete.**
 * This file exists so the vitest-agent TDD orchestrator has a hard-throw
 * path to surface and fix. See `playground/CLAUDE.md`.
 *
 * Hard-throw path:
 * `getEntry(index)` and `slugEntry(index)` do **not** bounds-check `index`.
 * Calling either with an out-of-range value throws at runtime:
 * ```
 * TypeError: Cannot read properties of undefined (reading 'toUpperCase')
 * TypeError: Cannot read properties of undefined (reading 'toLowerCase')
 * ```
 * The fix is a `RangeError` guard with a descriptive message, covered by a
 * new test. See the per-method remarks for details.
 *
 * Additional gaps (inherited from the other modules):
 * - `averageWordCount()` returns `NaN` when the notebook is empty.
 * - `preview()` delegates to `truncate`, which has its own `maxLen < 4` gap.
 *
 * @packageDocumentation
 */

import { Cache } from "./cache.js";
import { average } from "./math.js";
import { countWords, slugify, truncate } from "./strings.js";

/**
 * A notebook that stores trimmed text entries and exposes aggregate analysis
 * over them via the playground utility functions.
 */
export class Notebook {
	private readonly entries: string[] = [];
	private readonly cache: Cache<string>;

	/**
	 * @param cache - Optional cache instance to use for memoised results.
	 *   Defaults to a fresh `Cache<string>`.
	 */
	constructor(cache?: Cache<string>) {
		this.cache = cache ?? new Cache<string>();
	}

	/**
	 * Appends a trimmed copy of `text` to the notebook and invalidates any
	 * cached aggregate results.
	 */
	add(text: string): void {
		this.entries.push(text.trim());
		this.cache.clear();
	}

	/**
	 * Returns the number of entries currently in the notebook.
	 */
	size(): number {
		return this.entries.length;
	}

	/**
	 * Returns the entry at `index` converted to upper-case.
	 *
	 * @remarks
	 * **Hard-throw path:** `this.entries[index]` evaluates to `undefined`
	 * when `index` is out of range. The subsequent `.toUpperCase()` call
	 * then throws:
	 * ```
	 * TypeError: Cannot read properties of undefined (reading 'toUpperCase')
	 * ```
	 * Tests only exercise valid indices. The agent should add a bounds check
	 * and replace the implicit crash with a descriptive `RangeError`.
	 */
	getEntry(index: number): string {
		return this.entries[index].toUpperCase();
	}

	/**
	 * Returns the URL slug for the entry at `index`.
	 *
	 * @remarks
	 * Same out-of-range crash as {@link getEntry} — `this.entries[index]`
	 * is `undefined` for invalid indices, and `slugify(undefined)` throws
	 * inside the string utility. Also intentionally untested for the error
	 * path.
	 */
	slugEntry(index: number): string {
		return slugify(this.entries[index]);
	}

	/**
	 * Returns the average word count across all entries.
	 *
	 * @remarks
	 * Delegates to `countWords` and `average`. Returns `NaN` when called on
	 * an empty notebook — the same untested gap as `math.ts#average([])`.
	 */
	averageWordCount(): number {
		return average(this.entries.map(countWords));
	}

	/**
	 * Returns a truncated preview of all entries joined by newlines, memoised
	 * by `maxLen` until the next {@link add} call.
	 *
	 * @param maxLen - Maximum length of the returned preview string.
	 *   Defaults to `120`.
	 */
	preview(maxLen = 120): string {
		const key = `preview:${maxLen}`;
		const hit = this.cache.get(key);
		if (hit !== null) return hit;
		const result = truncate(this.entries.join("\n"), maxLen);
		this.cache.set(key, result);
		return result;
	}
}
