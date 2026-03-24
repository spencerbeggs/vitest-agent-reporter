#!/usr/bin/env node
import { NodeContext } from "@effect/platform-node";
import { Effect, ManagedRuntime } from "effect";
import { resolveDbPath } from "../cli/lib/resolve-cache-dir.js";
import { resolveLogFile, resolveLogLevel } from "../layers/LoggerLive.js";
import { McpLive } from "../layers/McpLive.js";
import type { McpContext } from "./context.js";
import { startMcpServer } from "./server.js";

async function main() {
	const dbPath = await Effect.runPromise(resolveDbPath.pipe(Effect.provide(NodeContext.layer))).catch(
		() => ".vitest-agent-reporter/data.db",
	);

	const logLevel = resolveLogLevel();
	const logFile = resolveLogFile();

	const runtime = ManagedRuntime.make(McpLive(dbPath, logLevel, logFile));

	const ctx: McpContext = {
		runtime: runtime as unknown as McpContext["runtime"],
		cwd: process.cwd(),
	};

	console.error("[vitest-agent-reporter-mcp] Starting...");
	console.error(`[vitest-agent-reporter-mcp] Database: ${dbPath}`);

	await startMcpServer(ctx);
}

main().catch((err) => {
	console.error("[vitest-agent-reporter-mcp] Fatal:", err);
	process.exit(1);
});
