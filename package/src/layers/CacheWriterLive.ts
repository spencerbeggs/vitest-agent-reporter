import { FileSystem } from "@effect/platform";
import { Effect, Layer, Schema } from "effect";
import { CacheError } from "../errors/CacheError.js";
import { CoverageBaselines } from "../schemas/Baselines.js";
import type { HistoryRecord } from "../schemas/History.js";
import { TrendRecord } from "../schemas/Trends.js";
import { CacheWriter } from "../services/CacheWriter.js";
import { safeFilename } from "../utils/safe-filename.js";

export const CacheWriterLive: Layer.Layer<CacheWriter, never, FileSystem.FileSystem> = Layer.effect(
	CacheWriter,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		return {
			// Note: writeReport and writeHistory use JSON.stringify directly while
			// writeBaselines and writeTrends use Schema.encodeUnknownSync. Both
			// produce identical output for the current schemas (no transforms).
			// If Schema transformations are added later, all writers should be
			// updated to use Schema.encodeUnknownSync consistently.
			writeReport: (cacheDir, projectName, report) =>
				Effect.gen(function* () {
					const json = JSON.stringify(report, null, 2);
					const path = `${cacheDir}/reports/${safeFilename(projectName)}.json`;
					yield* fs.writeFileString(path, json);
				}).pipe(
					Effect.mapError(
						(error) =>
							new CacheError({
								operation: "write",
								path: `${cacheDir}/reports/${safeFilename(projectName)}.json`,
								reason: String(error),
							}),
					),
				),
			writeManifest: (cacheDir, manifest) =>
				Effect.gen(function* () {
					const json = JSON.stringify(manifest, null, 2);
					yield* fs.writeFileString(`${cacheDir}/manifest.json`, json);
				}).pipe(
					Effect.mapError(
						(error) =>
							new CacheError({
								operation: "write",
								path: `${cacheDir}/manifest.json`,
								reason: String(error),
							}),
					),
				),
			ensureDir: (cacheDir) =>
				fs.makeDirectory(cacheDir, { recursive: true }).pipe(
					Effect.mapError(
						(error) =>
							new CacheError({
								operation: "mkdir",
								path: cacheDir,
								reason: String(error),
							}),
					),
				),
			writeHistory: (cacheDir: string, projectName: string, history: HistoryRecord) =>
				Effect.gen(function* () {
					const json = JSON.stringify(history, null, 2);
					const filePath = `${cacheDir}/history/${safeFilename(projectName)}.history.json`;
					yield* fs.writeFileString(filePath, json);
				}).pipe(
					Effect.mapError(
						(error) =>
							new CacheError({
								operation: "write",
								path: `${cacheDir}/history/${safeFilename(projectName)}.history.json`,
								reason: String(error),
							}),
					),
				),
			writeBaselines: (cacheDir, baselines) =>
				Effect.gen(function* () {
					const json = JSON.stringify(Schema.encodeUnknownSync(CoverageBaselines)(baselines), null, 2);
					yield* fs.writeFileString(`${cacheDir}/baselines.json`, json);
				}).pipe(
					Effect.mapError(
						(error) =>
							new CacheError({
								operation: "write",
								path: `${cacheDir}/baselines.json`,
								reason: String(error),
							}),
					),
				),
			writeTrends: (cacheDir, projectName, trends) =>
				Effect.gen(function* () {
					const json = JSON.stringify(Schema.encodeUnknownSync(TrendRecord)(trends), null, 2);
					const filePath = `${cacheDir}/trends/${safeFilename(projectName)}.trends.json`;
					yield* fs.writeFileString(filePath, json);
				}).pipe(
					Effect.mapError(
						(error) =>
							new CacheError({
								operation: "write",
								path: `${cacheDir}/trends/${safeFilename(projectName)}.trends.json`,
								reason: String(error),
							}),
					),
				),
		};
	}),
);
