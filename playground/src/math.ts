/**
 * Numeric utility functions.
 *
 * @remarks
 * **Playground module — intentionally incomplete.**
 * This file exists so the vitest-agent TDD orchestrator has real coverage
 * gaps to surface. See `playground/CLAUDE.md` for the full rationale.
 * Do not treat the gaps below as bugs to fix in this codebase.
 *
 * Intentional gaps:
 * - `average` returns `NaN` for an empty array; no test exercises that path.
 * - `clamp` has no guard when `min > max`; the behavior is undefined.
 * - `isPrime` is exported but has zero test coverage.
 *
 * @packageDocumentation
 */

/**
 * Adds two numbers.
 */
export function add(a: number, b: number): number {
	return a + b;
}

/**
 * Returns the arithmetic mean of an array of numbers.
 *
 * @remarks
 * Returns `NaN` when `numbers` is empty (division by zero). This edge
 * case is intentionally untested so the agent can discover and fix it.
 */
export function average(numbers: number[]): number {
	return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/**
 * Clamps `value` to the inclusive range `[min, max]`.
 *
 * @remarks
 * No guard against `min > max`. If the arguments are transposed by the
 * caller the result is implementation-defined. Intentional gap: the agent
 * should add a precondition check or document the requirement.
 */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/**
 * Returns `true` if `n` is a prime number.
 *
 * @remarks
 * Correct O(√n) implementation. Exported but **completely untested** —
 * a deliberate 0 % function-coverage gap for the agent to surface.
 */
export function isPrime(n: number): boolean {
	if (n < 2) return false;
	for (let i = 2; i <= Math.sqrt(n); i++) {
		if (n % i === 0) return false;
	}
	return true;
}
