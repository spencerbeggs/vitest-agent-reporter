import { VitestConfig } from "@savvy-web/vitest";
import { AgentPlugin } from "./package/src/plugin.js";

export default VitestConfig.create(({ projects, coverage, reporters }) => ({
	plugins: [AgentPlugin({ consoleStrategy: "own" })],
	test: {
		reporters,
		projects: projects.map((p) => p.toConfig()),
		coverage: {
			provider: "v8",
			...coverage,
			exclude: [
				...(coverage.exclude ?? []),
				"**/cli/commands/**",
				"**/cli/index.ts",
				"**/services/*.ts",
				"**/errors/*.ts",
			],
		},
	},
}));
