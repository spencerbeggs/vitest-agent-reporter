import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";
import type { HistoryRecord } from "../schemas/History.js";
import { HistoryTracker } from "../services/HistoryTracker.js";
import { CacheReaderTest } from "./CacheReaderTest.js";
import { HistoryTrackerLive } from "./HistoryTrackerLive.js";

function makeLayer(historyData: Map<string, string> = new Map()) {
	return HistoryTrackerLive.pipe(Layer.provide(CacheReaderTest.layer(historyData)));
}

function run<A, E>(effect: Effect.Effect<A, E, HistoryTracker>, historyData: Map<string, string> = new Map()) {
	return Effect.runPromise(Effect.provide(effect, makeLayer(historyData)));
}

const CACHE_DIR = "/cache";
const PROJECT = "default";
const TS = "2026-03-21T00:00:00.000Z";

function historyKey(project: string) {
	return `${CACHE_DIR}/history/${project}.history.json`;
}

function seedHistory(record: HistoryRecord): Map<string, string> {
	const data = new Map<string, string>();
	data.set(historyKey(record.project), JSON.stringify(Schema.encodeUnknownSync(Schema.Unknown)(record)));
	return data;
}

describe("HistoryTrackerLive", () => {
	describe("stable -- all passing, no prior history", () => {
		it("classifies passing tests with no prior history as stable", async () => {
			const outcomes = [{ fullName: "Suite > test one", state: "passed" as const }];

			const result = await run(Effect.flatMap(HistoryTracker, (svc) => svc.classify(CACHE_DIR, PROJECT, outcomes, TS)));

			expect(result.classifications.get("Suite > test one")).toBe("stable");
		});

		it("classifies passing tests with all prior runs passed as stable", async () => {
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > test one",
						runs: [
							{ timestamp: "2026-03-19T00:00:00.000Z", state: "passed" },
							{ timestamp: "2026-03-18T00:00:00.000Z", state: "passed" },
						],
					},
				],
			};

			const result = await run(
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > test one", state: "passed" }], TS),
				),
				seedHistory(existing),
			);

			expect(result.classifications.get("Suite > test one")).toBe("stable");
		});
	});

	describe("new-failure -- failing with no prior history", () => {
		it("classifies failing test with no prior runs as new-failure", async () => {
			const outcomes = [{ fullName: "Suite > broken test", state: "failed" as const }];

			const result = await run(Effect.flatMap(HistoryTracker, (svc) => svc.classify(CACHE_DIR, PROJECT, outcomes, TS)));

			expect(result.classifications.get("Suite > broken test")).toBe("new-failure");
		});
	});

	describe("new-failure -- failing when all prior runs were passed", () => {
		it("classifies failing test as new-failure when all prior runs passed", async () => {
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > now failing",
						runs: [
							{ timestamp: "2026-03-19T00:00:00.000Z", state: "passed" },
							{ timestamp: "2026-03-18T00:00:00.000Z", state: "passed" },
							{ timestamp: "2026-03-17T00:00:00.000Z", state: "passed" },
						],
					},
				],
			};

			const result = await run(
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > now failing", state: "failed" }], TS),
				),
				seedHistory(existing),
			);

			expect(result.classifications.get("Suite > now failing")).toBe("new-failure");
		});
	});

	describe("persistent -- failing when prior run also failed", () => {
		it("classifies failing test as persistent when most recent prior run also failed", async () => {
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > persistent failure",
						runs: [
							{ timestamp: "2026-03-19T00:00:00.000Z", state: "failed" },
							{ timestamp: "2026-03-18T00:00:00.000Z", state: "passed" },
						],
					},
				],
			};

			const result = await run(
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > persistent failure", state: "failed" }], TS),
				),
				seedHistory(existing),
			);

			expect(result.classifications.get("Suite > persistent failure")).toBe("persistent");
		});

		it("classifies failing test as persistent when all prior runs also failed", async () => {
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > always fails",
						runs: [
							{ timestamp: "2026-03-19T00:00:00.000Z", state: "failed" },
							{ timestamp: "2026-03-18T00:00:00.000Z", state: "failed" },
						],
					},
				],
			};

			const result = await run(
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > always fails", state: "failed" }], TS),
				),
				seedHistory(existing),
			);

			expect(result.classifications.get("Suite > always fails")).toBe("persistent");
		});
	});

	describe("flaky -- failing with mixed prior history", () => {
		it("classifies failing test as flaky when prior history is mixed (pass then fail)", async () => {
			// priorRuns[0] = most recent prior = passed, but there's also a failure
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > flaky test",
						runs: [
							{ timestamp: "2026-03-19T00:00:00.000Z", state: "passed" },
							{ timestamp: "2026-03-18T00:00:00.000Z", state: "failed" },
							{ timestamp: "2026-03-17T00:00:00.000Z", state: "passed" },
						],
					},
				],
			};

			const result = await run(
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > flaky test", state: "failed" }], TS),
				),
				seedHistory(existing),
			);

			// priorRuns[0].state = "passed" (not failed), and there are prior failures => flaky
			expect(result.classifications.get("Suite > flaky test")).toBe("flaky");
		});
	});

	describe("recovered -- passing with prior failures", () => {
		it("classifies passing test as recovered when prior history has failures", async () => {
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > recovered test",
						runs: [
							{ timestamp: "2026-03-19T00:00:00.000Z", state: "failed" },
							{ timestamp: "2026-03-18T00:00:00.000Z", state: "passed" },
						],
					},
				],
			};

			const result = await run(
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > recovered test", state: "passed" }], TS),
				),
				seedHistory(existing),
			);

			expect(result.classifications.get("Suite > recovered test")).toBe("recovered");
		});
	});

	describe("window pruning", () => {
		it("prunes history to max 10 entries", async () => {
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > stable test",
						runs: Array.from({ length: 10 }, (_, i) => ({
							timestamp: `2026-03-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`,
							state: "passed" as const,
						})),
					},
				],
			};

			const result = await run(
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > stable test", state: "passed" }], TS),
				),
				seedHistory(existing),
			);

			const testHistory = result.history.tests.find((t) => t.fullName === "Suite > stable test");
			expect(testHistory).toBeDefined();
			if (!testHistory) return;
			expect(testHistory.runs).toHaveLength(10);
			// The newest run should be the current one
			expect(testHistory.runs[0].timestamp).toBe(TS);
		});

		it("keeps at most 10 entries when starting from 9 prior runs", async () => {
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > test",
						runs: Array.from({ length: 9 }, (_, i) => ({
							timestamp: `2026-03-${String(10 + i).padStart(2, "0")}T00:00:00.000Z`,
							state: "passed" as const,
						})),
					},
				],
			};

			const result = await run(
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > test", state: "passed" }], TS),
				),
				seedHistory(existing),
			);

			const testHistory = result.history.tests.find((t) => t.fullName === "Suite > test");
			expect(testHistory).toBeDefined();
			if (!testHistory) return;
			expect(testHistory.runs).toHaveLength(10);
		});
	});

	describe("new test not in existing history", () => {
		it("correctly classifies a brand new test not previously tracked", async () => {
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > existing test",
						runs: [{ timestamp: "2026-03-19T00:00:00.000Z", state: "passed" }],
					},
				],
			};

			const result = await run(
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > brand new test", state: "passed" }], TS),
				),
				seedHistory(existing),
			);

			expect(result.classifications.get("Suite > brand new test")).toBe("stable");
			const newEntry = result.history.tests.find((t) => t.fullName === "Suite > brand new test");
			expect(newEntry).toBeDefined();
			if (!newEntry) return;
			expect(newEntry.runs).toHaveLength(1);
		});
	});

	describe("existing tests not in current run stay in history", () => {
		it("preserves tests from prior history even if not in current run", async () => {
			const existing: HistoryRecord = {
				project: PROJECT,
				updatedAt: "2026-03-20T00:00:00.000Z",
				tests: [
					{
						fullName: "Suite > test A",
						runs: [{ timestamp: "2026-03-19T00:00:00.000Z", state: "passed" }],
					},
					{
						fullName: "Suite > test B",
						runs: [{ timestamp: "2026-03-19T00:00:00.000Z", state: "failed" }],
					},
				],
			};

			const result = await run(
				// Only test A in current run; test B should stay in history
				Effect.flatMap(HistoryTracker, (svc) =>
					svc.classify(CACHE_DIR, PROJECT, [{ fullName: "Suite > test A", state: "passed" }], TS),
				),
				seedHistory(existing),
			);

			const testAHistory = result.history.tests.find((t) => t.fullName === "Suite > test A");
			const testBHistory = result.history.tests.find((t) => t.fullName === "Suite > test B");

			expect(testAHistory).toBeDefined();
			expect(testBHistory).toBeDefined();
			if (!testBHistory) return;
			// test B not in current run, so its runs are unchanged
			expect(testBHistory.runs).toHaveLength(1);
			expect(testBHistory.runs[0].state).toBe("failed");
		});
	});

	describe("history record output", () => {
		it("returns updated history with correct project and timestamp", async () => {
			const outcomes = [{ fullName: "test", state: "passed" as const }];

			const result = await run(Effect.flatMap(HistoryTracker, (svc) => svc.classify(CACHE_DIR, PROJECT, outcomes, TS)));

			expect(result.history.project).toBe(PROJECT);
			expect(result.history.updatedAt).toBe(TS);
		});

		it("includes the current run in returned history", async () => {
			const outcomes = [{ fullName: "new test", state: "failed" as const }];

			const result = await run(Effect.flatMap(HistoryTracker, (svc) => svc.classify(CACHE_DIR, PROJECT, outcomes, TS)));

			const entry = result.history.tests.find((t) => t.fullName === "new test");
			expect(entry).toBeDefined();
			if (!entry) return;
			expect(entry.runs[0]).toEqual({ timestamp: TS, state: "failed" });
		});
	});
});
