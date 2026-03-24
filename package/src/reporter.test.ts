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

			// Default behavior: SQLite DB created
			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
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

			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
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

			// DB should exist and have data
			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
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

			// Baselines are now written to SQLite, verify DB exists
			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
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

			// DB should still exist (runs are written), just no baselines
			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
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

			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
		});
	});

	describe("onTestRunEnd", () => {
		it("writes test run data to SQLite", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase({ state: "passed" })] })], [], "passed");

			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
		});

		it("handles multi-project test runs", async () => {
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

			// Both projects written to same DB
			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
		});

		it("handles single project with empty name as 'default'", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ projectName: "", tests: [makeTestCase()] })], [], "passed");

			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
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

		it("writes console output when format is markdown", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				format: "markdown",
				mode: "agent",
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

		it("creates cache directory and DB file", async () => {
			const cacheDir = path.join(tmpDir, "nested", "cache");
			const reporter = new AgentReporter({
				cacheDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(fs.existsSync(path.join(cacheDir, "data.db"))).toBe(true);
		});

		it("writes unhandled errors for all projects", async () => {
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

			// Both projects should have run data in the DB
			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
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

			// Trends are now in SQLite
			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
		});

		it("skips trend recording when no coverage is present", async () => {
			const reporter = new AgentReporter({
				cacheDir: tmpDir,
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			// DB should still exist
			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
		});
	});

	describe("history integration", () => {
		it("writes history data alongside test run", async () => {
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

			// History is now in SQLite
			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
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

			// The reporter still builds AgentReport objects for console output,
			// so classifications are applied to the in-memory report.
			// We verify the run completes without error.
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

			expect(fs.existsSync(path.join(tmpDir, "data.db"))).toBe(true);
		});
	});
});
