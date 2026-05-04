import { defineConfig } from "vitest/config";
import { AgentPlugin } from "vitest-agent-plugin";

export default defineConfig({
	plugins: [
		AgentPlugin({
			mode: "agent",
			strategy: "own",
			mcp: true,
			reporterOptions: {
				coverageThresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
				coverageTargets: { lines: 80, functions: 80, branches: 80, statements: 80 },
			},
		}),
	],
	test: {
		pool: "forks",
		projects: [
			{
				extends: true,
				test: {
					name: "vitest-agent-reporter",
					include: ["packages/reporter/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "vitest-agent-plugin",
					include: ["packages/plugin/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "vitest-agent-sdk",
					include: ["packages/sdk/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "vitest-agent-mcp",
					include: ["packages/mcp/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "vitest-agent-cli",
					include: ["packages/cli/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "playground",
					include: ["playground/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
		],
		coverage: {
			// On by default. Coverage instrumentation adds ~20% wall-clock
			// on this suite, but the per-run gap analysis is load-bearing
			// for the agent-facing terminal output (the threshold/target
			// summary line and the v8-style table only render when
			// coverage data is present), so the dev inner loop wants it.
			// Set to `false` (or pass `--no-coverage`) when running
			// individual tests where the report is just noise.
			enabled: true,
			provider: "v8",
			include: [
				"packages/reporter/src/**/*.ts",
				"packages/plugin/src/**/*.ts",
				"packages/sdk/src/**/*.ts",
				"packages/mcp/src/**/*.ts",
				"packages/cli/src/**/*.ts",
				"playground/src/**/*.ts",
			],
			exclude: [
				"**/*.{test,spec}.ts",
				// Bin entries and command glue
				"packages/cli/src/bin.ts",
				"packages/cli/src/commands/**",
				"packages/cli/src/index.ts",
				"packages/cli/src/layers/**",
				"packages/mcp/**",
				// Reporter and plugin glue
				"packages/reporter/src/index.ts",
				"packages/plugin/src/index.ts",
				"packages/plugin/src/reporter.ts",
				"packages/plugin/src/layers/**",
				// SDK composition layers and bundles with no testable logic
				"packages/sdk/src/services/*.ts",
				"packages/sdk/src/errors/*.ts",
				"packages/sdk/src/sql/rows.ts",
				"packages/sdk/src/sql/assemblers.ts",
				"packages/sdk/src/migrations/**",
				"packages/sdk/src/layers/OutputPipelineLive.ts",
				"packages/sdk/src/layers/PathResolutionLive.ts",
				"packages/sdk/src/layers/OutputRendererLive.ts",
				"packages/sdk/src/layers/EnvironmentDetectorLive.ts",
				"packages/sdk/src/layers/LoggerLive.ts",
				"packages/sdk/src/layers/DataStoreLive.ts",
				"packages/sdk/src/layers/DataStoreTest.ts",
				"packages/sdk/src/layers/DataReaderLive.ts",
				"packages/sdk/src/formatters/gfm.ts",
				"packages/sdk/src/formatters/silent.ts",
				"packages/sdk/src/formatters/markdown.ts",
				"packages/sdk/src/schemas/Thresholds.ts",
				"packages/sdk/src/schemas/Coverage.ts",
			],
		},
	},
});
