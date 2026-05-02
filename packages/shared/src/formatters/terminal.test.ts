import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentReport } from "../schemas/AgentReport.js";
import { TerminalFormatter } from "./terminal.js";

const reportWithFailingTest = (): AgentReport => ({
	timestamp: new Date().toISOString(),
	reason: "failed",
	project: "demo",
	summary: { total: 1, passed: 0, failed: 1, skipped: 0, duration: 50 },
	failed: [
		{
			file: path.resolve(process.cwd(), "src/foo.test.ts"),
			state: "failed",
			tests: [
				{
					name: "does the thing",
					fullName: "Suite > does the thing",
					state: "failed",
					errors: [{ message: "expected ValidationError" }],
				},
			],
		},
	],
	unhandledErrors: [],
	failedFiles: ["src/foo.test.ts"],
});

describe("TerminalFormatter", () => {
	it("has format 'terminal'", () => {
		expect(TerminalFormatter.format).toBe("terminal");
	});

	it("emits OSC-8 hyperlinks with absolute file:// targets for failing test rows", () => {
		const outputs = TerminalFormatter.render([reportWithFailingTest()], {
			detail: "verbose",
			noColor: false,
			coverageConsoleLimit: 10,
		});
		expect(outputs).toHaveLength(1);
		const content = outputs[0].content;
		// OSC-8 sequence: ESC ] 8 ; ; <url> ESC \ <label> ESC ] 8 ; ; ESC \
		// File-URL paths must be absolute per RFC 8089 — three slashes
		// after `file:` confirms the leading `/` of an absolute path.
		expect(content).toContain("file:///");
		// Label keeps the project-relative path; only the link target
		// is absolute.
		expect(content).toContain("src/foo.test.ts");
	});

	it("does not emit OSC-8 escapes when noColor is set", () => {
		const outputs = TerminalFormatter.render([reportWithFailingTest()], {
			detail: "verbose",
			noColor: true,
			coverageConsoleLimit: 10,
		});
		// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC literally
		expect(outputs[0].content).not.toMatch(/\x1b\]8;/);
	});
});
