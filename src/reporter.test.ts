/**
 * vitest-agent-reporter
 *
 * Tests for AgentReporter class.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VitestTestCase, VitestTestModule } from "./formatters/json.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	writeFile: vi.fn().mockResolvedValue(undefined),
	appendFile: vi.fn().mockResolvedValue(undefined),
}));

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

/** Find a writeFile mock call whose first arg (file path) matches a predicate. */
function findWriteCall(writeFn: ReturnType<typeof vi.fn>, predicate: (path: string) => boolean): [string, string] {
	const call = writeFn.mock.calls.find((c: unknown[]) => typeof c[0] === "string" && predicate(c[0] as string));
	if (!call) throw new Error("Expected writeFile call not found");
	return [call[0] as string, call[1] as string];
}

// --- Tests ---

describe("AgentReporter", () => {
	let mkdir: ReturnType<typeof vi.fn>;
	let writeFile: ReturnType<typeof vi.fn>;
	let appendFile: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		const fs = await import("node:fs/promises");
		mkdir = fs.mkdir as ReturnType<typeof vi.fn>;
		writeFile = fs.writeFile as ReturnType<typeof vi.fn>;
		appendFile = fs.appendFile as ReturnType<typeof vi.fn>;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("applies default options", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter();

			// Exercise the reporter to verify defaults take effect
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");
			stdoutSpy.mockRestore();

			// Default cacheDir is ".vitest-agent-reporter" — check mkdir was called with it
			expect(mkdir).toHaveBeenCalledWith(expect.stringContaining(".vitest-agent-reporter"), { recursive: true });
		});

		it("accepts custom options", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({
				cacheDir: "custom-cache",
				consoleOutput: "silent",
				omitPassingTests: false,
				coverageThreshold: 90,
				coverageConsoleLimit: 5,
				includeBareZero: true,
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(mkdir).toHaveBeenCalledWith(expect.stringContaining("custom-cache"), { recursive: true });
		});
	});

	describe("onInit", () => {
		it("stores vitest instance", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter();
			const mockVitest = { projects: [] };

			reporter.onInit(mockVitest);

			expect(reporter._vitest).toBe(mockVitest);
		});
	});

	describe("onCoverage", () => {
		it("stashes coverage data and includes it in report", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({ consoleOutput: "silent" });
			const mockCoverage = {
				getCoverageSummary: () => ({
					statements: { pct: 90 },
					branches: { pct: 85 },
					functions: { pct: 88 },
					lines: { pct: 92 },
				}),
				files: () => [],
				fileCoverageFor: () => ({}),
			};

			reporter.onCoverage(mockCoverage);

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const [, content] = findWriteCall(writeFile, (p) => p.endsWith("default.json"));
			const report = JSON.parse(content);
			expect(report.coverage).toBeDefined();
			expect(report.coverage.totals.lines).toBe(92);
		});
	});

	describe("onTestRunEnd", () => {
		it("writes per-project JSON report file", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({ consoleOutput: "silent" });

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase({ state: "passed" })] })], [], "passed");

			const [, content] = findWriteCall(writeFile, (p) => p.includes("reports/"));
			const report = JSON.parse(content);
			expect(report.reason).toBe("passed");
			expect(report.summary.total).toBe(1);
		});

		it("writes manifest.json with correct entries", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({ consoleOutput: "silent" });

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			const [, content] = findWriteCall(writeFile, (p) => p.endsWith("manifest.json"));
			const manifest = JSON.parse(content);
			expect(manifest.cacheDir).toBe(".vitest-agent-reporter");
			expect(manifest.projects).toHaveLength(1);
			expect(manifest.projects[0].reportFile).toBe("reports/default.json");
			expect(manifest.projects[0].lastResult).toBe("passed");
		});

		it("groups modules by project and writes separate report files", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({ consoleOutput: "silent" });

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

			// Two report files + one manifest = 3 writeFile calls
			const reportWrites = writeFile.mock.calls.filter(
				(c: unknown[]) => typeof c[0] === "string" && (c[0] as string).includes("reports/"),
			);
			expect(reportWrites).toHaveLength(2);

			const filenames = reportWrites.map((c: unknown[]) => c[0] as string);
			expect(filenames.some((f: string) => f.includes("core.json"))).toBe(true);
			expect(filenames.some((f: string) => f.includes("api.json"))).toBe(true);

			// Multi-project reports include project name
			const [, coreContent] = findWriteCall(writeFile, (p) => p.includes("core.json"));
			const coreReport = JSON.parse(coreContent);
			expect(coreReport.project).toBe("core");
		});

		it("uses 'default' filename for single project with empty name", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({ consoleOutput: "silent" });

			await reporter.onTestRunEnd([makeTestModule({ projectName: "", tests: [makeTestCase()] })], [], "passed");

			const [path] = findWriteCall(writeFile, (p) => p.includes("reports/"));
			expect(path.endsWith("default.json")).toBe(true);
		});

		it("skips console output when consoleOutput is silent", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({ consoleOutput: "silent" });
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(stdoutSpy).not.toHaveBeenCalled();
			stdoutSpy.mockRestore();
		});

		it("writes console output when consoleOutput is failures", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({ consoleOutput: "failures" });
			const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(stdoutSpy).toHaveBeenCalled();
			stdoutSpy.mockRestore();
		});

		it("writes GFM when githubActions option is enabled", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({
				consoleOutput: "silent",
				githubActions: true,
				githubSummaryFile: "/tmp/summary.md",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(appendFile).toHaveBeenCalledWith("/tmp/summary.md", expect.stringContaining("Vitest Results"));
		});

		it("skips GFM when githubActions is false", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({
				consoleOutput: "silent",
				githubActions: false,
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(appendFile).not.toHaveBeenCalled();
		});

		it("creates cache directory structure", async () => {
			const { AgentReporter } = await import("./reporter.js");
			const reporter = new AgentReporter({
				cacheDir: ".test-cache",
				consoleOutput: "silent",
			});

			await reporter.onTestRunEnd([makeTestModule({ tests: [makeTestCase()] })], [], "passed");

			expect(mkdir).toHaveBeenCalledWith(expect.stringContaining(".test-cache"), { recursive: true });
		});
	});
});
