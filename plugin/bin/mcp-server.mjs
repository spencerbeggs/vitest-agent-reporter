#!/usr/bin/env node
/**
 * Plugin MCP server loader.
 *
 * Resolves and runs the `vitest-agent-reporter` MCP server from the user's
 * project. The package is resolved from the user's project — not bundled
 * with the plugin — because it has native dependencies (better-sqlite3)
 * that must match the user's platform/Node version.
 *
 * The search root is `process.env.CLAUDE_PROJECT_DIR` when set, falling
 * back to `process.cwd()`. When the plugin is installed via a Claude Code
 * marketplace, the plugin lives under `~/.claude/plugins/...` and the
 * MCP server's cwd at spawn time is unrelated to the user's project, so
 * `CLAUDE_PROJECT_DIR` is the only reliable anchor for finding the user's
 * `node_modules`.
 *
 * Fails fast with a clear stderr message if the package isn't installed,
 * which is more useful than `npx` silently downloading from npm and
 * potentially exceeding Claude Code's MCP startup window.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const PACKAGE_NAME = "vitest-agent-reporter";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const fail = (message) => {
	process.stderr.write(
		[
			"vitest-agent-reporter plugin: failed to locate the MCP server.",
			"",
			`Searched from: ${projectDir}`,
			`(source: ${process.env.CLAUDE_PROJECT_DIR ? "CLAUDE_PROJECT_DIR" : "process.cwd()"})`,
			"",
			"Install vitest-agent-reporter as a project dependency:",
			"  npm install --save-dev vitest-agent-reporter",
			"  pnpm add -D vitest-agent-reporter",
			"  yarn add -D vitest-agent-reporter",
			"  bun add -d vitest-agent-reporter",
			"",
			`Details: ${message}`,
			"",
		].join("\n"),
	);
	process.exit(1);
};

/**
 * Walk up from `startDir` looking for `node_modules/<packageName>`. Mirrors
 * Node's module resolution algorithm so it works for hoisted monorepo
 * installs (npm/pnpm/yarn/bun).
 */
const findPackageDir = (startDir, packageName) => {
	let dir = startDir;
	while (true) {
		const candidate = join(dir, "node_modules", packageName);
		if (existsSync(join(candidate, "package.json"))) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
};

const pkgDir = findPackageDir(projectDir, PACKAGE_NAME);
if (!pkgDir) {
	fail(`Could not find ${PACKAGE_NAME} in any node_modules above ${projectDir}.`);
}

let mcpFileUrl;
try {
	const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
	const mcpExport = pkg.exports?.["./mcp"];
	const mcpRel = typeof mcpExport === "string" ? mcpExport : (mcpExport?.import ?? mcpExport?.default ?? "./mcp.js");
	mcpFileUrl = pathToFileURL(join(pkgDir, mcpRel)).href;
} catch (err) {
	fail(`Could not read MCP entry from ${pkgDir}/package.json: ${err instanceof Error ? err.message : String(err)}`);
}

// Forward the resolved project root to the MCP server. Claude Code may not
// reliably propagate CLAUDE_PROJECT_DIR to MCP server subprocesses (only
// CLAUDE_PLUGIN_ROOT and CLAUDE_PLUGIN_DATA are documented to be exported),
// so we set our own variable that the server reads with priority.
process.env.VITEST_AGENT_REPORTER_PROJECT_DIR = projectDir;

await import(mcpFileUrl);
