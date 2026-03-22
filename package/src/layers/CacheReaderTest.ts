import { Effect, Layer, Option, Schema } from "effect";
import { AgentReport } from "../schemas/AgentReport.js";
import { CoverageBaselines } from "../schemas/Baselines.js";
import { CacheManifest } from "../schemas/CacheManifest.js";
import { HistoryRecord } from "../schemas/History.js";
import { TrendRecord } from "../schemas/Trends.js";
import { CacheReader } from "../services/CacheReader.js";

export const CacheReaderTest = {
	layer: (data: Map<string, string>): Layer.Layer<CacheReader> =>
		Layer.succeed(CacheReader, {
			readManifest: (cacheDir) =>
				Effect.sync(() => {
					const key = `${cacheDir}/manifest.json`;
					const content = data.get(key);
					if (!content) return Option.none();
					const parsed = Schema.decodeUnknownSync(CacheManifest)(JSON.parse(content));
					return Option.some(parsed);
				}),
			readReport: (cacheDir, projectName) =>
				Effect.sync(() => {
					const key = `${cacheDir}/reports/${projectName}.json`;
					const content = data.get(key);
					if (!content) return Option.none();
					const parsed = Schema.decodeUnknownSync(AgentReport)(JSON.parse(content));
					return Option.some(parsed);
				}),
			listReports: (cacheDir) =>
				Effect.sync(() => {
					const prefix = `${cacheDir}/reports/`;
					return Array.from(data.keys())
						.filter((k) => k.startsWith(prefix))
						.map((k) => k.slice(prefix.length));
				}),
			readHistory: (cacheDir, projectName) =>
				Effect.sync(() => {
					const key = `${cacheDir}/history/${projectName}.history.json`;
					const content = data.get(key);
					if (!content) {
						return { project: projectName, updatedAt: "", tests: [] };
					}
					return Schema.decodeUnknownSync(HistoryRecord)(JSON.parse(content));
				}),
			readBaselines: (cacheDir) =>
				Effect.sync(() => {
					const key = `${cacheDir}/baselines.json`;
					const content = data.get(key);
					if (!content) return Option.none();
					const parsed = Schema.decodeUnknownSync(CoverageBaselines)(JSON.parse(content));
					return Option.some(parsed);
				}),
			readTrends: (cacheDir, projectName) =>
				Effect.sync(() => {
					const key = `${cacheDir}/trends/${projectName}.trends.json`;
					const content = data.get(key);
					if (!content) return Option.none();
					const parsed = Schema.decodeUnknownSync(TrendRecord)(JSON.parse(content));
					return Option.some(parsed);
				}),
		}),
} as const;
