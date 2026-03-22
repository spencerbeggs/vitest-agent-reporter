/**
 * vitest-agent-reporter
 *
 * Tests for AgentReporter class.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentReporter } from "./reporter.js";
import type { VitestTestCase, VitestTestModule } from "./utils/build-report.js";

// --- Test Helpers ---

function makeTestCase(
	overrides: Partial<{
		name: string;
		fullName: string;
		state: string;
		duration: number;
		flaky: boolean;
		slow: boolean;
		errors: Array<{ message: string; diff?: string; stacks?: string[] }>;
	}> = {},
): VitestTestCase {
	const name = overrides.name ?? "my test";
	return {
		type: "test",
		name,
		fullName: overrides.fullName ?? name,
		result: () => {
			const res: {
				state: string;
				errors?: ReadonlyArray<{ message: string; diff?: string; stacks?: string[] }>;
			} = { state: overrides.state ?? "passed" };
			if (overrides.errors != null) res.errors = overrides.errors;
			return res;
		},
		diagnostic: () => ({
			duration: overrides.duration ?? 10,
			flaky: overrides.flaky ?? false,
			slow: overrides.slow ?? false,
		}),
	};
}

function makeTestModule(
	overrides: Partial<{
		moduleId: string;
		relativeModuleId: string;
		projectName: string;
		state: string;
		duration: number;
		tests: VitestTestCase[];
		errors: Array<{ message: string; stacks?: string[] }>;
	}> = {},
): VitestTestModule {
	const relativeId = overrides.relativeModuleId ?? "src/foo.test.ts";
	const tests = overrides.tests ?? [];

	return {
		type: "module",
		moduleId: overrides.moduleId ?? `/abs/${relativeId}`,
		relativeModuleId: relativeId,
		project: { name: overrides.projectName ?? "" },
		state: () => overrides.state ?? "passed",
		children: {
			*allTests() {
				for (const t of tests) yield t;
			},
		},
		diagnostic: () => ({ duration: overrides.duration ?? 50 }),
		errors: () => overrides.errors ?? [],
	};
}

// --- Tests ---

describe("AgentReporter", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reporter-test-"));
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("applies default options", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			// Default behavior: reports dir and manifest created
			expect(fs.existsSync(path.join(tmpDir, "reports"))).toBe(true);
			expect(fs.existsSync(path.join(tmpDir, "manifest.json"))).toBe(true);
		});

		it("accepts custom options", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
				omitPassingTests: false,
				coverageThresholds: { global: { lines: 90 } } as Record<string, unknown>,
				coverageConsoleLimit: 5,
				includeBareZero: true,
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(fs.existsSync(path.join(tmpDir, "reports", "default.json"))).toBe(true);
		});
	});

	describe("onInit", () => {
		it("stores vitest instance", () => {
			const reporter = new AgentReporter();
			const mockVitest = { projects: [] };

			reporter.onInit(mockVitest);

			expect(reporter._vitest).toBe(mockVitest);
		});
	});

	describe("onCoverage", () => {
		it("stashes coverage data and includes it in report", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});
			const mockCoverage = {
				getCoverageSummary: () => ({
					statements: { pct: 90 },
					branches: { pct: 85 },
					functions: { pct: 88 },
					lines: { pct: 92 },
				}),
				files: () => [],
				fileCoverageFor: () => ({
					toSummary: () => ({
						statements: { pct: 90 },
						branches: { pct: 85 },
						functions: { pct: 88 },
						lines: { pct: 92 },
					}),
					getUncoveredLines: () => [],
				}),
			};

			reporter.onCoverage(mockCoverage);

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const reportPath = path.join(tmpDir, "reports", "default.json");
			const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
			expect(report.coverage).toBeDefined();
			expect(report.coverage.totals.lines).toBe(92);
		});
	});

	describe("baselines", () => {
		it("writes baselines when autoUpdate is enabled and coverage is present", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
				autoUpdate: true,
			});
			const mockCoverage = {
				getCoverageSummary: () => ({
					statements: { pct: 90 },
					branches: { pct: 85 },
					functions: { pct: 88 },
					lines: { pct: 92 },
				}),
				files: () => [],
				fileCoverageFor: () => ({
					toSummary: () => ({
						statements: { pct: 90 },
						branches: { pct: 85 },
						functions: { pct: 88 },
						lines: { pct: 92 },
					}),
					getUncoveredLines: () => [],
				}),
			};

			reporter.onCoverage(mockCoverage);
			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const baselinesPath = path.join(tmpDir, "baselines.json");
			expect(fs.existsSync(baselinesPath)).toBe(true);

			const baselines = JSON.parse(fs.readFileSync(baselinesPath, "utf-8"));
			expect(baselines.global.lines).toBe(92);
			expect(baselines.global.branches).toBe(85);
			expect(baselines.global.functions).toBe(88);
			expect(baselines.global.statements).toBe(90);
			expect(baselines.updatedAt).toBeDefined();
		});

		it("skips baselines when autoUpdate is false", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
				autoUpdate: false,
			});
			const mockCoverage = {
				getCoverageSummary: () => ({
					statements: { pct: 90 },
					branches: { pct: 85 },
					functions: { pct: 88 },
					lines: { pct: 92 },
				}),
				files: () => [],
				fileCoverageFor: () => ({
					toSummary: () => ({
						statements: { pct: 90 },
						branches: { pct: 85 },
						functions: { pct: 88 },
						lines: { pct: 92 },
					}),
					getUncoveredLines: () => [],
				}),
			};

			reporter.onCoverage(mockCoverage);
			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const baselinesPath = path.join(tmpDir, "baselines.json");
			expect(fs.existsSync(baselinesPath)).toBe(false);
		});

		it("ratchets baselines upward from previous values", async () => {
			// Write initial baselines with lower values
			fs.mkdirSync(tmpDir, { recursive: true });
			fs.writeFileSync(
				path.join(tmpDir, "baselines.json"),
				JSON.stringify({
					updatedAt: "2024-01-01T00:00:00.000Z",
					global: { lines: 80, branches: 70, functions: 75, statements: 78 },
					patterns: [],
				}),
			);

			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});
			const mockCoverage = {
				getCoverageSummary: () => ({
					statements: { pct: 72 },
					branches: { pct: 85 },
					functions: { pct: 60 },
					lines: { pct: 92 },
				}),
				files: () => [],
				fileCoverageFor: () => ({
					toSummary: () => ({
						statements: { pct: 72 },
						branches: { pct: 85 },
						functions: { pct: 60 },
						lines: { pct: 92 },
					}),
					getUncoveredLines: () => [],
				}),
			};

			reporter.onCoverage(mockCoverage);
			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const baselines = JSON.parse(fs.readFileSync(path.join(tmpDir, "baselines.json"), "utf-8"));
			// Should take max(actual, previous) for each metric
			expect(baselines.global.lines).toBe(92); // actual 92 > prev 80
			expect(baselines.global.branches).toBe(85); // actual 85 > prev 70
			expect(baselines.global.functions).toBe(75); // prev 75 > actual 60
			expect(baselines.global.statements).toBe(78); // prev 78 > actual 72
		});

		it("caps baselines at target values", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
				coverageTargets: { global: { lines: 85, branches: 80, functions: 80, statements: 80 } } as Record<
					string,
					unknown
				>,
			});
			const mockCoverage = {
				getCoverageSummary: () => ({
					statements: { pct: 90 },
					branches: { pct: 85 },
					functions: { pct: 88 },
					lines: { pct: 92 },
				}),
				files: () => [],
				fileCoverageFor: () => ({
					toSummary: () => ({
						statements: { pct: 90 },
						branches: { pct: 85 },
						functions: { pct: 88 },
						lines: { pct: 92 },
					}),
					getUncoveredLines: () => [],
				}),
			};

			reporter.onCoverage(mockCoverage);
			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const baselines = JSON.parse(fs.readFileSync(path.join(tmpDir, "baselines.json"), "utf-8"));
			// Should cap at target values
			expect(baselines.global.lines).toBe(85); // capped from 92
			expect(baselines.global.branches).toBe(80); // capped from 85
			expect(baselines.global.functions).toBe(80); // capped from 88
			expect(baselines.global.statements).toBe(80); // capped from 90
		});
	});

	describe("onTestRunEnd", () => {
		it("writes per-project JSON report file", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase({ state: "passed" })] })], [], "passed");

			const reportPath = path.join(tmpDir, "reports", "default.json");
			expect(fs.existsSync(reportPath)).toBe(true);
			const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
			expect(report.reason).toBe("passed");
			expect(report.summary.total).toBe(1);
		});

		it("writes manifest.json with correct entries", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const manifestPath = path.join(tmpDir, "manifest.json");
			expect(fs.existsSync(manifestPath)).toBe(true);
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
			expect(manifest.cacheDir).toBe(tmpDir);
			expect(manifest.projects).toHaveLength(1);
			expect(manifest.projects[0].reportFile).toBe("reports/default.json");
			expect(manifest.projects[0].lastResult).toBe("passed");
		});

		it("groups modules by project and writes separate report files", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			const moduleA = makeTestModule({
				relativeModuleId: "src/a.test.ts",
				projectName: "core",
				tests: [makeTestCase({ name: "core test" })],
			});
			const moduleB = makeTestModule({
				relativeModuleId: "src/b.test.ts",
				projectName: "api",
				tests: [makeTestCase({ name: "api test" })],
			});

			await reporter.onTestRunEnd([moduleA, moduleB], [], "passed");

			// Two report files should exist
			expect(fs.existsSync(path.join(tmpDir, "reports", "core.json"))).toBe(true);
			expect(fs.existsSync(path.join(tmpDir, "reports", "api.json"))).toBe(true);

			// Multi-project reports include project name
			const coreReport = JSON.parse(fs.readFileSync(path.join(tmpDir, "reports", "core.json"), "utf-8"));
			expect(coreReport.project).toBe("core");
		});

		it("uses 'default' filename for single project with empty name", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ projectName: "", tests: [makeTestCase()] })], [], "passed");

			expect(fs.existsSync(path.join(tmpDir, "reports", "default.json"))).toBe(true);
		});

		it("skips console output when consoleOutput is silent", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(stdoutSpy).not.toHaveBeenCalled();
			stdoutSpy.mockRestore();
		});

		it("writes console output when consoleOutput is failures", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "failures",
			});
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(stdoutSpy).toHaveBeenCalled();
			stdoutSpy.mockRestore();
		});

		it("writes GFM when githubActions option is enabled", async () => {
			const summaryFile = path.join(tmpDir, "summary.md");

			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
				githubActions: true,
				githubSummaryFile: summaryFile,
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(fs.existsSync(summaryFile)).toBe(true);
			const content = fs.readFileSync(summaryFile, "utf-8");
			expect(content).toContain("Vitest Results");
		});

		it("skips GFM when githubActions is false", async () => {
			const summaryFile = path.join(tmpDir, "summary.md");

			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
				githubActions: false,
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(fs.existsSync(summaryFile)).toBe(false);
		});

		it("creates cache directory structure", async () => {
			const cacheDir = path.join(tmpDir, "nested", "cache");
			const reporter = new AgentReporter({
				cacheDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(fs.existsSync(path.join(cacheDir, "reports"))).toBe(true);
			expect(fs.existsSync(path.join(cacheDir, "manifest.json"))).toBe(true);
		});

		it("attaches unhandledErrors to all project reports (bug fix)", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});
			const errors = [{ message: "unhandled error", stacks: [] }];

			const moduleA = makeTestModule({
				relativeModuleId: "src/a.test.ts",
				projectName: "core",
				tests: [makeTestCase()],
			});
			const moduleB = makeTestModule({
				relativeModuleId: "src/b.test.ts",
				projectName: "api",
				tests: [makeTestCase()],
			});

			await reporter.onTestRunEnd([moduleA, moduleB], errors, "failed");

			const coreReport = JSON.parse(fs.readFileSync(path.join(tmpDir, "reports", "core.json"), "utf-8"));
			const apiReport = JSON.parse(fs.readFileSync(path.join(tmpDir, "reports", "api.json"), "utf-8"));

			expect(coreReport.unhandledErrors).toHaveLength(1);
			expect(apiReport.unhandledErrors).toHaveLength(1);
		});
	});

	describe("trend recording", () => {
		it("records trend entry on full run with coverage", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});
			const mockCoverage = {
				getCoverageSummary: () => ({
					statements: { pct: 90 },
					branches: { pct: 85 },
					functions: { pct: 88 },
					lines: { pct: 92 },
				}),
				files: () => [],
				fileCoverageFor: () => ({
					toSummary: () => ({
						statements: { pct: 90 },
						branches: { pct: 85 },
						functions: { pct: 88 },
						lines: { pct: 92 },
					}),
					getUncoveredLines: () => [],
				}),
			};

			reporter.onCoverage(mockCoverage);
			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const trendsPath = path.join(tmpDir, "trends", "default.trends.json");
			expect(fs.existsSync(trendsPath)).toBe(true);

			const trends = JSON.parse(fs.readFileSync(trendsPath, "utf-8"));
			expect(trends.entries).toHaveLength(1);
			expect(trends.entries[0].coverage.lines).toBe(92);
			expect(trends.entries[0].coverage.branches).toBe(85);
			expect(trends.entries[0].direction).toBe("stable");
		});

		it("skips trend recording when no coverage is present", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const trendsPath = path.join(tmpDir, "trends", "default.trends.json");
			expect(fs.existsSync(trendsPath)).toBe(false);
		});
	});

	describe("history integration", () => {
		it("writes history file alongside report", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			const passingTest = makeTestCase({ name: "passes", fullName: "Suite > passes", state: "passed" });
			const failingTest = makeTestCase({
				name: "fails",
				fullName: "Suite > fails",
				state: "failed",
				errors: [{ message: "expected true to be false" }],
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [passingTest, failingTest] })], [], "failed");

			const historyPath = path.join(tmpDir, "history", "default.history.json");
			expect(fs.existsSync(historyPath)).toBe(true);

			const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
			expect(history.project).toBe("default");
			expect(history.tests).toHaveLength(2);

			const testNames = history.tests.map((t: { fullName: string }) => t.fullName);
			expect(testNames).toContain("Suite > passes");
			expect(testNames).toContain("Suite > fails");
		});

		it("attaches classifications to failed test reports", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			const failingTest = makeTestCase({
				name: "fails",
				fullName: "Suite > fails",
				state: "failed",
				errors: [{ message: "expected true to be false" }],
			});

			await reporter.onTestRunEnd(
				[
					makeTestModule({
						state: "failed",
						tests: [failingTest],
					}),
				],
				[],
				"failed",
			);

			const reportPath = path.join(tmpDir, "reports", "default.json");
			const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

			expect(report.failed).toHaveLength(1);
			expect(report.failed[0].tests).toHaveLength(1);
			expect(report.failed[0].tests[0].classification).toBe("new-failure");
		});

		it("populates historyFile in manifest entries", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const manifestPath = path.join(tmpDir, "manifest.json");
			const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

			expect(manifest.projects[0].historyFile).toBe("history/default.history.json");
		});
	});
});
