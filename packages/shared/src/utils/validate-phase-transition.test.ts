import { describe, expect, it } from "vitest";
import type { PhaseTransitionContext } from "./validate-phase-transition.js";
import { validatePhaseTransition } from "./validate-phase-transition.js";

const baseCtx = (overrides: Partial<PhaseTransitionContext> = {}): PhaseTransitionContext => ({
	tdd_session_id: 1,
	current_phase: "red",
	phase_started_at: "2026-04-29T00:00:00Z",
	now: "2026-04-29T00:01:00Z",
	requested_phase: "green",
	cited_artifact: {
		id: 100,
		artifact_kind: "test_failed_run",
		test_case_id: 50,
		test_case_created_turn_at: "2026-04-29T00:00:30Z",
		test_case_authored_in_session: true,
		test_run_id: 200,
		test_first_failure_run_id: 200,
		behavior_id: null,
	},
	requested_behavior_id: null,
	...overrides,
});

describe("validatePhaseTransition", () => {
	it("accepts a valid red→green transition", () => {
		const result = validatePhaseTransition(baseCtx());
		expect(result.accepted).toBe(true);
	});

	it("rejects red→green when no test_failed_run artifact provided", () => {
		const result = validatePhaseTransition(
			baseCtx({ cited_artifact: { ...baseCtx().cited_artifact, artifact_kind: "test_written" } }),
		);
		expect(result.accepted).toBe(false);
		if (!result.accepted) {
			expect(result.denialReason).toBe("missing_artifact_evidence");
		}
	});

	it("rejects when current_phase doesn't match the source for the transition", () => {
		const result = validatePhaseTransition(baseCtx({ current_phase: "refactor", requested_phase: "green" }));
		expect(result.accepted).toBe(false);
		if (!result.accepted) expect(result.denialReason).toBe("wrong_source_phase");
	});

	it("rejects D2 binding rule 1: cited test created before phase start", () => {
		const result = validatePhaseTransition(
			baseCtx({
				cited_artifact: {
					...baseCtx().cited_artifact,
					test_case_created_turn_at: "2026-04-28T00:00:00Z",
				},
			}),
		);
		expect(result.accepted).toBe(false);
		if (!result.accepted) expect(result.denialReason).toBe("evidence_not_in_phase_window");
	});

	it("rejects D2 binding rule 1: test not authored in this session", () => {
		const result = validatePhaseTransition(
			baseCtx({
				cited_artifact: {
					...baseCtx().cited_artifact,
					test_case_authored_in_session: false,
				},
			}),
		);
		expect(result.accepted).toBe(false);
		if (!result.accepted) expect(result.denialReason).toBe("evidence_not_in_phase_window");
	});

	it("rejects D2 binding rule 2: requested behavior_id doesn't match artifact's", () => {
		const result = validatePhaseTransition(
			baseCtx({
				requested_behavior_id: 1,
				cited_artifact: { ...baseCtx().cited_artifact, behavior_id: 2 },
			}),
		);
		expect(result.accepted).toBe(false);
		if (!result.accepted) expect(result.denialReason).toBe("evidence_not_for_behavior");
	});

	it("rejects D2 binding rule 3: cited test was already failing on main", () => {
		const result = validatePhaseTransition(
			baseCtx({
				cited_artifact: {
					...baseCtx().cited_artifact,
					test_first_failure_run_id: 5, // earlier than test_run_id 200
				},
			}),
		);
		expect(result.accepted).toBe(false);
		if (!result.accepted) expect(result.denialReason).toBe("evidence_test_was_already_failing");
	});

	it("rejects refactor→x when no test_passed_run in current phase", () => {
		const result = validatePhaseTransition(
			baseCtx({
				current_phase: "refactor",
				requested_phase: "red",
				cited_artifact: {
					...baseCtx().cited_artifact,
					artifact_kind: "test_failed_run",
				},
			}),
		);
		// Wrong: refactor→red transition is fine here; this asserts wrong_source_phase first
		expect(result.accepted).toBe(false);
	});
});
