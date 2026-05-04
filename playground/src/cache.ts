/**
 * A minimal TTL-aware in-memory key/value cache.
 *
 * @remarks
 * **Playground module — intentionally incomplete.**
 * This file exists so the vitest-agent TDD orchestrator has real coverage
 * gaps to surface. See `playground/CLAUDE.md`.
 * Do not treat the gaps below as real bugs to fix in this codebase.
 *
 * Intentional gaps:
 * - `size()` counts all stored entries including logically-expired ones
 *   that have not yet been accessed (lazy eviction). No test exercises
 *   the stale-count path.
 * - The `has()` method is exported but **completely untested**.
 *
 * @packageDocumentation
 */

interface CacheEntry<T> {
	value: T;
	expiresAt: number | null;
}

/**
 * A key/value store with optional per-entry time-to-live (TTL).
 *
 * Entries expire lazily: they are only evicted when accessed via `get`.
 * `size()` therefore may include expired-but-not-yet-evicted entries.
 */
export class Cache<T = unknown> {
	private readonly store = new Map<string, CacheEntry<T>>();

	/**
	 * Stores `value` under `key` with an optional `ttl` in milliseconds.
	 * A `ttl` of `0` or negative is treated as no expiry.
	 */
	set(key: string, value: T, ttl?: number): void {
		const expiresAt = ttl && ttl > 0 ? Date.now() + ttl : null;
		this.store.set(key, { value, expiresAt });
	}

	/**
	 * Returns the value for `key`, or `null` if the key is missing or has
	 * expired. Expired entries are evicted on first access.
	 */
	get(key: string): T | null {
		const entry = this.store.get(key);
		if (!entry) return null;
		if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
			this.store.delete(key);
			return null;
		}
		return entry.value;
	}

	/**
	 * Returns `true` if `key` exists in the cache and has not expired.
	 *
	 * @remarks
	 * Correct implementation. **Zero test coverage** — a deliberate gap
	 * for the agent to surface.
	 */
	has(key: string): boolean {
		return this.get(key) !== null;
	}

	/**
	 * Removes `key` from the cache. Returns `true` if the key existed.
	 */
	delete(key: string): boolean {
		return this.store.delete(key);
	}

	/**
	 * Removes all entries from the cache.
	 */
	clear(): void {
		this.store.clear();
	}

	/**
	 * Returns the number of stored entries.
	 *
	 * @remarks
	 * Because eviction is lazy, expired entries that have never been
	 * accessed via `get` are still counted here. No test exercises this
	 * discrepancy — an intentional gap for the agent to discover.
	 */
	size(): number {
		return this.store.size;
	}
}
