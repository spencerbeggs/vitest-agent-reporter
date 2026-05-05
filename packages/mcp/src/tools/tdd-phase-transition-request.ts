import { Effect, Option, Schema } from "effect";
import type { Phase } from "vitest-agent-sdk";
import { DataReader, DataStore, validatePhaseTransition } from "vitest-agent-sdk";
import { CoercedNumber } from "../coerce-schema.js";
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
				tddSessionId: CoercedNumber,
				goalId: CoercedNumber,
				requestedPhase: phaseLiteral,
				citedArtifactId: CoercedNumber,
				behaviorId: Schema.optional(CoercedNumber),
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

				// 2. Validate goal: exists + status is in_progress.
				const goalOpt = yield* reader.getGoalById(input.goalId);
				if (Option.isNone(goalOpt)) {
					return {
						accepted: false as const,
						phase: currentPhase,
						denialReason: "goal_not_found" as const,
						remediation: {
							suggestedTool: "tdd_goal_list",
							suggestedArgs: { sessionId: input.tddSessionId },
							humanHint: `No tdd_session_goals row with id=${input.goalId}. Call tdd_goal_list to find the correct goal id.`,
						},
					};
				}
				if (goalOpt.value.status !== "in_progress") {
					return {
						accepted: false as const,
						phase: currentPhase,
						denialReason: "goal_not_in_progress" as const,
						remediation: {
							suggestedTool: "tdd_goal_update",
							suggestedArgs: { id: input.goalId, status: "in_progress" },
							humanHint:
								`Goal id=${input.goalId} has status '${goalOpt.value.status}'. ` +
								"Phase transitions require the goal to be in_progress. " +
								"Call tdd_goal_update({status:'in_progress'}) before requesting transitions.",
						},
					};
				}

				// 3. If behaviorId is supplied, validate it exists and belongs to goalId.
				if (input.behaviorId !== undefined) {
					const behaviorOpt = yield* reader.getBehaviorById(input.behaviorId);
					if (Option.isNone(behaviorOpt)) {
						return {
							accepted: false as const,
							phase: currentPhase,
							denialReason: "behavior_not_found" as const,
							remediation: {
								suggestedTool: "tdd_behavior_list",
								suggestedArgs: { scope: "goal", goalId: input.goalId },
								humanHint: `No tdd_session_behaviors row with id=${input.behaviorId}. Call tdd_behavior_list to find the correct behavior id.`,
							},
						};
					}
					if (behaviorOpt.value.goalId !== input.goalId) {
						return {
							accepted: false as const,
							phase: currentPhase,
							denialReason: "behavior_not_in_goal" as const,
							remediation: {
								suggestedTool: "tdd_behavior_get",
								suggestedArgs: { id: input.behaviorId },
								humanHint:
									`Behavior id=${input.behaviorId} belongs to goal ${behaviorOpt.value.goalId}, ` +
									`not the requested goalId=${input.goalId}. Pass the goalId of the behavior's parent goal.`,
							},
						};
					}
				}

				// 4. Resolve cited artifact + binding-rule context.
				const artifactOpt = yield* reader.getTddArtifactWithContext(input.citedArtifactId);
				if (Option.isNone(artifactOpt)) {
					// Per Decision D7, artifact writes are CLI-only — there
					// is no `tdd_artifact_record` MCP tool. The plugin's
					// PostToolUse hooks shell out to `vitest-agent
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

				// 5. Validate against the binding rules.
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

				// 6. Open the new phase row (which closes the prior one).
				const out = yield* store.writeTddPhase({
					tddSessionId: input.tddSessionId,
					phase: result.phase,
					startedAt: new Date().toISOString(),
					...(input.behaviorId !== undefined && { behaviorId: input.behaviorId }),
					...(input.reason !== undefined && { transitionReason: input.reason }),
				});

				// 7. Auto-promote behavior status pending → in_progress on accepted transition.
				//    Only when behaviorId is supplied AND the behavior is currently pending.
				//    Failures here are swallowed so a partial promotion doesn't block phase
				//    advancement (the orchestrator can detect drift via tdd_behavior_get).
				if (input.behaviorId !== undefined) {
					yield* Effect.ignoreLogged(
						Effect.gen(function* () {
							const behOpt = yield* reader.getBehaviorById(input.behaviorId as number);
							if (Option.isSome(behOpt) && behOpt.value.status === "pending") {
								yield* store.updateBehavior({ id: input.behaviorId as number, status: "in_progress" });
							}
						}),
					);
				}

				return {
					accepted: true as const,
					phase: result.phase,
					newPhaseId: out.id,
					previousPhaseId: out.previousPhaseId,
				};
			}),
		);
	});
