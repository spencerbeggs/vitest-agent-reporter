import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { CacheError } from "../errors/CacheError.js";
import type { AgentReport } from "../schemas/AgentReport.js";
import type { CacheManifest } from "../schemas/CacheManifest.js";

export class CacheReader extends Context.Tag("vitest-agent-reporter/CacheReader")<
	CacheReader,
	{
		readonly readManifest: (cacheDir: string) => Effect.Effect<Option.Option<CacheManifest>, CacheError>;
		readonly readReport: (
			cacheDir: string,
			projectName: string,
		) => Effect.Effect<Option.Option<AgentReport>, CacheError>;
		readonly listReports: (cacheDir: string) => Effect.Effect<ReadonlyArray<string>, CacheError>;
	}
>() {}
