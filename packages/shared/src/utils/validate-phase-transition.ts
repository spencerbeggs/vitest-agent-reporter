export type Phase =
	| "spike"
	| "red"
	| "red.triangulate"
	| "green"
	| "green.fake-it"
	| "refactor"
	| "extended-red"
	| "green-without-red";

export type ArtifactKind =
	| "test_written"
	| "test_failed_run"
	| "code_written"
	| "test_passed_run"
	| "refactor"
	| "test_weakened";

export interface CitedArtifact {
	readonly id: number;
	readonly artifact_kind: ArtifactKind;
	readonly test_case_id: number | null;
	readonly test_case_created_turn_at: string | null;
	readonly test_case_authored_in_session: boolean;
	readonly test_run_id: number | null;
	readonly test_first_failure_run_id: number | null;
	readonly behavior_id: number | null;
}

export interface PhaseTransitionContext {
	readonly tdd_session_id: number;
	readonly current_phase: Phase;
	readonly phase_started_at: string;
	readonly now: string;
	readonly requested_phase: Phase;
	readonly cited_artifact: CitedArtifact;
	readonly requested_behavior_id: number | null;
}

export type DenialReason =
	| "missing_artifact_evidence"
	| "wrong_source_phase"
	| "unknown_session"
	| "session_already_ended"
	| "goal_not_started"
	| "refactor_without_passing_run"
	| "evidence_not_in_phase_window"
	| "evidence_not_for_behavior"
	| "evidence_test_was_already_failing";

export interface Remediation {
	readonly suggestedTool: string;
	readonly suggestedArgs: Record<string, unknown>;
	readonly humanHint: string;
}

export type PhaseTransitionResult =
	| { readonly accepted: true; readonly phase: Phase }
	| {
			readonly accepted: false;
			readonly phase: Phase;
			readonly denialReason: DenialReason;
			readonly remediation: Remediation;
	  };

const requiredArtifactForTransition = (from: Phase, to: Phase): { kind: ArtifactKind; humanHint: string } | null => {
	if (from === "red" && to === "green") {
		return {
			kind: "test_failed_run",
			humanHint:
				"Run the failing test via run_tests, then record the test_failed_run artifact before requesting red→green.",
		};
	}
	if (from === "green" && to === "refactor") {
		return {
			kind: "test_passed_run",
			humanHint:
				"Run the test via run_tests and confirm it passes; record test_passed_run before requesting green→refactor.",
		};
	}
	if (from === "refactor" && to === "red") {
		return {
			kind: "test_passed_run",
			humanHint:
				"Refactor must end with all tests still passing; record test_passed_run before starting the next behavior.",
		};
	}
	return null;
};

export const validatePhaseTransition = (ctx: PhaseTransitionContext): PhaseTransitionResult => {
	const expected = requiredArtifactForTransition(ctx.current_phase, ctx.requested_phase);
	if (expected === null) {
		return {
			accepted: false,
			phase: ctx.current_phase,
			denialReason: "wrong_source_phase",
			remediation: {
				suggestedTool: "tdd_session_get",
				suggestedArgs: { id: ctx.tdd_session_id },
				humanHint: `Cannot transition from ${ctx.current_phase} to ${ctx.requested_phase}. Inspect the session for the next valid transition.`,
			},
		};
	}

	if (ctx.cited_artifact.artifact_kind !== expected.kind) {
		return {
			accepted: false,
			phase: ctx.current_phase,
			denialReason: "missing_artifact_evidence",
			remediation: {
				suggestedTool: "run_tests",
				suggestedArgs: {},
				humanHint: expected.humanHint,
			},
		};
	}

	// D2 binding rule 1: cited test was created in this phase window AND authored in this session
	if (
		ctx.cited_artifact.test_case_created_turn_at !== null &&
		ctx.cited_artifact.test_case_created_turn_at < ctx.phase_started_at
	) {
		return {
			accepted: false,
			phase: ctx.current_phase,
			denialReason: "evidence_not_in_phase_window",
			remediation: {
				suggestedTool: "run_tests",
				suggestedArgs: {},
				humanHint:
					"The cited test was authored before this phase started. Write a new failing test inside the current phase.",
			},
		};
	}
	if (!ctx.cited_artifact.test_case_authored_in_session) {
		return {
			accepted: false,
			phase: ctx.current_phase,
			denialReason: "evidence_not_in_phase_window",
			remediation: {
				suggestedTool: "run_tests",
				suggestedArgs: {},
				humanHint: "The cited test was not authored in this TDD session. Write the test yourself in the current phase.",
			},
		};
	}

	// D2 binding rule 2: behavior match (if the orchestrator requests transitioning a specific behavior)
	if (ctx.requested_behavior_id !== null && ctx.cited_artifact.behavior_id !== ctx.requested_behavior_id) {
		return {
			accepted: false,
			phase: ctx.current_phase,
			denialReason: "evidence_not_for_behavior",
			remediation: {
				suggestedTool: "run_tests",
				suggestedArgs: {},
				humanHint:
					"The cited artifact references a different behavior than the one being transitioned. Run the test for the requested behavior.",
			},
		};
	}

	// D2 binding rule 3: cited test wasn't already failing on main
	if (
		expected.kind === "test_failed_run" &&
		ctx.cited_artifact.test_run_id !== null &&
		ctx.cited_artifact.test_first_failure_run_id !== null &&
		ctx.cited_artifact.test_first_failure_run_id !== ctx.cited_artifact.test_run_id
	) {
		return {
			accepted: false,
			phase: ctx.current_phase,
			denialReason: "evidence_test_was_already_failing",
			remediation: {
				suggestedTool: "run_tests",
				suggestedArgs: {},
				humanHint: "The cited test was already failing before this TDD session. Write a new test for the goal.",
			},
		};
	}

	return { accepted: true, phase: ctx.requested_phase };
};
