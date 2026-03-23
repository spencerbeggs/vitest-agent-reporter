import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { FormatSelector } from "../services/FormatSelector.js";
import { FormatSelectorLive } from "./FormatSelectorLive.js";

const run = <A, E>(effect: Effect.Effect<A, E, FormatSelector>) =>
	Effect.runPromise(Effect.provide(effect, FormatSelectorLive));

describe("FormatSelectorLive", () => {
	it("agent -> markdown by default", async () => {
		const result = await run(Effect.flatMap(FormatSelector, (s) => s.select("agent")));
		expect(result).toBe("markdown");
	});

	it("human -> silent by default", async () => {
		const result = await run(Effect.flatMap(FormatSelector, (s) => s.select("human")));
		expect(result).toBe("silent");
	});

	it("ci -> markdown by default", async () => {
		const result = await run(Effect.flatMap(FormatSelector, (s) => s.select("ci")));
		expect(result).toBe("markdown");
	});

	it("explicit format overrides default", async () => {
		const result = await run(Effect.flatMap(FormatSelector, (s) => s.select("human", "json")));
		expect(result).toBe("json");
	});

	it("vitest-bypass returns vitest-bypass", async () => {
		const result = await run(Effect.flatMap(FormatSelector, (s) => s.select("agent", "vitest-bypass")));
		expect(result).toBe("vitest-bypass");
	});
});
