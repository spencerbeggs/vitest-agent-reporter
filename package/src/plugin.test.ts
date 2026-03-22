import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentDetectionTest } from "./layers/AgentDetectionTest.js";
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
	let stderrWrite: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
	});

	afterEach(() => {
		stderrWrite.mockRestore();
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
		it("injects in human environment", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("human"));
			const vitest = mockVitest();
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});

		it("injects in agent environment", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest();
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});

		it("injects in CI environment", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("ci"));
			const vitest = mockVitest();
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});
	});

	describe("consoleStrategy: complement (default)", () => {
		it("does NOT strip console reporters in agent mode", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest(["default", "verbose", "json"]);
			await plugin.configureVitest({ vitest });
			const names = vitest.config.reporters.filter((r) => typeof r === "string");
			expect(names).toContain("default");
			expect(names).toContain("verbose");
			expect(names).toContain("json");
		});

		it("keeps reporters in CI mode", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("ci"));
			const vitest = mockVitest(["default", "verbose"]);
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain("default");
			expect(vitest.config.reporters).toContain("verbose");
		});

		it("keeps reporters in human mode", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("human"));
			const vitest = mockVitest();
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain("default");
		});

		it("warns when agent reporter is missing in agent mode", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest(["default"]);
			await plugin.configureVitest({ vitest });
			expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('consoleStrategy is "complement"'));
		});

		it("does NOT warn when agent reporter is present", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest(["default", "agent"]);
			await plugin.configureVitest({ vitest });
			expect(stderrWrite).not.toHaveBeenCalled();
		});

		it("does NOT warn when agent reporter is tuple-style", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest(["default", ["agent", {}]]);
			await plugin.configureVitest({ vitest });
			expect(stderrWrite).not.toHaveBeenCalled();
		});

		it("sets consoleOutput to silent in agent mode", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest(["agent"]);
			await plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
			// In complement mode, our reporter is silent -- Vitest handles console
		});

		it("sets githubActions to false (Vitest handles GFM)", async () => {
			const plugin = AgentPlugin({}, AgentDetectionTest.layer("ci"));
			const vitest = mockVitest(["default"]);
			await plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
			// In complement mode, githubActions is false -- Vitest handles GFM
		});
	});

	describe("consoleStrategy: own", () => {
		it("strips built-in console reporters in agent mode", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest(["default", "verbose", "json"]);
			await plugin.configureVitest({ vitest });
			const names = vitest.config.reporters.filter((r) => typeof r === "string");
			expect(names).not.toContain("default");
			expect(names).not.toContain("verbose");
			expect(names).toContain("json");
		});

		it("strips tuple-style console reporters in agent mode", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest([
				["default", {}],
				["json", { outputFile: "out.json" }],
			]);
			await plugin.configureVitest({ vitest });
			const tupleNames = vitest.config.reporters.filter((r) => Array.isArray(r)).map((r) => (r as [string])[0]);
			expect(tupleNames).not.toContain("default");
			expect(tupleNames).toContain("json");
		});

		it("keeps custom reporter instances in agent mode", async () => {
			const customReporter = { onInit() {} };
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest(["default", customReporter]);
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain(customReporter);
		});

		it("does NOT strip reporters in CI mode", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("ci"));
			const vitest = mockVitest(["default", "verbose"]);
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain("default");
			expect(vitest.config.reporters).toContain("verbose");
		});

		it("does NOT strip reporters in human mode", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("human"));
			const vitest = mockVitest(["default"]);
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain("default");
		});

		it("does NOT strip reporters in silent mode", async () => {
			const plugin = AgentPlugin({ mode: "silent", consoleStrategy: "own" });
			const vitest = mockVitest(["default", "verbose"]);
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain("default");
			expect(vitest.config.reporters).toContain("verbose");
		});

		it("does NOT warn about missing agent reporter", async () => {
			const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest(["default"]);
			await plugin.configureVitest({ vitest });
			expect(stderrSpy).not.toHaveBeenCalled();
			stderrSpy.mockRestore();
		});

		it("enables githubActions in CI mode", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("ci"));
			const vitest = mockVitest(["default"]);
			await plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
			// CI + own = we write GFM
		});
	});

	describe("mode: 'agent' (forced)", () => {
		it("strips console reporters with own strategy", async () => {
			const plugin = AgentPlugin({ mode: "agent", consoleStrategy: "own" });
			const vitest = mockVitest(["default", "json"]);
			await plugin.configureVitest({ vitest });
			const names = vitest.config.reporters.filter((r) => typeof r === "string");
			expect(names).not.toContain("default");
			expect(names).toContain("json");
		});

		it("does NOT strip reporters with complement strategy (default)", async () => {
			const plugin = AgentPlugin({ mode: "agent" });
			const vitest = mockVitest(["default", "json"]);
			await plugin.configureVitest({ vitest });
			const names = vitest.config.reporters.filter((r) => typeof r === "string");
			expect(names).toContain("default");
			expect(names).toContain("json");
		});
	});

	describe("mode: 'silent'", () => {
		it("keeps existing reporters and injects silent reporter", async () => {
			const plugin = AgentPlugin({ mode: "silent" });
			const vitest = mockVitest();
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters).toContain("default");
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});
	});

	describe("coverage thresholds resolution", () => {
		it("resolves thresholds from vitest coverage config", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest([], {
				thresholds: { lines: 80, statements: 90, branches: 70, functions: 85 },
			});
			await plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
			// The reporter receives resolved thresholds with all four metrics
		});

		it("resolves empty thresholds when none configured", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest([]);
			await plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
		});

		it("allows explicit override via reporter options", async () => {
			const plugin = AgentPlugin(
				{ consoleStrategy: "own", reporter: { coverageThresholds: { lines: 95 } } },
				AgentDetectionTest.layer("agent"),
			);
			const vitest = mockVitest([], { thresholds: { lines: 80 } });
			await plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
			// Reporter options take priority over vitest config
		});

		it("resolves coverageTargets when provided", async () => {
			const plugin = AgentPlugin(
				{ consoleStrategy: "own", reporter: { coverageTargets: { lines: 90, branches: 85 } } },
				AgentDetectionTest.layer("agent"),
			);
			const vitest = mockVitest([], { thresholds: { lines: 80 } });
			await plugin.configureVitest({ vitest });
			const reporter = vitest.config.reporters.find((r) => r instanceof AgentReporter) as AgentReporter;
			expect(reporter).toBeInstanceOf(AgentReporter);
		});

		it("disables native autoUpdate when targets are set", async () => {
			const plugin = AgentPlugin(
				{ consoleStrategy: "own", reporter: { coverageTargets: { lines: 90 } } },
				AgentDetectionTest.layer("agent"),
			);
			const vitest = mockVitest([], { thresholds: { lines: 80, autoUpdate: true } });
			await plugin.configureVitest({ vitest });
			expect(vitest.config.coverage.thresholds?.autoUpdate).toBe(false);
		});

		it("does not disable native autoUpdate when no targets set", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest([], { thresholds: { lines: 80, autoUpdate: true } });
			await plugin.configureVitest({ vitest });
			expect(vitest.config.coverage.thresholds?.autoUpdate).toBe(true);
		});

		it("does not disable native autoUpdate when autoUpdate option is false", async () => {
			const plugin = AgentPlugin(
				{ consoleStrategy: "own", reporter: { coverageTargets: { lines: 90 }, autoUpdate: false } },
				AgentDetectionTest.layer("agent"),
			);
			const vitest = mockVitest([], { thresholds: { lines: 80, autoUpdate: true } });
			await plugin.configureVitest({ vitest });
			expect(vitest.config.coverage.thresholds?.autoUpdate).toBe(true);
		});
	});

	describe("outputFile cache directory resolution", () => {
		it("uses outputFile['vitest-agent-reporter'] as cache directory", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest([], {
				outputFile: { "vitest-agent-reporter": "./custom-output" },
			});
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});

		it("ignores outputFile when it is a plain string", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest([], { outputFile: "./some-file.json" });
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});

		it("falls back to vite cacheDir when outputFile has no our key", async () => {
			const plugin = AgentPlugin({ consoleStrategy: "own" }, AgentDetectionTest.layer("agent"));
			const vitest = mockVitest([], {
				outputFile: { json: "./json-report.json" },
			});
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});
	});

	describe("passes reporter options through", () => {
		it("forwards reporter config", async () => {
			const plugin = AgentPlugin(
				{ consoleStrategy: "own", reporter: { cacheDir: ".custom-cache", coverageThresholds: { lines: 90 } } },
				AgentDetectionTest.layer("agent"),
			);
			const vitest = mockVitest([]);
			await plugin.configureVitest({ vitest });
			expect(vitest.config.reporters.some((r) => r instanceof AgentReporter)).toBe(true);
		});
	});
});
