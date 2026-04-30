/**
 * Lib function for the `record tdd-artifact` CLI subcommand.
 *
 * Per Decision D7, artifact writes go through the CLI (driven by
 * PostToolUse hooks) -- never through MCP. The hook supplies the
 * Claude Code session id; this lib resolves the active TDD phase
 * for that session and writes the artifact under it.
 *
 * @packageDocumentation
 */

import { Effect, Option } from "effect";
import type { ArtifactKind, DataStoreError } from "vitest-agent-reporter-shared";
import { DataReader, DataStore } from "vitest-agent-reporter-shared";

export interface RecordTddArtifactInput {
	readonly ccSessionId: string;
	readonly artifactKind: ArtifactKind;
	readonly fileId?: number;
	readonly testCaseId?: number;
	readonly testRunId?: number;
	readonly testFirstFailureRunId?: number;
	readonly diffExcerpt?: string;
	readonly recordedAt: string;
}

export interface RecordTddArtifactResult {
	readonly id: number;
	readonly phaseId: number;
}

export const recordTddArtifactEffect = (
	input: RecordTddArtifactInput,
): Effect.Effect<RecordTddArtifactResult, DataStoreError | Error, DataReader | DataStore> =>
	Effect.gen(function* () {
		const reader = yield* DataReader;
		const store = yield* DataStore;

		const sessionOpt = yield* reader.getSessionByCcId(input.ccSessionId);
		if (Option.isNone(sessionOpt)) {
			return yield* Effect.fail(new Error(`Unknown cc_session_id: ${input.ccSessionId}`));
		}

		// Find the TDD session(s) under this Claude Code session, then the
		// open phase under whichever TDD session is open.
		const tddSessions = yield* reader.listTddSessionsForSession(sessionOpt.value.id);
		const openTdd = tddSessions.find((t) => t.endedAt === null);
		if (openTdd === undefined) {
			return yield* Effect.fail(
				new Error(`No open TDD session under cc_session_id ${input.ccSessionId}. Call tdd_session_start first.`),
			);
		}

		const phaseOpt = yield* reader.getCurrentTddPhase(openTdd.id);
		if (Option.isNone(phaseOpt)) {
			return yield* Effect.fail(
				new Error(`TDD session ${openTdd.id} has no open phase. Call tdd_phase_transition_request first.`),
			);
		}

		const id = yield* store.writeTddArtifact({
			phaseId: phaseOpt.value.id,
			artifactKind: input.artifactKind,
			...(input.fileId !== undefined && { fileId: input.fileId }),
			...(input.testCaseId !== undefined && { testCaseId: input.testCaseId }),
			...(input.testRunId !== undefined && { testRunId: input.testRunId }),
			...(input.testFirstFailureRunId !== undefined && {
				testFirstFailureRunId: input.testFirstFailureRunId,
			}),
			...(input.diffExcerpt !== undefined && { diffExcerpt: input.diffExcerpt }),
			recordedAt: input.recordedAt,
		});

		return { id, phaseId: phaseOpt.value.id };
	});
