import { describe, expect, it } from "vitest";
import { add, fibonacci, multiply, subtract } from "./math.js";

describe("math", () => {
	describe("add", () => {
		it("adds two positive numbers", () => {
			expect(add(2, 3)).toBe(5);
		});

		it("adds negative numbers", () => {
			expect(add(-1, -2)).toBe(-3);
		});

		it("adds zero", () => {
			expect(add(0, 5)).toBe(5);
		});
	});

	describe("multiply", () => {
		it("multiplies two numbers", () => {
			expect(multiply(3, 4)).toBe(12);
		});

		it("multiplies by zero", () => {
			expect(multiply(5, 0)).toBe(0);
		});
	});

	describe("subtract", () => {
		it("should return the difference of two numbers", () => {
			expect(subtract(5, 3)).toBe(2);
		});
	});

	describe("fibonacci", () => {
		it("returns 0 for n=0", () => {
			expect(fibonacci(0)).toBe(0);
		});

		it("returns 1 for n=1", () => {
			expect(fibonacci(1)).toBe(1);
		});

		it("computes fibonacci(10)", () => {
			expect(fibonacci(10)).toBe(55);
		});
	});
});
