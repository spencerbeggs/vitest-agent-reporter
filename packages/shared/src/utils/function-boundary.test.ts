import { describe, expect, it } from "vitest";
import { findFunctionBoundary } from "./function-boundary.js";

describe("findFunctionBoundary", () => {
	it("returns null when target line is not inside a function", () => {
		const source = `const x = 1;\nconst y = 2;\n`;
		expect(findFunctionBoundary(source, 1)).toBeNull();
	});

	it("returns the function declaration's start line", () => {
		const source = ["const x = 1;", "function foo() {", "  return 42;", "}", ""].join("\n");
		// Line 3 is `  return 42;` — inside foo
		expect(findFunctionBoundary(source, 3)).toEqual({ line: 2, name: "foo" });
	});

	it("returns the smallest enclosing function in nested cases", () => {
		const source = [
			"function outer() {", // line 1
			"  function inner() {", // line 2
			"    return 1;", // line 3
			"  }", // line 4
			"  return inner();", // line 5
			"}", // line 6
		].join("\n");
		expect(findFunctionBoundary(source, 3)).toEqual({ line: 2, name: "inner" });
		expect(findFunctionBoundary(source, 5)).toEqual({ line: 1, name: "outer" });
	});

	it("handles arrow functions assigned to const", () => {
		const source = [
			"const handler = (req) => {", // line 1
			"  return req.body;", // line 2
			"};",
		].join("\n");
		expect(findFunctionBoundary(source, 2)).toEqual({ line: 1, name: "handler" });
	});

	it("returns null on parse error rather than throwing", () => {
		expect(findFunctionBoundary("function {{{ broken", 1)).toBeNull();
	});
});
