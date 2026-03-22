import { Effect, Layer, Option } from "effect";
import { AgentDetection } from "../services/AgentDetection.js";

export const AgentDetectionTest = {
	layer: (env: "agent" | "ci" | "human", agentName?: string): Layer.Layer<AgentDetection> =>
		Layer.succeed(AgentDetection, {
			isAgent: Effect.succeed(env === "agent"),
			agentName: Effect.succeed(agentName ? Option.some(agentName) : Option.none()),
			isCI: Effect.succeed(env === "ci"),
			environment: Effect.succeed(env),
		}),
} as const;
