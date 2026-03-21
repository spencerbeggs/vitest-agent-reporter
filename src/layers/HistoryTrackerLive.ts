import { Effect, Layer } from "effect";
import type { TestClassification } from "../schemas/Common.js";
import type { TestRun } from "../schemas/History.js";
import { CacheReader } from "../services/CacheReader.js";
import { HistoryTracker } from "../services/HistoryTracker.js";
import { classifyTest } from "../utils/classify-test.js";

interface MutableTestHistory {
	fullName: string;
	runs: Array<TestRun>;
}

const WINDOW_SIZE = 10;

export const HistoryTrackerLive: Layer.Layer<HistoryTracker, never, CacheReader> = Layer.effect(
	HistoryTracker,
	Effect.gen(function* () {
		const reader = yield* CacheReader;
		return {
			classify: (cacheDir, project, testOutcomes, timestamp) =>
				Effect.gen(function* () {
					const existing = yield* reader.readHistory(cacheDir, project);
					const testMap = new Map<string, MutableTestHistory>();
					for (const entry of existing.tests) {
						testMap.set(entry.fullName, { ...entry, runs: [...entry.runs] });
					}

					const classifications = new Map<string, TestClassification>();

					for (const outcome of testOutcomes) {
						let entry = testMap.get(outcome.fullName);
						if (!entry) {
							entry = { fullName: outcome.fullName, runs: [] };
							testMap.set(outcome.fullName, entry);
						}

						const priorRuns = entry.runs;
						entry.runs = [{ timestamp, state: outcome.state }, ...priorRuns].slice(0, WINDOW_SIZE);

						classifications.set(outcome.fullName, classifyTest(outcome.state, priorRuns));
					}

					return {
						history: {
							project,
							updatedAt: timestamp,
							tests: Array.from(testMap.values()),
						},
						classifications,
					};
				}),
		};
	}),
);
