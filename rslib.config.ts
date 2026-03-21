import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create({
	externals: ["vitest", "effect", "@effect/cli", "@effect/platform", "@effect/platform-node", "std-env"],
	transform({ pkg, target }) {
		if (target?.registry === "https://npm.pkg.github.com/") {
			pkg.name = "@spencerbeggs/vitest-agent-reporter";
		}
		delete pkg.devDependencies;
		delete pkg.bundleDependencies;
		delete pkg.scripts;
		delete pkg.publishConfig;
		delete pkg.packageManager;
		delete pkg.devEngines;
		return pkg;
	},
});
