import { Effect, Layer } from "effect";
import type { TestClassification } from "../schemas/Common.js";
import type { HistoryRecord } from "../schemas/History.js";
import { HistoryTracker } from "../services/HistoryTracker.js";

export interface HistoryTrackerTestState {
	readonly classifyCalls: Array<{
		cacheDir: string;
		project: string;
		timestamp: string;
	}>;
}

export const HistoryTrackerTest = {
	empty: (): HistoryTrackerTestState => ({
		classifyCalls: [],
	}),
	layer: (
		state: HistoryTrackerTestState,
		cannedResult?: {
			history: HistoryRecord;
			classifications: Map<string, TestClassification>;
		},
	): Layer.Layer<HistoryTracker> =>
		Layer.succeed(HistoryTracker, {
			classify: (cacheDir, project, _outcomes, timestamp) =>
				Effect.sync(() => {
					(state.classifyCalls as Array<{ cacheDir: string; project: string; timestamp: string }>).push({
						cacheDir,
						project,
						timestamp,
					});
					return (
						cannedResult ?? {
							history: { project, updatedAt: timestamp, tests: [] },
							classifications: new Map(),
						}
					);
				}),
		}),
} as const;
