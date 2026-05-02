import { Effect, Option, Schema } from "effect";
import type { Phase } from "vitest-agent-reporter-shared";
import { DataReader, DataStore, validatePhaseTransition } from "vitest-agent-reporter-shared";
import { publicProcedure } from "../context.js";

const phaseLiteral = Schema.Literal(
	"spike",
	"red",
	"red.triangulate",
	"green",
	"green.fake-it",
	"refactor",
	"extended-red",
	"green-without-red",
);

export const tddPhaseTransitionRequest = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				tddSessionId: Schema.Number,
				requestedPhase: phaseLiteral,
				citedArtifactId: Schema.Number,
				behaviorId: Schema.optional(Schema.Number),
				reason: Schema.optional(Schema.String),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const store = yield* DataStore;

				// 1. Resolve current phase. If none, treat current_phase as "spike"
				//    (the entry point for every TDD cycle per D11).
				const currentOpt = yield* reader.getCurrentTddPhase(input.tddSessionId);
				const currentPhase: Phase = Option.isSome(currentOpt) ? currentOpt.value.phase : "spike";
				const phaseStartedAt = Option.isSome(currentOpt) ? currentOpt.value.startedAt : new Date().toISOString();

				// 2. Resolve cited artifact + binding-rule context.
				const artifactOpt = yield* reader.getTddArtifactWithContext(input.citedArtifactId);
				if (Option.isNone(artifactOpt)) {
					// Per Decision D7, artifact writes are CLI-only — there
					// is no `tdd_artifact_record` MCP tool. The plugin's
					// PostToolUse hooks shell out to `vitest-agent-reporter
					// record tdd-artifact` on the orchestrator's behalf
					// after observing the side effect (test run, edit).
					// Steer the agent to make the side effect happen,
					// rather than to a tool that does not exist.
					return {
						accepted: false as const,
						phase: currentPhase,
						denialReason: "missing_artifact_evidence" as const,
						remediation: {
							suggestedTool: "run_tests",
							suggestedArgs: {},
							humanHint:
								`Cited artifact id ${input.citedArtifactId} does not exist. ` +
								"Artifacts are recorded by hooks observing your tool calls (Decision D7), " +
								"so run the test (e.g. via the run_tests MCP tool) or make the file edit " +
								"first; the post-tool-use hook will write the matching tdd_artifacts row " +
								"and return its id, which can then be cited here.",
						},
					};
				}

				// 3. Validate.
				const result = validatePhaseTransition({
					tdd_session_id: input.tddSessionId,
					current_phase: currentPhase,
					phase_started_at: phaseStartedAt,
					now: new Date().toISOString(),
					requested_phase: input.requestedPhase,
					cited_artifact: artifactOpt.value,
					requested_behavior_id: input.behaviorId ?? null,
				});

				if (!result.accepted) {
					return result;
				}

				// 4. Open the new phase row (which closes the prior one).
				const out = yield* store.writeTddPhase({
					tddSessionId: input.tddSessionId,
					phase: result.phase,
					startedAt: new Date().toISOString(),
					...(input.behaviorId !== undefined && { behaviorId: input.behaviorId }),
					...(input.reason !== undefined && { transitionReason: input.reason }),
				});

				return {
					accepted: true as const,
					phase: result.phase,
					newPhaseId: out.id,
					previousPhaseId: out.previousPhaseId,
				};
			}),
		);
	});
