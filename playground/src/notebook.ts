/**
 * A text notebook that composes the math, strings and cache utilities.
 *
 * @remarks
 * **Playground module — intentionally incomplete.**
 * This file exists so the vitest-agent TDD orchestrator has a hard-throw
 * path to surface and fix. See `playground/CLAUDE.md`.
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
	 * @throws {RangeError} When `index` is negative or >= the notebook size.
	 */
	getEntry(index: number): string {
		this.checkBounds(index);
		return this.entries[index].toUpperCase();
	}

	/**
	 * Returns the URL slug for the entry at `index`.
	 *
	 * @throws {RangeError} When `index` is negative or >= the notebook size.
	 */
	slugEntry(index: number): string {
		this.checkBounds(index);
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

	/**
	 * Throws a `RangeError` if `index` is out of bounds for `this.entries`.
	 */
	private checkBounds(index: number): void {
		if (index < 0 || index >= this.entries.length) {
			throw new RangeError(`Index ${index} is out of bounds`);
		}
	}
}
