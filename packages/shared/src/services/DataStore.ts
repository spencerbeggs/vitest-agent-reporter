import type { Effect } from "effect";
import { Context } from "effect";
import type { DataStoreError } from "../errors/DataStoreError.js";
import type { CoverageBaselines } from "../schemas/Baselines.js";
import type { TrendEntry } from "../schemas/Trends.js";
import type { ArtifactKind, Phase } from "../utils/validate-phase-transition.js";

export type { ArtifactKind, Phase };

export interface SettingsInput {
	readonly vitest_version: string;
	readonly pool?: string;
	readonly environment?: string;
	readonly test_timeout?: number;
	readonly hook_timeout?: number;
	readonly slow_test_threshold?: number;
	readonly max_concurrency?: number;
	readonly max_workers?: number;
	readonly isolate?: boolean;
	readonly bail?: number;
	readonly globals?: boolean;
	readonly file_parallelism?: boolean;
	readonly sequence_seed?: number;
	readonly coverage_provider?: string;
}

export interface TestRunInput {
	readonly invocationId: string;
	readonly project: string;
	readonly subProject: string | null;
	readonly settingsHash: string;
	readonly timestamp: string;
	readonly commitSha: string | null;
	readonly branch: string | null;
	readonly reason: "passed" | "failed" | "interrupted";
	readonly duration: number;
	readonly total: number;
	readonly passed: number;
	readonly failed: number;
	readonly skipped: number;
	readonly scoped: boolean;
	readonly snapshotAdded?: number;
	readonly snapshotMatched?: number;
	readonly snapshotUnmatched?: number;
	readonly snapshotUpdated?: number;
	readonly snapshotUnchecked?: number;
	readonly snapshotTotal?: number;
	readonly snapshotFailure?: boolean;
	readonly snapshotDidUpdate?: boolean;
	readonly snapshotFilesAdded?: number;
	readonly snapshotFilesRemoved?: number;
	readonly snapshotFilesUnmatched?: number;
	readonly snapshotFilesUpdated?: number;
}

export interface ModuleInput {
	readonly fileId: number;
	readonly relativeModuleId: string;
	readonly state: string;
	readonly duration?: number;
	readonly environmentSetupDuration?: number;
	readonly prepareDuration?: number;
	readonly collectDuration?: number;
	readonly setupDuration?: number;
	readonly heap?: number;
}

export interface TestCaseInput {
	readonly suiteId?: number;
	readonly vitestId?: string;
	readonly name: string;
	readonly fullName: string;
	readonly state: string;
	readonly classification?: string;
	readonly duration?: number;
	readonly startTime?: number;
	readonly flaky?: boolean;
	readonly slow?: boolean;
	readonly retryCount?: number;
	readonly repeatCount?: number;
	readonly heap?: number;
	readonly mode?: string;
	readonly each?: boolean;
	readonly fails?: boolean;
	readonly concurrent?: boolean;
	readonly shuffle?: boolean;
	readonly timeout?: number;
	readonly skipNote?: string;
	readonly locationLine?: number;
	readonly locationColumn?: number;
	readonly tags?: readonly string[];
	/**
	 * FK to `turns(id)`. Set by the reporter when the test case row was
	 * authored within a recorded turn (D2 binding rule 1).
	 */
	readonly created_turn_id?: number;
}

export interface StackFrameInput {
	readonly ordinal: number;
	readonly method: string | null;
	readonly filePath: string;
	readonly line: number;
	readonly col: number;
	readonly sourceMappedLine?: number;
	readonly functionBoundaryLine?: number;
}

export interface TestErrorInput {
	readonly testCaseId?: number;
	readonly testSuiteId?: number;
	readonly moduleId?: number;
	readonly scope: "test" | "suite" | "module" | "unhandled";
	readonly name?: string;
	readonly message: string;
	readonly diff?: string;
	readonly actual?: string;
	readonly expected?: string;
	readonly stack?: string;
	readonly causeErrorId?: number;
	readonly signatureHash?: string;
	readonly frames?: ReadonlyArray<StackFrameInput>;
	readonly ordinal?: number;
}

export interface FileCoverageInput {
	readonly fileId: number;
	readonly statements: number;
	readonly branches: number;
	readonly functions: number;
	readonly lines: number;
	readonly uncoveredLines?: string;
	/**
	 * Coverage tier this row represents. `'below_threshold'` is the
	 * build-failing tier (file falls below the configured minimum
	 * coverage thresholds). `'below_target'` is the warning tier (file
	 * is above thresholds but below the aspirational target).
	 *
	 * Defaults to `'below_threshold'` when omitted, matching the only
	 * tier that existed before migration 0005.
	 */
	readonly tier?: "below_threshold" | "below_target";
}

export interface SuiteInput {
	readonly parentSuiteId?: number;
	readonly name: string;
	readonly fullName: string;
	readonly state: "pending" | "passed" | "failed" | "skipped";
	readonly mode?: "run" | "only" | "skip" | "todo";
	readonly concurrent?: boolean;
	readonly shuffle?: boolean;
	readonly retry?: number;
	readonly repeats?: number;
	readonly locationLine?: number;
	readonly locationColumn?: number;
}

export interface NoteInput {
	readonly title: string;
	readonly content: string;
	readonly scope: "global" | "project" | "module" | "suite" | "test" | "note";
	readonly project?: string;
	readonly subProject?: string;
	readonly testFullName?: string;
	readonly modulePath?: string;
	readonly parentNoteId?: number;
	readonly createdBy?: string;
	readonly expiresAt?: string;
	readonly pinned?: boolean;
}

export interface SessionInput {
	readonly cc_session_id: string;
	readonly project: string;
	readonly sub_project?: string;
	readonly cwd: string;
	readonly agent_kind: "main" | "subagent";
	readonly agent_type?: string;
	readonly parent_session_id?: number;
	readonly triage_was_non_empty?: boolean;
	readonly started_at: string;
}

export interface TurnInput {
	readonly session_id: number;
	/** When omitted, writeTurn computes MAX(turn_no) + 1 for the session. */
	readonly turn_no?: number;
	readonly type: "user_prompt" | "tool_call" | "tool_result" | "file_edit" | "hook_fire" | "note" | "hypothesis";
	readonly payload: string; // pre-stringified JSON, validated by record CLI
	readonly occurred_at: string;
}

export interface FailureSignatureWriteInput {
	readonly signatureHash: string;
	readonly runId: number;
	readonly seenAt: string;
}

export interface HypothesisInput {
	readonly sessionId: number;
	readonly content: string;
	readonly createdTurnId?: number;
	readonly citedTestErrorId?: number;
	readonly citedStackFrameId?: number;
}

export interface ValidateHypothesisInput {
	readonly id: number;
	readonly outcome: "confirmed" | "refuted" | "abandoned";
	readonly validatedTurnId?: number;
	readonly validatedAt: string;
}

export interface IdempotentResponseInput {
	readonly procedurePath: string;
	readonly key: string;
	readonly resultJson: string;
	readonly createdAt: string;
}

export interface TddSessionInput {
	readonly sessionId: number;
	readonly goal: string;
	readonly startedAt: string;
	readonly parentTddSessionId?: number;
}

export interface EndTddSessionInput {
	readonly id: number;
	readonly endedAt: string;
	readonly outcome: "succeeded" | "blocked" | "abandoned";
	readonly summaryNoteId?: number;
}

export interface TddBehaviorInput {
	readonly behavior: string;
	readonly suggestedTestName: string;
	readonly dependsOnBehaviorIds?: ReadonlyArray<number>;
}

export interface WriteTddBehaviorsInput {
	readonly parentTddSessionId: number;
	readonly behaviors: ReadonlyArray<TddBehaviorInput>;
}

export interface TddBehaviorOutput {
	readonly id: number;
	readonly ordinal: number;
	readonly behavior: string;
	readonly suggestedTestName: string;
}

export interface WriteTddPhaseInput {
	readonly tddSessionId: number;
	readonly behaviorId?: number;
	readonly phase: Phase;
	readonly startedAt: string;
	readonly transitionReason?: string;
	readonly parentPhaseId?: number;
}

export interface WriteTddPhaseOutput {
	readonly id: number;
	readonly previousPhaseId: number | null;
}

export interface WriteTddArtifactInput {
	readonly phaseId: number;
	readonly artifactKind: ArtifactKind;
	readonly fileId?: number;
	readonly testCaseId?: number;
	readonly testRunId?: number;
	readonly testFirstFailureRunId?: number;
	readonly diffExcerpt?: string;
	readonly recordedAt: string;
}

export interface WriteCommitInput {
	readonly sha: string;
	readonly parentSha?: string;
	readonly message?: string;
	readonly author?: string;
	readonly committedAt?: string;
	readonly branch?: string;
}

export type ChangeKind = "added" | "modified" | "deleted" | "renamed" | "untracked-modified";

export interface RunChangedFile {
	readonly filePath: string;
	readonly changeKind: ChangeKind;
	readonly commitSha?: string;
}

export interface WriteRunChangedFilesInput {
	readonly runId: number;
	readonly files: ReadonlyArray<RunChangedFile>;
}

export class DataStore extends Context.Tag("vitest-agent-reporter/DataStore")<
	DataStore,
	{
		readonly writeSettings: (
			hash: string,
			settings: SettingsInput,
			envVars: Record<string, string>,
		) => Effect.Effect<void, DataStoreError>;
		readonly writeRun: (input: TestRunInput) => Effect.Effect<number, DataStoreError>;
		readonly writeModules: (
			runId: number,
			modules: ReadonlyArray<ModuleInput>,
		) => Effect.Effect<ReadonlyArray<number>, DataStoreError>;
		readonly writeSuites: (
			moduleId: number,
			suites: ReadonlyArray<SuiteInput>,
		) => Effect.Effect<ReadonlyArray<number>, DataStoreError>;
		readonly writeTestCases: (
			moduleId: number,
			tests: ReadonlyArray<TestCaseInput>,
		) => Effect.Effect<ReadonlyArray<number>, DataStoreError>;
		readonly writeErrors: (runId: number, errors: ReadonlyArray<TestErrorInput>) => Effect.Effect<void, DataStoreError>;
		readonly writeCoverage: (
			runId: number,
			coverage: ReadonlyArray<FileCoverageInput>,
		) => Effect.Effect<void, DataStoreError>;
		readonly writeHistory: (
			project: string,
			subProject: string | null,
			fullName: string,
			runId: number,
			timestamp: string,
			state: string,
			duration: number | null,
			flaky: boolean,
			retryCount: number,
			errorMessage: string | null,
		) => Effect.Effect<void, DataStoreError>;
		readonly writeBaselines: (baselines: CoverageBaselines) => Effect.Effect<void, DataStoreError>;
		readonly writeTrends: (
			project: string,
			subProject: string | null,
			runId: number,
			entry: TrendEntry,
		) => Effect.Effect<void, DataStoreError>;
		readonly writeSourceMap: (
			sourceFilePath: string,
			testModuleId: number,
			mappingType: string,
		) => Effect.Effect<void, DataStoreError>;
		readonly ensureFile: (filePath: string) => Effect.Effect<number, DataStoreError>;
		readonly writeNote: (note: NoteInput) => Effect.Effect<number, DataStoreError>;
		readonly updateNote: (id: number, fields: Partial<NoteInput>) => Effect.Effect<void, DataStoreError>;
		readonly deleteNote: (id: number) => Effect.Effect<void, DataStoreError>;
		readonly writeSession: (input: SessionInput) => Effect.Effect<number, DataStoreError>;
		readonly writeTurn: (input: TurnInput) => Effect.Effect<number, DataStoreError>;
		readonly writeFailureSignature: (input: FailureSignatureWriteInput) => Effect.Effect<void, DataStoreError>;
		readonly endSession: (
			ccSessionId: string,
			endedAt: string,
			endReason: string | null,
		) => Effect.Effect<void, DataStoreError>;
		readonly writeHypothesis: (input: HypothesisInput) => Effect.Effect<number, DataStoreError>;
		readonly validateHypothesis: (input: ValidateHypothesisInput) => Effect.Effect<void, DataStoreError>;
		readonly writeTddSession: (input: TddSessionInput) => Effect.Effect<number, DataStoreError>;
		readonly endTddSession: (input: EndTddSessionInput) => Effect.Effect<void, DataStoreError>;
		readonly writeTddSessionBehaviors: (
			input: WriteTddBehaviorsInput,
		) => Effect.Effect<ReadonlyArray<TddBehaviorOutput>, DataStoreError>;
		readonly writeTddPhase: (input: WriteTddPhaseInput) => Effect.Effect<WriteTddPhaseOutput, DataStoreError>;
		readonly writeTddArtifact: (input: WriteTddArtifactInput) => Effect.Effect<number, DataStoreError>;
		readonly writeCommit: (input: WriteCommitInput) => Effect.Effect<void, DataStoreError>;
		readonly writeRunChangedFiles: (input: WriteRunChangedFilesInput) => Effect.Effect<void, DataStoreError>;
		readonly recordIdempotentResponse: (input: IdempotentResponseInput) => Effect.Effect<void, DataStoreError>;
		readonly pruneSessions: (
			keepRecent: number,
		) => Effect.Effect<{ readonly affectedSessions: number; readonly prunedTurns: number }, DataStoreError>;
	}
>() {}
