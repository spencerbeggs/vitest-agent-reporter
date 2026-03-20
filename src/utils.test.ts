/**
 * vitest-agent-reporter
 *
 * Tests for utility functions: compressLines, safeFilename, ansi/stripAnsi, isGitHubActions.
 */

import { describe, expect, it } from "vitest";
import {
	ansi,
	compressLines,
	detectEnvironment,
	isGitHubActions,
	safeFilename,
	stripAnsi,
	stripConsoleReporters,
} from "./utils.js";

describe("compressLines", () => {
	it("compresses mixed consecutive and non-consecutive lines", () => {
		expect(compressLines([1, 2, 3, 5, 10, 11, 12])).toBe("1-3,5,10-12");
	});

	it("returns non-consecutive lines as comma-separated", () => {
		expect(compressLines([1, 3, 5])).toBe("1,3,5");
	});

	it("returns empty string for empty array", () => {
		expect(compressLines([])).toBe("");
	});

	it("returns single line number as string", () => {
		expect(compressLines([42])).toBe("42");
	});

	it("compresses all-consecutive lines into a single range", () => {
		expect(compressLines([1, 2, 3, 4, 5])).toBe("1-5");
	});

	it("compresses two-element range", () => {
		expect(compressLines([1, 2])).toBe("1-2");
	});

	it("sorts unsorted input before compressing", () => {
		expect(compressLines([5, 1, 3, 2, 4])).toBe("1-5");
	});

	it("deduplicates before compressing", () => {
		expect(compressLines([1, 1, 2, 2, 3])).toBe("1-3");
	});
});

describe("safeFilename", () => {
	it("replaces slashes and colons with double underscores", () => {
		expect(safeFilename("@savvy-web/my-lib:unit")).toBe("@savvy-web__my-lib__unit");
	});

	it("passes through plain names unchanged", () => {
		expect(safeFilename("core")).toBe("core");
	});

	it("returns 'default' for empty string", () => {
		expect(safeFilename("")).toBe("default");
	});

	it("replaces multiple slashes and colons", () => {
		expect(safeFilename("a/b:c/d:e")).toBe("a__b__c__d__e");
	});
});

describe("ansi", () => {
	it("wraps text with ANSI codes when noColor is false", () => {
		const result = ansi("hello", "red", { noColor: false });
		expect(result).toContain("\x1b[");
		expect(result).toContain("hello");
	});

	it("returns plain text when noColor is true", () => {
		const result = ansi("hello", "red", { noColor: true });
		expect(result).toBe("hello");
	});

	it("wraps text when no options provided (defaults to color on)", () => {
		const result = ansi("hello", "bold");
		expect(result).toContain("\x1b[");
		expect(result).toContain("hello");
	});
});

describe("stripAnsi", () => {
	it("removes ANSI escape codes from text", () => {
		const colored = ansi("hello", "red", { noColor: false });
		expect(stripAnsi(colored)).toBe("hello");
	});

	it("passes through plain text unchanged", () => {
		expect(stripAnsi("plain text")).toBe("plain text");
	});
});

describe("isGitHubActions", () => {
	it("returns true when GITHUB_ACTIONS is 'true'", () => {
		expect(isGitHubActions({ GITHUB_ACTIONS: "true" })).toBe(true);
	});

	it("returns true when GITHUB_ACTIONS is '1'", () => {
		expect(isGitHubActions({ GITHUB_ACTIONS: "1" })).toBe(true);
	});

	it("returns false for empty env object", () => {
		expect(isGitHubActions({})).toBe(false);
	});

	it("returns false when GITHUB_ACTIONS is 'false'", () => {
		expect(isGitHubActions({ GITHUB_ACTIONS: "false" })).toBe(false);
	});
});

describe("detectEnvironment", () => {
	// Agent detection -- tool-specific vars
	it("returns 'agent' for AI_AGENT (emerging standard)", () => {
		expect(detectEnvironment({ AI_AGENT: "cursor" })).toBe("agent");
	});

	it("returns 'agent' for CLAUDECODE=1", () => {
		expect(detectEnvironment({ CLAUDECODE: "1" })).toBe("agent");
	});

	it("returns 'agent' for GEMINI_CLI=1", () => {
		expect(detectEnvironment({ GEMINI_CLI: "1" })).toBe("agent");
	});

	it("returns 'agent' for CURSOR_TRACE_ID", () => {
		expect(detectEnvironment({ CURSOR_TRACE_ID: "abc-123" })).toBe("agent");
	});

	it("returns 'agent' for CURSOR_AGENT=1", () => {
		expect(detectEnvironment({ CURSOR_AGENT: "1" })).toBe("agent");
	});

	it("returns 'agent' for CLINE_ACTIVE=true", () => {
		expect(detectEnvironment({ CLINE_ACTIVE: "true" })).toBe("agent");
	});

	it("returns 'agent' for CODEX_SANDBOX", () => {
		expect(detectEnvironment({ CODEX_SANDBOX: "seatbelt" })).toBe("agent");
	});

	it("returns 'agent' for AUGMENT_AGENT=1", () => {
		expect(detectEnvironment({ AUGMENT_AGENT: "1" })).toBe("agent");
	});

	it("returns 'agent' for AGENT (Goose, Amp, etc.)", () => {
		expect(detectEnvironment({ AGENT: "goose" })).toBe("agent");
	});

	// Agent takes priority over CI
	it("returns 'agent' even when CI is also set", () => {
		expect(detectEnvironment({ CLAUDECODE: "1", CI: "true" })).toBe("agent");
	});

	// CI detection
	it("returns 'ci' when GITHUB_ACTIONS is 'true'", () => {
		expect(detectEnvironment({ GITHUB_ACTIONS: "true" })).toBe("ci");
	});

	it("returns 'ci' when GITHUB_ACTIONS is '1'", () => {
		expect(detectEnvironment({ GITHUB_ACTIONS: "1" })).toBe("ci");
	});

	it("returns 'ci' when CI is 'true'", () => {
		expect(detectEnvironment({ CI: "true" })).toBe("ci");
	});

	// Human fallback
	it("returns 'human' for empty env", () => {
		expect(detectEnvironment({})).toBe("human");
	});

	it("returns 'human' when no agent/ci vars are set", () => {
		expect(detectEnvironment({ HOME: "/home/user" })).toBe("human");
	});
});

describe("stripConsoleReporters", () => {
	it("removes built-in console reporters by string name", () => {
		const result = stripConsoleReporters(["default", "verbose", "json"]);
		expect(result).toEqual(["json"]);
	});

	it("removes tuple-style console reporters", () => {
		const result = stripConsoleReporters([
			["default", {}],
			["json", { outputFile: "out.json" }],
		]);
		expect(result).toEqual([["json", { outputFile: "out.json" }]]);
	});

	it("keeps custom reporter instances", () => {
		const custom = { onInit() {} };
		const result = stripConsoleReporters(["default", custom]);
		expect(result).toEqual([custom]);
	});

	it("removes all known console reporters", () => {
		const consoleNames = ["default", "verbose", "tree", "dot", "tap", "tap-flat", "hanging-process", "agent"];
		const result = stripConsoleReporters([...consoleNames, "json", "junit"]);
		expect(result).toEqual(["json", "junit"]);
	});

	it("keeps non-console built-in reporters", () => {
		const result = stripConsoleReporters(["json", "junit", "html", "blob", "github-actions"]);
		expect(result).toEqual(["json", "junit", "html", "blob", "github-actions"]);
	});

	it("returns empty array when all are console reporters", () => {
		const result = stripConsoleReporters(["default"]);
		expect(result).toEqual([]);
	});
});
