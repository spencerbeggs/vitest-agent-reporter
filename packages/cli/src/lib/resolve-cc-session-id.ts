/**
 * Resolve the active Claude Code session id for a CLI invocation.
 *
 * Hook scripts always pass `--cc-session-id` explicitly because they read it
 * from the hook envelope JSON; this resolver returns that value unchanged
 * when present. When omitted (the agent invokes the CLI from Bash and has no
 * way to know its own session id), the resolver falls back to the per-
 * workspace pointer file written by SessionStart and cleared by SessionEnd.
 *
 * Returns `null` when neither source yields a session id; callers decide
 * whether absence is fatal or recoverable.
 *
 * @packageDocumentation
 */

import { NodeContext } from "@effect/platform-node";
import { Effect } from "effect";
import { PathResolutionLive, readSessionPointer, resolveDataPath } from "vitest-agent-reporter-shared";

export interface ResolveCcSessionIdInput {
	readonly explicit?: string | undefined;
	readonly projectDir?: string | undefined;
}

/**
 * Resolves to the explicit value when given, else the pointer file's contents,
 * else `null`. Provides its own `PathResolutionLive + NodeContext` layers so
 * callers (CLI commands and unit tests) can run it standalone without
 * threading the path-resolution stack through every invocation site.
 *
 * @internal — exposed so commands can detect "no session id available" before
 * they invoke the lib effect that requires one.
 */
export const resolveCcSessionId = (input: ResolveCcSessionIdInput) => {
	const projectDir = input.projectDir ?? process.cwd();
	return Effect.gen(function* () {
		if (input.explicit && input.explicit.length > 0) return input.explicit;
		const dbPath = yield* resolveDataPath(projectDir);
		return readSessionPointer(dbPath);
	}).pipe(Effect.provide(PathResolutionLive(projectDir)), Effect.provide(NodeContext.layer));
};
