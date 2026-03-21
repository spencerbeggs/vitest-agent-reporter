import { NodeFileSystem } from "@effect/platform-node";
import { Layer } from "effect";
import { CacheReaderLive } from "./CacheReaderLive.js";
import { CacheWriterLive } from "./CacheWriterLive.js";
import { CoverageAnalyzerLive } from "./CoverageAnalyzerLive.js";
import { HistoryTrackerLive } from "./HistoryTrackerLive.js";

export const ReporterLive = Layer.mergeAll(CacheWriterLive, CoverageAnalyzerLive, HistoryTrackerLive).pipe(
	Layer.provideMerge(CacheReaderLive),
	Layer.provideMerge(NodeFileSystem.layer),
);
