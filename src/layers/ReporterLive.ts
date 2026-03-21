import { NodeFileSystem } from "@effect/platform-node";
import { Layer } from "effect";
import { CacheWriterLive } from "./CacheWriterLive.js";
import { CoverageAnalyzerLive } from "./CoverageAnalyzerLive.js";

export const ReporterLive = Layer.mergeAll(CacheWriterLive, CoverageAnalyzerLive).pipe(
	Layer.provideMerge(NodeFileSystem.layer),
);
