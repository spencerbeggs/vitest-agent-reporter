import { defineConfig } from "vitest/config";
import { AgentPlugin } from "vitest-agent-reporter";

export default defineConfig({
	plugins: [
		AgentPlugin({
			mode: "agent",
			strategy: "own",
			mcp: true,
			reporter: {
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
					name: "vitest-agent-reporter-shared",
					include: ["packages/shared/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "vitest-agent-reporter-mcp",
					include: ["packages/mcp/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "vitest-agent-reporter-cli",
					include: ["packages/cli/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "example-basic",
					include: ["examples/basic/src/**/*.{test,spec}.ts"],
					exclude: ["**/*.e2e.{test,spec}.ts"],
				},
			},
		],
		coverage: {
			// Off by default for the dev inner loop. Enable via `--coverage`
			// (the `ci:test` script does this). Coverage instrumentation adds
			// ~20% wall-clock on this suite; flipping the default keeps
			// `pnpm run test` lean. Pass `--coverage` (or run `pnpm run
			// ci:test`) when you actually need a coverage report.
			enabled: true,
			provider: "v8",
			include: [
				"packages/reporter/src/**/*.ts",
				"packages/shared/src/**/*.ts",
				"packages/mcp/src/**/*.ts",
				"packages/cli/src/**/*.ts",
				"examples/basic/src/**/*.ts",
			],
			exclude: [
				"**/*.{test,spec}.ts",
				// Bin entries and command glue
				"packages/cli/src/bin.ts",
				"packages/cli/src/commands/**",
				"packages/cli/src/index.ts",
				"packages/cli/src/layers/**",
				"packages/mcp/**",
				// Reporter glue
				"packages/reporter/src/index.ts",
				"packages/reporter/src/reporter.ts",
				"packages/reporter/src/layers/**",
				// Shared composition layers and bundles with no testable logic
				"packages/shared/src/services/*.ts",
				"packages/shared/src/errors/*.ts",
				"packages/shared/src/sql/rows.ts",
				"packages/shared/src/sql/assemblers.ts",
				"packages/shared/src/migrations/**",
				"packages/shared/src/layers/OutputPipelineLive.ts",
				"packages/shared/src/layers/PathResolutionLive.ts",
				"packages/shared/src/layers/OutputRendererLive.ts",
				"packages/shared/src/layers/EnvironmentDetectorLive.ts",
				"packages/shared/src/layers/LoggerLive.ts",
				"packages/shared/src/layers/DataStoreLive.ts",
				"packages/shared/src/layers/DataStoreTest.ts",
				"packages/shared/src/layers/DataReaderLive.ts",
				"packages/shared/src/formatters/gfm.ts",
				"packages/shared/src/formatters/silent.ts",
				"packages/shared/src/formatters/markdown.ts",
				"packages/shared/src/schemas/Thresholds.ts",
				"packages/shared/src/schemas/Coverage.ts",
			],
		},
	},
});
