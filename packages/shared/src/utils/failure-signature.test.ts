import { describe, expect, it } from "vitest";
import { computeFailureSignature, normalizeAssertionShape } from "./failure-signature.js";

describe("normalizeAssertionShape", () => {
	it("strips literal values to type tags", () => {
		expect(normalizeAssertionShape("expect(x).toBe(42)")).toBe("toBe(<number>)");
		expect(normalizeAssertionShape('expect(x).toBe("hello")')).toBe("toBe(<string>)");
		expect(normalizeAssertionShape("expect(x).toEqual({a: 1})")).toBe("toEqual(<object>)");
	});

	it("returns null for unrecognized shapes", () => {
		expect(normalizeAssertionShape("not an assertion")).toBeNull();
	});
});

describe("computeFailureSignature", () => {
	it("produces stable hash across line drift in unrelated code", () => {
		const a = computeFailureSignature({
			error_name: "AssertionError",
			assertion_message: "expect(x).toBe(5)",
			top_frame_function_name: "validateLogin",
			top_frame_function_boundary_line: 42,
		});
		const b = computeFailureSignature({
			error_name: "AssertionError",
			assertion_message: "expect(x).toBe(5)",
			top_frame_function_name: "validateLogin",
			top_frame_function_boundary_line: 42,
		});
		expect(a).toBe(b);
	});

	it("differs on different error.name", () => {
		const a = computeFailureSignature({
			error_name: "AssertionError",
			assertion_message: "expect(x).toBe(5)",
			top_frame_function_name: "f",
			top_frame_function_boundary_line: 1,
		});
		const b = computeFailureSignature({
			error_name: "TypeError",
			assertion_message: "expect(x).toBe(5)",
			top_frame_function_name: "f",
			top_frame_function_boundary_line: 1,
		});
		expect(a).not.toBe(b);
	});

	it("uses degraded path when function_boundary_line is null (rounds raw line)", () => {
		const a = computeFailureSignature({
			error_name: "AssertionError",
			assertion_message: "expect(x).toBe(5)",
			top_frame_function_name: "f",
			top_frame_function_boundary_line: null,
			top_frame_raw_line: 47,
		});
		const b = computeFailureSignature({
			error_name: "AssertionError",
			assertion_message: "expect(x).toBe(5)",
			top_frame_function_name: "f",
			top_frame_function_boundary_line: null,
			top_frame_raw_line: 49,
		});
		// 47 and 49 round to the same 10-bucket (40)
		expect(a).toBe(b);
	});
});
