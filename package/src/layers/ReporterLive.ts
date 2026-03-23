import * as NodeContext from "@effect/platform-node/NodeContext";
import { layer as sqliteClientLayer } from "@effect/sql-sqlite-node/SqliteClient";
import * as SqliteMigrator from "@effect/sql-sqlite-node/SqliteMigrator";
import type { LogLevel } from "effect";
import { Layer } from "effect";
import migration0001 from "../migrations/0001_initial.js";
import { CoverageAnalyzerLive } from "./CoverageAnalyzerLive.js";
import { DataReaderLive } from "./DataReaderLive.js";
import { DataStoreLive } from "./DataStoreLive.js";
import { HistoryTrackerLive } from "./HistoryTrackerLive.js";
import { LoggerLive } from "./LoggerLive.js";
import { OutputPipelineLive } from "./OutputPipelineLive.js";

export const ReporterLive = (dbPath: string, logLevel?: LogLevel.LogLevel, logFile?: string) => {
	const SqliteLayer = sqliteClientLayer({ filename: dbPath });
	const PlatformLayer = NodeContext.layer;
	const MigratorLayer = SqliteMigrator.layer({
		loader: SqliteMigrator.fromRecord({ "0001_initial": migration0001 }),
	}).pipe(Layer.provide(Layer.merge(SqliteLayer, PlatformLayer)));

	return Layer.mergeAll(DataStoreLive, CoverageAnalyzerLive, HistoryTrackerLive, OutputPipelineLive).pipe(
		Layer.provideMerge(DataReaderLive),
		Layer.provideMerge(MigratorLayer),
		Layer.provideMerge(SqliteLayer),
		Layer.provideMerge(PlatformLayer),
		Layer.provideMerge(LoggerLive(logLevel, logFile)),
	);
};
