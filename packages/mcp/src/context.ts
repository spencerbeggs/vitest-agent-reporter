import { initTRPC } from "@trpc/server";
import type { ManagedRuntime } from "effect";
import type { DataReader, DataStore, OutputRenderer, ProjectDiscovery } from "vitest-agent-sdk";

/**
 * Mutable holder for the MCP server's currently-associated Claude Code
 * `cc_session_id`.
 *
 * The MCP server is one process per Claude Code window, so a single in-
 * memory ref is enough — no cross-window contention to worry about. The
 * server starts with `current === null` (or with an id seeded from the
 * optional positional argv at startup); the agent calls
 * `set_current_session_id` once it knows its own id (or the SessionStart
 * hook tells it via `additionalContext`). Tools that take an optional
 * `ccSessionId` fall back to this value when the caller omits it.
 */
export interface CurrentSessionIdRef {
	get(): string | null;
	set(id: string | null): void;
}

export const createCurrentSessionIdRef = (initial: string | null = null): CurrentSessionIdRef => {
	let value: string | null = initial;
	return {
		get: () => value,
		set: (id) => {
			value = id;
		},
	};
};

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
	readonly currentSessionId: CurrentSessionIdRef;
}

const t = initTRPC.context<McpContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
/** Exported so middleware modules can attach to the same tRPC instance. */
export const middleware = t.middleware;
