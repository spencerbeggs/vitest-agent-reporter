import { describe, expect, it } from "vitest";
import { Cache } from "./cache.js";
import { Notebook } from "./notebook.js";

// getEntry / slugEntry with an out-of-range index are intentionally NOT
// tested here — calling them with a bad index throws a TypeError at runtime.
// That is the hard-throw path the agent should surface, fix with a RangeError
// guard, and cover with a new test.

describe("Notebook", () => {
	describe("constructor", () => {
		it("starts empty", () => {
			const nb = new Notebook();
			expect(nb.size()).toBe(0);
		});

		it("accepts an external cache instance", () => {
			const cache = new Cache<string>();
			const nb = new Notebook(cache);
			expect(nb.size()).toBe(0);
		});
	});

	describe("add / size", () => {
		it("increments size after each add", () => {
			const nb = new Notebook();
			nb.add("hello world");
			nb.add("foo bar baz");
			expect(nb.size()).toBe(2);
		});

		it("trims whitespace from added entries", () => {
			const nb = new Notebook();
			nb.add("  padded  ");
			expect(nb.getEntry(0)).toBe("PADDED");
		});
	});

	describe("getEntry", () => {
		it("returns the entry in upper-case", () => {
			const nb = new Notebook();
			nb.add("hello");
			expect(nb.getEntry(0)).toBe("HELLO");
		});

		it("returns each entry at its correct index", () => {
			const nb = new Notebook();
			nb.add("first");
			nb.add("second");
			expect(nb.getEntry(1)).toBe("SECOND");
		});

		// Out-of-range index is intentionally untested — it throws TypeError.
	});

	describe("slugEntry", () => {
		it("returns a slug for the entry at the given index", () => {
			const nb = new Notebook();
			nb.add("Hello World");
			expect(nb.slugEntry(0)).toBe("hello-world");
		});

		// Out-of-range index is intentionally untested — it throws TypeError.
	});

	describe("averageWordCount", () => {
		it("returns the mean word count across all entries", () => {
			const nb = new Notebook();
			nb.add("one");
			nb.add("two three");
			nb.add("four five six");
			// word counts: 1, 2, 3 → mean = 2
			expect(nb.averageWordCount()).toBe(2);
		});

		// Empty-notebook case (returns NaN) is intentionally untested.
	});

	describe("preview", () => {
		it("joins entries with newlines", () => {
			const nb = new Notebook();
			nb.add("first");
			nb.add("second");
			expect(nb.preview()).toBe("first\nsecond");
		});

		it("truncates when the joined text exceeds maxLen", () => {
			const nb = new Notebook();
			nb.add("the quick brown fox");
			nb.add("jumps over the lazy dog");
			expect(nb.preview(20)).toBe("the quick brown f...");
		});

		it("returns the same string on repeated calls (cache hit)", () => {
			const nb = new Notebook();
			nb.add("cached entry");
			const first = nb.preview();
			const second = nb.preview();
			expect(first).toBe(second);
		});

		it("invalidates the cache after add", () => {
			const nb = new Notebook();
			nb.add("first");
			const before = nb.preview();
			nb.add("second");
			const after = nb.preview();
			expect(after).not.toBe(before);
		});
	});
});
