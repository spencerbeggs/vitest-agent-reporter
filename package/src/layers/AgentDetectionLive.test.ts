import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { AgentDetection } from "../services/AgentDetection.js";
import { AgentDetectionLive } from "./AgentDetectionLive.js";
import { AgentDetectionTest } from "./AgentDetectionTest.js";

const run = <A>(env: "agent" | "ci" | "human", effect: Effect.Effect<A, never, AgentDetection>) =>
	Effect.runPromise(Effect.provide(effect, AgentDetectionTest.layer(env)));

describe("AgentDetection", () => {
	it("returns agent environment", async () => {
		const result = await run(
			"agent",
			Effect.flatMap(AgentDetection, (d) => d.environment),
		);
		expect(result).toBe("agent");
	});

	it("returns ci environment", async () => {
		const result = await run(
			"ci",
			Effect.flatMap(AgentDetection, (d) => d.environment),
		);
		expect(result).toBe("ci");
	});

	it("returns human environment", async () => {
		const result = await run(
			"human",
			Effect.flatMap(AgentDetection, (d) => d.environment),
		);
		expect(result).toBe("human");
	});

	it("isAgent is true for agent env", async () => {
		const result = await run(
			"agent",
			Effect.flatMap(AgentDetection, (d) => d.isAgent),
		);
		expect(result).toBe(true);
	});

	it("isAgent is false for human env", async () => {
		const result = await run(
			"human",
			Effect.flatMap(AgentDetection, (d) => d.isAgent),
		);
		expect(result).toBe(false);
	});

	it("isCI is true for ci env", async () => {
		const result = await run(
			"ci",
			Effect.flatMap(AgentDetection, (d) => d.isCI),
		);
		expect(result).toBe(true);
	});

	it("agentName returns name when provided", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(AgentDetection, (d) => d.agentName),
				AgentDetectionTest.layer("agent", "claude"),
			),
		);
		expect(Option.isSome(result)).toBe(true);
		expect(Option.getOrThrow(result)).toBe("claude");
	});

	it("agentName returns none when not provided", async () => {
		const result = await run(
			"agent",
			Effect.flatMap(AgentDetection, (d) => d.agentName),
		);
		expect(Option.isNone(result)).toBe(true);
	});
});

describe("AgentDetectionLive", () => {
	it("environment returns a valid value from live detection", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(AgentDetection, (d) => d.environment),
				AgentDetectionLive,
			),
		);
		expect(["agent", "ci", "human"]).toContain(result);
	});

	it("isAgent returns a boolean from live detection", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(AgentDetection, (d) => d.isAgent),
				AgentDetectionLive,
			),
		);
		expect(typeof result).toBe("boolean");
	});

	it("isCI returns a boolean from live detection", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(AgentDetection, (d) => d.isCI),
				AgentDetectionLive,
			),
		);
		expect(typeof result).toBe("boolean");
	});

	it("agentName returns an Option from live detection", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(AgentDetection, (d) => d.agentName),
				AgentDetectionLive,
			),
		);
		expect(Option.isOption(result)).toBe(true);
	});

	it("environment is consistent with isAgent and isCI", async () => {
		const env = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(AgentDetection, (d) => d.environment),
				AgentDetectionLive,
			),
		);
		const isAgentVal = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(AgentDetection, (d) => d.isAgent),
				AgentDetectionLive,
			),
		);
		const isCIVal = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(AgentDetection, (d) => d.isCI),
				AgentDetectionLive,
			),
		);

		if (env === "agent") {
			expect(isAgentVal).toBe(true);
		} else if (env === "ci") {
			expect(isAgentVal).toBe(false);
			expect(isCIVal).toBe(true);
		} else {
			expect(isAgentVal).toBe(false);
			expect(isCIVal).toBe(false);
		}
	});
});
