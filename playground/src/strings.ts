/**
 * String utility functions.
 *
 * @remarks
 * **Playground module — intentionally incomplete.**
 * This file exists so the vitest-agent TDD orchestrator has real coverage
 * gaps and minor defects to surface. See `playground/CLAUDE.md`.
 * Do not treat the issues below as real bugs to fix in this codebase.
 *
 * Intentional gaps / defects:
 * - `truncate`: when `maxLen < 4` the output exceeds `maxLen` (ellipsis
 *   is 3 chars, leaving zero content chars). No test exercises this.
 * - `slugify`: naive — consecutive spaces produce double hyphens; leading /
 *   trailing spaces produce leading / trailing hyphens. Untested edge.
 * - `countWords`: splits on single spaces, so `"hello  world"` returns 3
 *   instead of 2. Intentional defect; tests only use single-space input.
 * - `isPalindrome`: correct implementation but **zero test coverage**.
 *
 * @packageDocumentation
 */

/**
 * Truncates `str` to at most `maxLen` characters, appending `"..."` if
 * the string was shortened.
 *
 * @remarks
 * Edge-case gap: when `maxLen` is 3 or less the slice produces an empty
 * content prefix and the result is `"..."` regardless of input length,
 * violating the `maxLen` contract for very small values. Intentionally
 * untested.
 */
export function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) return str;
	if (maxLen < 4) return str.slice(0, maxLen);
	return `${str.slice(0, maxLen - 3)}...`;
}

/**
 * Converts a string to a URL-safe slug by lower-casing and replacing
 * spaces with hyphens.
 *
 * @remarks
 * Naive implementation: does not collapse consecutive spaces, strip
 * leading / trailing whitespace, or handle non-ASCII characters. These
 * edge cases are intentionally untested.
 */
export function slugify(str: string): string {
	return str.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Capitalizes the first character of `str`.
 */
export function capitalize(str: string): string {
	if (str.length === 0) return str;
	return str[0].toUpperCase() + str.slice(1);
}

/**
 * Counts the words in `str` by splitting on single space characters.
 *
 * @remarks
 * Defect: consecutive spaces produce empty tokens that inflate the count.
 * `countWords("hello  world")` returns `3`, not `2`. Tests only exercise
 * well-formed single-space input, so this defect is invisible to the suite.
 */
export function countWords(str: string): number {
	if (str.trim() === "") return 0;
	return str.trim().split(/\s+/).length;
}

/**
 * Reverses `str` character by character.
 */
export function reverseString(str: string): string {
	return str.split("").reverse().join("");
}

/**
 * Returns `true` if `str` is a palindrome (case-insensitive, ignoring
 * non-alphanumeric characters).
 *
 * @remarks
 * Correct implementation. Exported but **zero test coverage** — a
 * deliberate gap for the agent to surface and fill.
 */
export function isPalindrome(str: string): boolean {
	const normalized = str.toLowerCase().replace(/[^a-z0-9]/g, "");
	return normalized === normalized.split("").reverse().join("");
}
