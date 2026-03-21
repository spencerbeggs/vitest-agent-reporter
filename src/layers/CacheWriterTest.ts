import { Effect, Layer } from "effect";
import { CacheWriter } from "../services/CacheWriter.js";

export interface CacheWriterTestState {
	readonly files: Map<string, string>;
	readonly dirs: string[];
}

export const CacheWriterTest = {
	empty: (): CacheWriterTestState => ({
		files: new Map(),
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
		}),
} as const;
