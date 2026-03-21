import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { CacheWriter } from "../services/CacheWriter.js";
import { CoverageAnalyzer } from "../services/CoverageAnalyzer.js";
import { ReporterLive } from "./ReporterLive.js";

describe("ReporterLive", () => {
	it("provides CacheWriter", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CacheWriter, () => Effect.succeed("ok")),
				ReporterLive,
			),
		);
		expect(result).toBe("ok");
	});

	it("provides CoverageAnalyzer", async () => {
		const result = await Effect.runPromise(
			Effect.provide(
				Effect.flatMap(CoverageAnalyzer, () => Effect.succeed("ok")),
				ReporterLive,
			),
		);
		expect(result).toBe("ok");
	});
});
