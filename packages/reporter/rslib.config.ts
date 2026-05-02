import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create({
	externals: [
		"effect",
		"@effect/platform",
		"@effect/platform-node",
		"@effect/sql",
		"@effect/sql-sqlite-node",
		"vitest",
		"vitest/node",
		"vitest-agent-reporter-shared",
	],
	// Copy the SQLite-warning suppressor verbatim. It must remain a
	// separate file (not bundled) so the ESM module-evaluation order
	// is preserved when Vitest workers load it via setupFiles — the
	// suppressor's body runs before any test file imports `node:sqlite`.
	copyPatterns: [{ from: "src/install-sqlite-warning-suppressor.js", to: "install-sqlite-warning-suppressor.js" }],
	apiModel: {
		suppressWarnings: [{ messageId: "ae-forgotten-export", pattern: "_base" }],
	},
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
