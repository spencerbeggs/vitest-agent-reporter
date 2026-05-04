import { describe, expect, it } from "vitest";
import { add, average, clamp } from "./math.js";

// isPrime is intentionally not imported — zero coverage is the point.

describe("add", () => {
	it("adds two positive numbers", () => {
		expect(add(2, 3)).toBe(5);
	});

	it("adds negative numbers", () => {
		expect(add(-1, -2)).toBe(-3);
	});
});

describe("average", () => {
	it("returns the mean of a non-empty array", () => {
		expect(average([1, 2, 3, 4, 5])).toBe(3);
	});

	it("returns the single element for a one-item array", () => {
		expect(average([42])).toBe(42);
	});

	// Empty-array edge case (returns NaN) is intentionally untested.
});

describe("clamp", () => {
	it("returns value when within range", () => {
		expect(clamp(5, 1, 10)).toBe(5);
	});

	it("clamps to min", () => {
		expect(clamp(-5, 0, 10)).toBe(0);
	});

	it("clamps to max", () => {
		expect(clamp(20, 0, 10)).toBe(10);
	});

	// min > max edge case is intentionally untested.
});
