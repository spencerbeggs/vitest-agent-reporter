import { FileSystem } from "@effect/platform";
import { Effect, Layer, Option, Schema } from "effect";
import { CacheError } from "../errors/CacheError.js";
import { AgentReport } from "../schemas/AgentReport.js";
import { CacheManifest } from "../schemas/CacheManifest.js";
import { HistoryRecord } from "../schemas/History.js";
import { CacheReader } from "../services/CacheReader.js";
import { safeFilename } from "../utils/safe-filename.js";

export const CacheReaderLive: Layer.Layer<CacheReader, never, FileSystem.FileSystem> = Layer.effect(
	CacheReader,
	Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		return {
			readManifest: (cacheDir) =>
				Effect.gen(function* () {
					const content = yield* fs.readFileString(`${cacheDir}/manifest.json`);
					const data = yield* Effect.try({
						try: () => Schema.decodeUnknownSync(CacheManifest)(JSON.parse(content)),
						catch: (e) =>
							new CacheError({
								operation: "read",
								path: `${cacheDir}/manifest.json`,
								reason: String(e),
							}),
					});
					return Option.some(data);
				}).pipe(
					Effect.catchTag("SystemError", (error) =>
						error.reason === "NotFound"
							? Effect.succeed(Option.none<CacheManifest>())
							: Effect.fail(
									new CacheError({
										operation: "read",
										path: `${cacheDir}/manifest.json`,
										reason: String(error),
									}),
								),
					),
					Effect.catchAll((error) =>
						error instanceof CacheError
							? Effect.fail(error)
							: Effect.fail(
									new CacheError({
										operation: "read",
										path: `${cacheDir}/manifest.json`,
										reason: String(error),
									}),
								),
					),
				),
			readReport: (cacheDir, projectName) =>
				Effect.gen(function* () {
					const filePath = `${cacheDir}/reports/${safeFilename(projectName)}.json`;
					const content = yield* fs.readFileString(filePath);
					const data = yield* Effect.try({
						try: () => Schema.decodeUnknownSync(AgentReport)(JSON.parse(content)),
						catch: (e) =>
							new CacheError({
								operation: "read",
								path: filePath,
								reason: String(e),
							}),
					});
					return Option.some(data);
				}).pipe(
					Effect.catchTag("SystemError", (error) =>
						error.reason === "NotFound"
							? Effect.succeed(Option.none<AgentReport>())
							: Effect.fail(
									new CacheError({
										operation: "read",
										path: `${cacheDir}/reports/${safeFilename(projectName)}.json`,
										reason: String(error),
									}),
								),
					),
					Effect.catchAll((error) =>
						error instanceof CacheError
							? Effect.fail(error)
							: Effect.fail(
									new CacheError({
										operation: "read",
										path: cacheDir,
										reason: String(error),
									}),
								),
					),
				),
			listReports: (cacheDir) =>
				Effect.gen(function* () {
					const entries = yield* fs.readDirectory(`${cacheDir}/reports`);
					return entries.filter((e) => e.endsWith(".json"));
				}).pipe(
					Effect.catchTag("SystemError", (error) =>
						error.reason === "NotFound"
							? Effect.succeed([] as ReadonlyArray<string>)
							: Effect.fail(
									new CacheError({
										operation: "read",
										path: `${cacheDir}/reports`,
										reason: String(error),
									}),
								),
					),
					Effect.catchAll((error) =>
						error instanceof CacheError
							? Effect.fail(error)
							: Effect.fail(
									new CacheError({
										operation: "read",
										path: `${cacheDir}/reports`,
										reason: String(error),
									}),
								),
					),
				),
			readHistory: (cacheDir, projectName) => {
				const filePath = `${cacheDir}/history/${safeFilename(projectName)}.history.json`;
				const emptyRecord: HistoryRecord = {
					project: projectName,
					updatedAt: "",
					tests: [],
				};
				return Effect.gen(function* () {
					const content = yield* fs.readFileString(filePath);
					return yield* Effect.try({
						try: () => Schema.decodeUnknownSync(HistoryRecord)(JSON.parse(content)),
						catch: () => {
							process.stderr.write(`vitest-agent-reporter: corrupt history file ${filePath}, resetting\n`);
							return emptyRecord;
						},
					});
				}).pipe(
					Effect.catchTag("SystemError", (error) =>
						error.reason === "NotFound"
							? Effect.succeed(emptyRecord)
							: Effect.sync(() => {
									process.stderr.write(`vitest-agent-reporter: error reading ${filePath}: ${error}\n`);
									return emptyRecord;
								}),
					),
					Effect.catchAll(() => Effect.succeed(emptyRecord)),
				);
			},
		};
	}),
);
