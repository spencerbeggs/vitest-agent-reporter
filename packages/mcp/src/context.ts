import { initTRPC } from "@trpc/server";
import type { ManagedRuntime } from "effect";
import type { DataReader, DataStore, OutputRenderer, ProjectDiscovery } from "vitest-agent-reporter-shared";

/**
 * tRPC context carrying a ManagedRuntime for Effect service access.
 *
 * The MCP server creates a ManagedRuntime at startup (long-lived
 * process) and passes it through tRPC context so procedures can
 * call Effect services via `ctx.runtime.runPromise(effect)`.
 */
export interface McpContext {
	readonly runtime: ManagedRuntime.ManagedRuntime<DataReader | DataStore | ProjectDiscovery | OutputRenderer, never>;
	readonly cwd: string;
}

const t = initTRPC.context<McpContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
/** Exported so middleware modules can attach to the same tRPC instance. */
export const middleware = t.middleware;
