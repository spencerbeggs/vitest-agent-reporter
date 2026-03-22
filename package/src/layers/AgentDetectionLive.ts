import { Effect, Layer, Option } from "effect";
import { agent, isAgent } from "std-env";
import { AgentDetection } from "../services/AgentDetection.js";

const checkCI = (): boolean =>
	process.env.GITHUB_ACTIONS === "true" || process.env.GITHUB_ACTIONS === "1" || process.env.CI === "true";

export const AgentDetectionLive: Layer.Layer<AgentDetection> = Layer.succeed(AgentDetection, {
	isAgent: Effect.sync(() => isAgent),
	agentName: Effect.sync(() => (agent ? Option.some(agent) : Option.none())),
	isCI: Effect.sync(checkCI),
	environment: Effect.sync(() => {
		if (isAgent) return "agent" as const;
		if (checkCI()) return "ci" as const;
		return "human" as const;
	}),
});
