import { describe, expect, it } from "vitest";
import { Cache } from "./cache.js";

// Cache.has() is intentionally not tested — zero coverage is the point.

describe("Cache", () => {
	describe("set / get", () => {
		it("stores and retrieves a value", () => {
			const cache = new Cache<string>();
			cache.set("key", "value");
			expect(cache.get("key")).toBe("value");
		});

		it("returns null for a missing key", () => {
			const cache = new Cache<string>();
			expect(cache.get("missing")).toBeNull();
		});

		it("returns null after TTL expiry", async () => {
			const cache = new Cache<string>();
			cache.set("key", "value", 10);
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(cache.get("key")).toBeNull();
		});

		it("keeps a non-expired entry alive", () => {
			const cache = new Cache<string>();
			cache.set("key", "value", 60_000);
			expect(cache.get("key")).toBe("value");
		});
	});

	describe("delete", () => {
		it("removes an existing key and returns true", () => {
			const cache = new Cache<number>();
			cache.set("n", 42);
			expect(cache.delete("n")).toBe(true);
			expect(cache.get("n")).toBeNull();
		});

		it("returns false for a non-existent key", () => {
			const cache = new Cache<number>();
			expect(cache.delete("missing")).toBe(false);
		});
	});

	describe("clear", () => {
		it("removes all entries", () => {
			const cache = new Cache<string>();
			cache.set("a", "1");
			cache.set("b", "2");
			cache.clear();
			expect(cache.get("a")).toBeNull();
			expect(cache.get("b")).toBeNull();
		});
	});

	describe("size", () => {
		it("returns the count of stored entries", () => {
			const cache = new Cache<string>();
			cache.set("a", "1");
			cache.set("b", "2");
			expect(cache.size()).toBe(2);
		});

		// Stale-count-after-expiry is intentionally untested.
	});
});
