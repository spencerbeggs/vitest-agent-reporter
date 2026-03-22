import type { Effect, Option } from "effect";
import { Context } from "effect";

export class AgentDetection extends Context.Tag("vitest-agent-reporter/AgentDetection")<
	AgentDetection,
	{
		readonly isAgent: Effect.Effect<boolean>;
		readonly agentName: Effect.Effect<Option.Option<string>>;
		readonly isCI: Effect.Effect<boolean>;
		readonly environment: Effect.Effect<"agent" | "ci" | "human">;
	}
>() {}
