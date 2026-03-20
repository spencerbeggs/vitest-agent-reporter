import { VitestConfig } from "@savvy-web/vitest";
import { AgentPlugin } from "./src/plugin.js";

export default VitestConfig.create(({ projects, coverage, reporters }) => ({
	plugins: [AgentPlugin()],
	test: {
		reporters,
		projects: projects.map((p) => p.toConfig()),
		coverage: { provider: "v8", ...coverage },
	},
}));
