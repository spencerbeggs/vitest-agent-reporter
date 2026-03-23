import { defineConfig } from "vitest/config";
import { AgentPlugin } from "./package/src/plugin.js";

export default defineConfig({
	plugins: [
		AgentPlugin({
			strategy: "own",
			mcp: true,
			reporter: {
				coverageThresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
				coverageTargets: { lines: 80, functions: 70, branches: 80, statements: 80 },
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
					include: ["package/src/**/*.{test,spec}.ts"],
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
			enabled: true,
			provider: "v8",
			include: ["package/src/**/*.ts", "examples/basic/src/**/*.ts"],
			exclude: [
				"**/*.{test,spec}.ts",
				"**/cli/commands/**",
				"**/cli/index.ts",
				"**/cli/lib/resolve-cache-dir.ts",
				"**/services/*.ts",
				"**/errors/*.ts",
				"**/sql/rows.ts",
				"**/sql/assemblers.ts",
				"**/migrations/**",
				"**/mcp/**",
				"**/layers/CliLive.ts",
				"**/layers/McpLive.ts",
				"**/layers/OutputPipelineLive.ts",
				"**/formatters/gfm.ts",
				"**/formatters/silent.ts",
			],
		},
	},
});
