#!/usr/bin/env node
import { NodeContext } from "@effect/platform-node";
import { Effect, ManagedRuntime } from "effect";
import {
	PathResolutionLive,
	formatFatalError,
	resolveDataPath,
	resolveLogFile,
	resolveLogLevel,
} from "vitest-agent-sdk";
import type { McpContext } from "./context.js";
import { createCurrentSessionIdRef } from "./context.js";
import { McpLive } from "./layers/McpLive.js";
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

/**
 * Optional first positional argument: an initial Claude Code
 * `cc_session_id` to seed the MCP server's session association.
 *
 * The plugin manifest (`plugin/.claude-plugin/plugin.json`) can pass this
 * via Claude Code variable substitution if such a variable exists for
 * sessions (the documented substitutions are `${CLAUDE_PLUGIN_ROOT}` and
 * `${CLAUDE_PLUGIN_DATA}`; testing whether `${CLAUDE_SESSION_ID}` or a
 * similar name is honored in `mcpServers.args` is part of the reason
 * this seed path exists). When the seed is empty the agent is expected
 * to call `set_current_session_id` once at the start of the
 * conversation.
 */
function resolveInitialSessionId(): string | null {
	const argv = process.argv[2];
	if (argv === undefined) return null;
	const trimmed = argv.trim();
	if (trimmed.length === 0) return null;
	// Claude Code substitutes unknown ${...} variables to literal text in
	// some surfaces (e.g. ${UNKNOWN_VAR} -> "${UNKNOWN_VAR}"); guard against
	// a literal substitution arriving here so we don't seed garbage.
	if (trimmed.startsWith("${") && trimmed.endsWith("}")) return null;
	return trimmed;
}

async function main() {
	const projectDir = resolveProjectDir();
	const initialSessionId = resolveInitialSessionId();

	const dbPath = await Effect.runPromise(
		resolveDataPath(projectDir).pipe(Effect.provide(PathResolutionLive(projectDir)), Effect.provide(NodeContext.layer)),
	);

	const logLevel = resolveLogLevel();
	const logFile = resolveLogFile();

	const runtime = ManagedRuntime.make(McpLive(dbPath, logLevel, logFile));

	const ctx: McpContext = {
		runtime: runtime as unknown as McpContext["runtime"],
		cwd: projectDir,
		currentSessionId: createCurrentSessionIdRef(initialSessionId),
	};

	console.error("[vitest-agent-mcp] Starting...");
	console.error(`[vitest-agent-mcp] Project: ${projectDir}`);
	console.error(`[vitest-agent-mcp] Database: ${dbPath}`);
	console.error(
		`[vitest-agent-mcp] Initial session id: ${initialSessionId ?? "(none — agent will call set_current_session_id)"}`,
	);

	await startMcpServer(ctx);
}

main().catch((err) => {
	process.stderr.write(`vitest-agent-mcp: ${formatFatalError(err)}\n`);
	process.exit(1);
});
