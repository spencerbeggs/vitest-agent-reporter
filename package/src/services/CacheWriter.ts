import type { Effect } from "effect";
import { Context } from "effect";
import type { CacheError } from "../errors/CacheError.js";
import type { AgentReport } from "../schemas/AgentReport.js";
import type { CoverageBaselines } from "../schemas/Baselines.js";
import type { CacheManifest } from "../schemas/CacheManifest.js";
import type { HistoryRecord } from "../schemas/History.js";
import type { TrendRecord } from "../schemas/Trends.js";

export class CacheWriter extends Context.Tag("vitest-agent-reporter/CacheWriter")<
	CacheWriter,
	{
		readonly writeReport: (
			cacheDir: string,
			projectName: string,
			report: AgentReport,
		) => Effect.Effect<void, CacheError>;
		readonly writeManifest: (cacheDir: string, manifest: CacheManifest) => Effect.Effect<void, CacheError>;
		readonly ensureDir: (cacheDir: string) => Effect.Effect<void, CacheError>;
		readonly writeHistory: (
			cacheDir: string,
			projectName: string,
			history: HistoryRecord,
		) => Effect.Effect<void, CacheError>;
		readonly writeBaselines: (cacheDir: string, baselines: CoverageBaselines) => Effect.Effect<void, CacheError>;
		readonly writeTrends: (
			cacheDir: string,
			projectName: string,
			trends: TrendRecord,
		) => Effect.Effect<void, CacheError>;
	}
>() {}
