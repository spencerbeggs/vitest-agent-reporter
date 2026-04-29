#!/usr/bin/env node
import { NodeContext } from "@effect/platform-node";
import { Effect, ManagedRuntime } from "effect";
import { resolveDbPath } from "../cli/lib/resolve-cache-dir.js";
import { resolveLogFile, resolveLogLevel } from "../layers/LoggerLive.js";
import { McpLive } from "../layers/McpLive.js";
import { formatFatalError } from "../utils/format-fatal-error.js";
import type { McpContext } from "./context.js";
import { startMcpServer } from "./server.js";

/**
 * Resolve the user's project directory.
 *
 * Precedence (most explicit wins):
 *
 * 1. `VITEST_AGENT_REPORTER_PROJECT_DIR` — set by the Claude Code plugin
 *    loader (`plugin/bin/mcp-server.mjs`) to the resolved project root.
 *    The loader controls this end-to-end so the value is reliable when
 *    set.
 * 2. `CLAUDE_PROJECT_DIR` — exported by Claude Code for hook scripts and
 *    (per docs hints) MCP server subprocesses. Used when the loader is
 *    bypassed (e.g. someone wires the MCP binary up manually).
 * 3. `process.cwd()` — fall-through for direct invocation outside Claude
 *    Code, where the user is presumably running from their project root.
 */
function resolveProjectDir(): string {
	return process.env.VITEST_AGENT_REPORTER_PROJECT_DIR ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

async function main() {
	const projectDir = resolveProjectDir();

	const dbPath = await Effect.runPromise(resolveDbPath(projectDir).pipe(Effect.provide(NodeContext.layer))).catch(
		() => `${projectDir}/.vitest-agent-reporter/data.db`,
	);

	const logLevel = resolveLogLevel();
	const logFile = resolveLogFile();

	const runtime = ManagedRuntime.make(McpLive(dbPath, logLevel, logFile));

	const ctx: McpContext = {
		runtime: runtime as unknown as McpContext["runtime"],
		cwd: projectDir,
	};

	console.error("[vitest-agent-reporter-mcp] Starting...");
	console.error(`[vitest-agent-reporter-mcp] Project: ${projectDir}`);
	console.error(`[vitest-agent-reporter-mcp] Database: ${dbPath}`);

	await startMcpServer(ctx);
}

main().catch((err) => {
	process.stderr.write(`vitest-agent-reporter-mcp: ${formatFatalError(err)}\n`);
	process.exit(1);
});
