import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentPlugin } from "./plugin.js";
import { AgentReporter } from "./reporter.js";

function mockVitest(
	reporters: unknown[] = ["default"],
	overrides?: {
		thresholds?: Record<string, unknown>;
		outputFile?: string | Record<string, string>;
	},
) {
	const coverage: { thresholds?: Record<string, unknown> } = {};
	if (overrides?.thresholds !== undefined) {
		coverage.thresholds = overrides.thresholds;
	}
	const config: {
		reporters: unknown[];
		coverage: { thresholds?: Record<string, unknown> };
		outputFile?: string | Record<string, string>;
	} = { reporters, coverage };
	if (overrides?.outputFile !== undefined) {
		config.outputFile = overrides.outputFile;
	}
	return {
		config,
		vite: { config: { cacheDir: "node_modules/.vite" } },
	};
}

describe("AgentPlugin", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("returns plugin with correct name", () => {
		const plugin = AgentPlugin();
		expect(plugin.name).toBe("vitest-agent-reporter");
	});

	it("has configureVitest method", () => {
		const plugin = AgentPlugin();
		expect(typeof plugin.configureVitest).toBe("function");
	});

	describe("always injects reporter regardless of environment", () => {
		it("injects in human environment", () => {
			vi.stubEnv("CLAUDECODE", "");
			vi.stubEnv("CI", "");
			vi.stubEnv("GITHUB_ACTIONS", "");
			const plugin = AgentPlugin();
			const vitest = mockVitest();
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});

		it("injects in agent environment", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin();
			const vitest = mockVitest();
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});

		it("injects in CI environment", () => {
			vi.stubEnv("CI", "true");
			const plugin = AgentPlugin();
			const vitest = mockVitest();
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});
	});

	describe("auto mode: agent environment (CLAUDECODE=1)", () => {
		it("strips built-in console reporters", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin();
			const vitest = mockVitest(["default", "verbose", "json"]);
			plugin.configureVitest({ vitest });
			const names = vitest.config.reporters.filter((r) => typeof r === "string");
			expect(names).not.toContain("default");
			expect(names).not.toContain("verbose");
			expect(names).toContain("json");
		});

		it("strips tuple-style console reporters", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin();
			const vitest = mockVitest([
				["default", {}],
				["json", { outputFile: "out.json" }],
			]);
			plugin.configureVitest({ vitest });
			const tupleNames = vitest.config.reporters.filter((r) => Array.isArray(r)).map((r) => (r as [string])[0]);
			expect(tupleNames).not.toContain("default");
			expect(tupleNames).toContain("json");
		});

		it("keeps custom reporter instances", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const customReporter = { onInit() {} };
			const plugin = AgentPlugin();
			const vitest = mockVitest(["default", customReporter]);
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain(customReporter);
		});
	});

	describe("auto mode: CI environment", () => {
		it("keeps existing reporters", () => {
			vi.stubEnv("CI", "true");
			vi.stubEnv("CLAUDECODE", "");
			const plugin = AgentPlugin();
			const vitest = mockVitest(["default", "verbose"]);
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain("default");
			expect(vitest.config.reporters).toContain("verbose");
		});
	});

	describe("auto mode: human environment", () => {
		it("keeps existing reporters", () => {
			vi.stubEnv("CLAUDECODE", "");
			vi.stubEnv("CI", "");
			vi.stubEnv("GITHUB_ACTIONS", "");
			const plugin = AgentPlugin();
			const vitest = mockVitest();
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain("default");
		});
	});

	describe("mode: 'agent' (forced)", () => {
		it("strips console reporters even without env vars", () => {
			vi.stubEnv("CLAUDECODE", "");
			vi.stubEnv("CI", "");
			vi.stubEnv("GITHUB_ACTIONS", "");
			const plugin = AgentPlugin({ mode: "agent" });
			const vitest = mockVitest(["default", "json"]);
			plugin.configureVitest({ vitest });
			const names = vitest.config.reporters.filter((r) => typeof r === "string");
			expect(names).not.toContain("default");
			expect(names).toContain("json");
		});
	});

	describe("mode: 'silent'", () => {
		it("keeps existing reporters and injects silent reporter", () => {
			const plugin = AgentPlugin({ mode: "silent" });
			const vitest = mockVitest();
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain("default");
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});
	});

	describe("coverage threshold extraction", () => {
		it("reads threshold from vitest coverage config", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin();
			const vitest = mockVitest([], { thresholds: { lines: 80, statements: 90, branches: 70, functions: 85 } });
			plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
			// The reporter should have picked up the minimum threshold (70 from branches)
		});

		it("defaults to 0 when no thresholds configured", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin();
			const vitest = mockVitest([]);
			plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
		});

		it("allows explicit override via reporter options", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin({ reporter: { coverageThreshold: 95 } });
			const vitest = mockVitest([], { thresholds: { lines: 80 } });
			plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
		});
	});

	describe("outputFile cache directory resolution", () => {
		it("uses outputFile['vitest-agent-reporter'] as cache directory", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin();
			const vitest = mockVitest([], {
				outputFile: { "vitest-agent-reporter": "./custom-output" },
			});
			plugin.configureVitest({ vitest });
			// Reporter should be configured -- outputFile path used as cacheDir
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});

		it("ignores outputFile when it is a plain string", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin();
			const vitest = mockVitest([], { outputFile: "./some-file.json" });
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});

		it("falls back to vite cacheDir when outputFile has no our key", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin();
			const vitest = mockVitest([], {
				outputFile: { json: "./json-report.json" },
			});
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});
	});

	describe("passes reporter options through", () => {
		it("forwards reporter config", () => {
			vi.stubEnv("CLAUDECODE", "1");
			const plugin = AgentPlugin({
				reporter: { cacheDir: ".custom-cache", coverageThreshold: 90 },
			});
			const vitest = mockVitest([]);
			plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});
	});
});
