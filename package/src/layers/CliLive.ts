import { NodeFileSystem } from "@effect/platform-node";
import { Layer } from "effect";
import { CacheReaderLive } from "./CacheReaderLive.js";
import { ProjectDiscoveryLive } from "./ProjectDiscoveryLive.js";

export const CliLive = Layer.mergeAll(CacheReaderLive, ProjectDiscoveryLive).pipe(
	Layer.provideMerge(NodeFileSystem.layer),
);
