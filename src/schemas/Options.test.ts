/**
 * vitest-agent-reporter
 *
 * Tests for Options schemas.
 */

import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { AgentPluginOptions, AgentReporterOptions, CoverageOptions, FormatterOptions } from "./Options.js";

describe("AgentReporterOptions", () => {
	it("decodes an empty object with all defaults", () => {
		const result = Schema.decodeUnknownSync(AgentReporterOptions)({});
		expect(result).toBeDefined();
	});

	it("decodes a fully specified object", () => {
		const input = {
			cacheDir: "/tmp/cache",
			consoleOutput: "full",
			omitPassingTests: false,
			coverageThreshold: 80,
			coverageConsoleLimit: 5,
			includeBareZero: true,
			githubActions: true,
			githubSummaryFile: "/tmp/summary.md",
		};
		const result = Schema.decodeUnknownSync(AgentReporterOptions)(input);
		expect(result.cacheDir).toBe("/tmp/cache");
		expect(result.consoleOutput).toBe("full");
		expect(result.omitPassingTests).toBe(false);
		expect(result.coverageThreshold).toBe(80);
		expect(result.coverageConsoleLimit).toBe(5);
		expect(result.includeBareZero).toBe(true);
		expect(result.githubActions).toBe(true);
		expect(result.githubSummaryFile).toBe("/tmp/summary.md");
	});

	it("rejects invalid consoleOutput value", () => {
		expect(() => Schema.decodeUnknownSync(AgentReporterOptions)({ consoleOutput: "verbose" })).toThrow();
	});
});

describe("AgentPluginOptions", () => {
	it("decodes an empty object with all defaults", () => {
		const result = Schema.decodeUnknownSync(AgentPluginOptions)({});
		expect(result).toBeDefined();
	});

	it("decodes a fully specified object", () => {
		const input = {
			mode: "agent",
			consoleStrategy: "own",
			reporter: {
				cacheDir: "/tmp/cache",
				omitPassingTests: true,
				coverageThreshold: 90,
				coverageConsoleLimit: 3,
				includeBareZero: false,
				githubSummaryFile: "/tmp/summary.md",
			},
		};
		const result = Schema.decodeUnknownSync(AgentPluginOptions)(input);
		expect(result.mode).toBe("agent");
		expect(result.consoleStrategy).toBe("own");
		expect(result.reporter?.cacheDir).toBe("/tmp/cache");
	});

	it("rejects invalid mode value", () => {
		expect(() => Schema.decodeUnknownSync(AgentPluginOptions)({ mode: "manual" })).toThrow();
	});

	it("rejects invalid consoleStrategy value", () => {
		expect(() => Schema.decodeUnknownSync(AgentPluginOptions)({ consoleStrategy: "both" })).toThrow();
	});
});

describe("CoverageOptions", () => {
	it("decodes a valid object", () => {
		const result = Schema.decodeUnknownSync(CoverageOptions)({
			threshold: 80,
			includeBareZero: false,
			coverageConsoleLimit: 10,
		});
		expect(result.threshold).toBe(80);
		expect(result.includeBareZero).toBe(false);
		expect(result.coverageConsoleLimit).toBe(10);
	});

	it("rejects missing required fields", () => {
		expect(() => Schema.decodeUnknownSync(CoverageOptions)({})).toThrow();
		expect(() => Schema.decodeUnknownSync(CoverageOptions)({ threshold: 80 })).toThrow();
	});
});

describe("FormatterOptions", () => {
	it("decodes a valid object", () => {
		const result = Schema.decodeUnknownSync(FormatterOptions)({
			consoleOutput: "failures",
			coverageConsoleLimit: 10,
			noColor: true,
			cacheFile: "/tmp/report.json",
		});
		expect(result.consoleOutput).toBe("failures");
		expect(result.coverageConsoleLimit).toBe(10);
		expect(result.noColor).toBe(true);
		expect(result.cacheFile).toBe("/tmp/report.json");
	});

	it("rejects missing required fields", () => {
		expect(() => Schema.decodeUnknownSync(FormatterOptions)({})).toThrow();
	});

	it("rejects invalid consoleOutput value", () => {
		expect(() =>
			Schema.decodeUnknownSync(FormatterOptions)({
				consoleOutput: "verbose",
				coverageConsoleLimit: 10,
				noColor: true,
				cacheFile: "/tmp/report.json",
			}),
		).toThrow();
	});
});
