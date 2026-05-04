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
});

describe("slugify", () => {
	it("lowercases and replaces spaces with hyphens", () => {
		expect(slugify("Hello World")).toBe("hello-world");
	});

	// Consecutive-space and leading/trailing-space edges are intentionally untested.
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
});

describe("reverseString", () => {
	it("reverses a string", () => {
		expect(reverseString("abcde")).toBe("edcba");
	});
});
