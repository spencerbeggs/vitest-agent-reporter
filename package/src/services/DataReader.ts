import type { Effect, Option } from "effect";
import { Context } from "effect";
import type { DataStoreError } from "../errors/DataStoreError.js";
import type { AgentReport } from "../schemas/AgentReport.js";
import type { CoverageBaselines } from "../schemas/Baselines.js";
import type { CacheManifest } from "../schemas/CacheManifest.js";
import type { CoverageReport, FileCoverageReport } from "../schemas/Coverage.js";
import type { HistoryRecord } from "../schemas/History.js";
import type { TrendRecord } from "../schemas/Trends.js";

export interface ProjectRunSummary {
	readonly project: string;
	readonly subProject: string | null;
	readonly lastRun: string | null;
	readonly lastResult: "passed" | "failed" | "interrupted" | null;
	readonly total: number;
	readonly passed: number;
	readonly failed: number;
	readonly skipped: number;
}

export interface FlakyTest {
	readonly fullName: string;
	readonly project: string;
	readonly subProject: string | null;
	readonly passCount: number;
	readonly failCount: number;
	readonly lastState: "passed" | "failed";
	readonly lastTimestamp: string;
}

export interface PersistentFailure {
	readonly fullName: string;
	readonly project: string;
	readonly subProject: string | null;
	readonly consecutiveFailures: number;
	readonly firstFailedAt: string;
	readonly lastFailedAt: string;
	readonly lastErrorMessage: string | null;
}

export interface TestError {
	readonly name: string | null;
	readonly message: string;
	readonly diff: string | null;
	readonly actual: string | null;
	readonly expected: string | null;
	readonly stack: string | null;
	readonly scope: "test" | "suite" | "module" | "unhandled";
	readonly testFullName: string | null;
	readonly moduleFile: string | null;
}

export interface NoteRow {
	readonly id: number;
	readonly title: string;
	readonly content: string;
	readonly scope: "global" | "project" | "module" | "suite" | "test" | "note";
	readonly project: string | null;
	readonly subProject: string | null;
	readonly testFullName: string | null;
	readonly modulePath: string | null;
	readonly parentNoteId: number | null;
	readonly createdBy: string | null;
	readonly expiresAt: string | null;
	readonly pinned: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface SettingsRow {
	readonly hash: string;
	readonly reporters: string | null;
	readonly coverageEnabled: boolean;
	readonly coverageProvider: string | null;
	readonly coverageThresholds: string | null;
	readonly coverageTargets: string | null;
	readonly pool: string | null;
	readonly shard: string | null;
	readonly project: string | null;
	readonly environment: string | null;
	readonly envVars: Record<string, string>;
	readonly capturedAt: string;
}

export interface TestListEntry {
	readonly id: number;
	readonly fullName: string;
	readonly state: string;
	readonly duration: number | null;
	readonly module: string;
	readonly classification: string | null;
}

export interface ModuleListEntry {
	readonly id: number;
	readonly file: string;
	readonly state: string;
	readonly testCount: number;
	readonly duration: number | null;
}

export interface SuiteListEntry {
	readonly id: number;
	readonly name: string;
	readonly module: string;
	readonly state: string;
	readonly testCount: number;
}

export interface SettingsListEntry {
	readonly hash: string;
	readonly capturedAt: string;
}

export class DataReader extends Context.Tag("vitest-agent-reporter/DataReader")<
	DataReader,
	{
		readonly getLatestRun: (
			project: string,
			subProject: string | null,
		) => Effect.Effect<Option.Option<AgentReport>, DataStoreError>;
		readonly getRunsByProject: () => Effect.Effect<ReadonlyArray<ProjectRunSummary>, DataStoreError>;
		readonly getHistory: (project: string, subProject: string | null) => Effect.Effect<HistoryRecord, DataStoreError>;
		readonly getBaselines: (
			project: string,
			subProject: string | null,
		) => Effect.Effect<Option.Option<CoverageBaselines>, DataStoreError>;
		readonly getTrends: (
			project: string,
			subProject: string | null,
			limit?: number,
		) => Effect.Effect<Option.Option<TrendRecord>, DataStoreError>;
		readonly getFlaky: (
			project: string,
			subProject: string | null,
		) => Effect.Effect<ReadonlyArray<FlakyTest>, DataStoreError>;
		readonly getPersistentFailures: (
			project: string,
			subProject: string | null,
		) => Effect.Effect<ReadonlyArray<PersistentFailure>, DataStoreError>;
		readonly getFileCoverage: (runId: number) => Effect.Effect<ReadonlyArray<FileCoverageReport>, DataStoreError>;
		readonly getCoverage: (
			project: string,
			subProject: string | null,
		) => Effect.Effect<Option.Option<CoverageReport>, DataStoreError>;
		readonly getTestsForFile: (filePath: string) => Effect.Effect<ReadonlyArray<string>, DataStoreError>;
		readonly getErrors: (
			project: string,
			subProject: string | null,
			errorName?: string,
		) => Effect.Effect<ReadonlyArray<TestError>, DataStoreError>;
		readonly getNotes: (
			scope?: string,
			project?: string,
			testFullName?: string,
		) => Effect.Effect<ReadonlyArray<NoteRow>, DataStoreError>;
		readonly getNoteById: (id: number) => Effect.Effect<Option.Option<NoteRow>, DataStoreError>;
		readonly searchNotes: (query: string) => Effect.Effect<ReadonlyArray<NoteRow>, DataStoreError>;
		readonly getManifest: () => Effect.Effect<Option.Option<CacheManifest>, DataStoreError>;
		readonly getSettings: (hash: string) => Effect.Effect<Option.Option<SettingsRow>, DataStoreError>;
		readonly getLatestSettings: () => Effect.Effect<Option.Option<SettingsRow>, DataStoreError>;
		readonly listTests: (
			project: string,
			subProject: string | null,
			options?: { state?: string; module?: string; limit?: number },
		) => Effect.Effect<ReadonlyArray<TestListEntry>, DataStoreError>;
		readonly listModules: (
			project: string,
			subProject: string | null,
		) => Effect.Effect<ReadonlyArray<ModuleListEntry>, DataStoreError>;
		readonly listSuites: (
			project: string,
			subProject: string | null,
			options?: { module?: string },
		) => Effect.Effect<ReadonlyArray<SuiteListEntry>, DataStoreError>;
		readonly listSettings: () => Effect.Effect<ReadonlyArray<SettingsListEntry>, DataStoreError>;
	}
>() {}
