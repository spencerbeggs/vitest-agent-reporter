import { Effect, Layer } from "effect";
import type { Executor } from "../schemas/Common.js";
import { ExecutorResolver } from "../services/ExecutorResolver.js";

export const ExecutorResolverLive = Layer.succeed(ExecutorResolver, {
	resolve: (env, mode) =>
		Effect.succeed<Executor>(
			mode === "agent"
				? "agent"
				: mode === "silent"
					? "human"
					: env === "agent-shell"
						? "agent"
						: env === "terminal"
							? "human"
							: "ci",
		),
});
