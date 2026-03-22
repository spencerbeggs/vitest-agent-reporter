import { Effect, Layer } from "effect";
import { CacheWriter } from "../services/CacheWriter.js";

export interface CacheWriterTestState {
	readonly files: Map<string, string>;
	readonly histories: Map<string, string>;
	readonly baselines: Map<string, string>;
	readonly trends: Map<string, string>;
	readonly dirs: string[];
}

export const CacheWriterTest = {
	empty: (): CacheWriterTestState => ({
		files: new Map(),
		histories: new Map(),
		baselines: new Map(),
		trends: new Map(),
		dirs: [],
	}),
	layer: (state: CacheWriterTestState): Layer.Layer<CacheWriter> =>
		Layer.succeed(CacheWriter, {
			writeReport: (cacheDir, projectName, report) =>
				Effect.sync(() => {
					const path = `${cacheDir}/reports/${projectName}.json`;
					state.files.set(path, JSON.stringify(report, null, 2));
				}),
			writeManifest: (cacheDir, manifest) =>
				Effect.sync(() => {
					state.files.set(`${cacheDir}/manifest.json`, JSON.stringify(manifest, null, 2));
				}),
			ensureDir: (cacheDir) =>
				Effect.sync(() => {
					state.dirs.push(cacheDir);
				}),
			writeHistory: (cacheDir, projectName, history) =>
				Effect.sync(() => {
					const path = `${cacheDir}/history/${projectName}.history.json`;
					state.histories.set(path, JSON.stringify(history, null, 2));
				}),
			writeBaselines: (cacheDir, baselines) =>
				Effect.sync(() => {
					state.baselines.set(`${cacheDir}/baselines.json`, JSON.stringify(baselines, null, 2));
				}),
			writeTrends: (cacheDir, projectName, trends) =>
				Effect.sync(() => {
					const path = `${cacheDir}/trends/${projectName}.trends.json`;
					state.trends.set(path, JSON.stringify(trends, null, 2));
				}),
		}),
} as const;
