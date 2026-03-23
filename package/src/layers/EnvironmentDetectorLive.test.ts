import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { EnvironmentDetector } from "../services/EnvironmentDetector.js";
import { EnvironmentDetectorLive } from "./EnvironmentDetectorLive.js";

const run = <A, E>(effect: Effect.Effect<A, E, EnvironmentDetector>) =>
	Effect.runPromise(Effect.provide(effect, EnvironmentDetectorLive));

describe("EnvironmentDetectorLive", () => {
	it("returns environment as one of the four types", async () => {
		const env = await run(Effect.flatMap(EnvironmentDetector, (d) => d.detect()));
		expect(["agent-shell", "terminal", "ci-github", "ci-generic"]).toContain(env);
	});

	it("provides isAgent as boolean", async () => {
		const result = await run(Effect.flatMap(EnvironmentDetector, (d) => d.isAgent));
		expect(typeof result).toBe("boolean");
	});

	it("provides agentName as string or undefined", async () => {
		const result = await run(Effect.flatMap(EnvironmentDetector, (d) => d.agentName));
		expect(result === undefined || typeof result === "string").toBe(true);
	});
});
