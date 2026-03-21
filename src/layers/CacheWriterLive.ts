import { FileSystem } from "@effect/platform";
import { Effect, Layer } from "effect";
import { CacheError } from "../errors/CacheError.js";
import type { HistoryRecord } from "../schemas/History.js";
import { CacheWriter } from "../services/CacheWriter.js";
import { safeFilename } from "../utils/safe-filename.js";

export const CacheWriterLive: Layer.Layer<CacheWriter, never, FileSystem.FileSystem> = Layer.effect(
	CacheWriter,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		return {
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
		};
	}),
);
