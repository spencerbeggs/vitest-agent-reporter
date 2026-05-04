/**
 * Cache manifest schemas for project indexing.
 *
 * @packageDocumentation
 */

import { Schema } from "effect";
import { TestRunReason } from "./Common.js";

/**
 * A single project entry in the cache manifest.
 */
export const CacheManifestEntry = Schema.Struct({
	project: Schema.String,
	reportFile: Schema.String,
	historyFile: Schema.optional(Schema.String),
	lastRun: Schema.NullOr(Schema.String),
	lastResult: Schema.NullOr(TestRunReason),
}).annotations({ identifier: "CacheManifestEntry" });
export type CacheManifestEntry = typeof CacheManifestEntry.Type;

/**
 * Root manifest file that indexes all project reports.
 */
export const CacheManifest = Schema.Struct({
	updatedAt: Schema.String,
	cacheDir: Schema.String,
	projects: Schema.Array(CacheManifestEntry),
}).annotations({ identifier: "CacheManifest" });
export type CacheManifest = typeof CacheManifest.Type;
