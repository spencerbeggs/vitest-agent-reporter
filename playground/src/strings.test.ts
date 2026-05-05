import { describe, expect, it } from "vitest";
import { capitalize, countWords, reverseString, slugify, truncate } from "./strings.js";

// isPalindrome is intentionally not imported — zero coverage is the point.

describe("truncate", () => {
	it("returns the original string when within limit", () => {
		expect(truncate("hello", 10)).toBe("hello");
	});

	it("truncates and appends ellipsis", () => {
		expect(truncate("hello world", 8)).toBe("hello...");
	});

	// maxLen < 4 edge case is intentionally untested.

	it("should return a string no longer than maxLen when maxLen is less than 4", () => {
		// Given: a string longer than maxLen, and a maxLen smaller than the ellipsis length
		const str = "hello";
		const maxLen = 2;

		// When: truncate is called
		const result = truncate(str, maxLen);

		// Then: the result must not exceed maxLen characters
		expect(result.length).toBeLessThanOrEqual(maxLen);
	});
});

describe("slugify", () => {
	it("lowercases and replaces spaces with hyphens", () => {
		expect(slugify("Hello World")).toBe("hello-world");
	});

	// Consecutive-space and leading/trailing-space edges are intentionally untested.

	it("should collapse consecutive whitespace to a single hyphen", () => {
		// Given: a string with consecutive spaces between words
		const input = "hello  world";

		// When: slugify is called
		const result = slugify(input);

		// Then: consecutive spaces collapse to one hyphen
		expect(result).toBe("hello-world");
	});
});

describe("capitalize", () => {
	it("capitalizes the first character", () => {
		expect(capitalize("hello")).toBe("Hello");
	});

	it("returns empty string unchanged", () => {
		expect(capitalize("")).toBe("");
	});
});

describe("countWords", () => {
	it("counts words separated by single spaces", () => {
		expect(countWords("hello world foo")).toBe(3);
	});

	it("returns 0 for an empty string", () => {
		expect(countWords("")).toBe(0);
	});

	// Consecutive-space defect is intentionally untested.

	it("should treat any run of whitespace as a single delimiter", () => {
		// Given: a string with consecutive spaces between words
		const input = "hello  world";

		// When: countWords is called
		const result = countWords(input);

		// Then: consecutive spaces count as one delimiter, yielding 2 words
		expect(result).toBe(2);
	});
});

describe("reverseString", () => {
	it("reverses a string", () => {
		expect(reverseString("abcde")).toBe("edcba");
	});
});
