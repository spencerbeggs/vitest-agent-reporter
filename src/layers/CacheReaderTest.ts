import { Effect, Layer, Option, Schema } from "effect";
import { AgentReport } from "../schemas/AgentReport.js";
import { CacheManifest } from "../schemas/CacheManifest.js";
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
		}),
} as const;
