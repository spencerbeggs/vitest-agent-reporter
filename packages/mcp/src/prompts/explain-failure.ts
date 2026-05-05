// packages/mcp/src/prompts/explain-failure.ts
import type { PromptResult } from "./triage.js";

export interface ExplainFailureArgs {
	readonly signature: string;
}

export function explainFailurePrompt(args: ExplainFailureArgs): PromptResult {
	const text = [
		`Explain the failure class identified by signature \`${args.signature}\`.`,
		"",
		"Steps:",
		"",
		`1. Call \`failure_signature_get\` with \`signature: "${args.signature}"\` to fetch the recurrence history (occurrence_count, first_seen_at, last_seen_at) and up to 10 recent test_errors with the same signature.`,
		"2. Read the diffs and stack frames across the recent occurrences. The signature is stable across line shifts — same shape, possibly different line numbers — so recurrences are meaningful.",
		"3. Distinguish:",
		"   - **New instance of an old class** — the same kind of bug has appeared before; this occurrence adds to a known pattern.",
		"   - **Fresh evidence** — the signature is recent (low occurrence_count, last_seen_at near first_seen_at) and represents a new bug class.",
		"",
		"Synthesize the root cause as a single explanation that accounts for every recent occurrence. If the occurrences disagree on root cause, the signature is too coarse — note this and flag the divergent occurrence ids.",
		"",
		"If a fix is obvious, record a hypothesis via `hypothesis_record` citing one of the test_error_ids as evidence. If a fix requires more investigation, note the missing data instead of guessing.",
	].join("\n");
	return {
		messages: [{ role: "user", content: { type: "text", text } }],
	};
}
