import { initTRPC } from "@trpc/server";
import type { ManagedRuntime } from "effect";
import type { DataReader } from "../services/DataReader.js";
import type { DataStore } from "../services/DataStore.js";
import type { OutputRenderer } from "../services/OutputRenderer.js";
import type { ProjectDiscovery } from "../services/ProjectDiscovery.js";

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
