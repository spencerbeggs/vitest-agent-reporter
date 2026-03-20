import { describe, expect, it } from "vitest";
import type { Foo } from "./index.js";
import { Bar } from "./index.js";

describe("Bar class", () => {
	it("should create an instance of Bar", () => {
		const bar = new Bar();
		const result: Foo = bar.qux();
		expect(result).toEqual({ baz: 42 });
	});
});
