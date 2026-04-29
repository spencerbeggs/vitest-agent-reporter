import { createHash } from "node:crypto";
import type { SettingsInput } from "vitest-agent-reporter-shared";

export function captureSettings(config: Record<string, unknown>, vitestVersion: string): SettingsInput {
	const pool = config.pool as string | undefined;
	const environment = config.environment as string | undefined;
	const testTimeout = config.testTimeout as number | undefined;
	const hookTimeout = config.hookTimeout as number | undefined;
	const slowTestThreshold = config.slowTestThreshold as number | undefined;
	const maxConcurrency = config.maxConcurrency as number | undefined;
	const maxWorkers = config.maxWorkers as number | undefined;
	const isolate = config.isolate as boolean | undefined;
	const bail = config.bail as number | undefined;
	const globals = config.globals as boolean | undefined;
	const fileParallelism = config.fileParallelism as boolean | undefined;
	const sequenceSeed = (config.sequence as Record<string, unknown>)?.seed as number | undefined;
	const coverageProvider = (config.coverage as Record<string, unknown>)?.provider as string | undefined;

	return {
		vitest_version: vitestVersion,
		...(pool !== undefined && { pool }),
		...(environment !== undefined && { environment }),
		...(testTimeout !== undefined && { test_timeout: testTimeout }),
		...(hookTimeout !== undefined && { hook_timeout: hookTimeout }),
		...(slowTestThreshold !== undefined && { slow_test_threshold: slowTestThreshold }),
		...(maxConcurrency !== undefined && { max_concurrency: maxConcurrency }),
		...(maxWorkers !== undefined && { max_workers: maxWorkers }),
		...(isolate !== undefined && { isolate }),
		...(bail !== undefined && { bail }),
		...(globals !== undefined && { globals }),
		...(fileParallelism !== undefined && { file_parallelism: fileParallelism }),
		...(sequenceSeed !== undefined && { sequence_seed: sequenceSeed }),
		...(coverageProvider !== undefined && { coverage_provider: coverageProvider }),
	};
}

export function hashSettings(settings: Record<string, unknown>): string {
	const json = JSON.stringify(settings, Object.keys(settings).sort());
	return createHash("sha256").update(json).digest("hex");
}
