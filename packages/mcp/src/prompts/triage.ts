// packages/mcp/src/prompts/triage.ts
export interface TriageArgs {
	readonly project?: string;
}

export interface PromptResult {
	readonly messages: ReadonlyArray<{
		readonly role: "user";
		readonly content: { readonly type: "text"; readonly text: string };
	}>;
}

export function triagePrompt(args: TriageArgs): PromptResult {
	const projectClause = args.project ? ` (project filter: \`${args.project}\`)` : "";
	const text = [
		`You are starting a triage of the most recent test run${projectClause}.`,
		"",
		"Steps:",
		"",
		`1. Call \`triage_brief\`${args.project ? ` with \`project: "${args.project}"\`` : ""} to get the orientation summary.`,
		"2. For any failures with a `signature_hash`, call `failure_signature_get` to read the recurrence history. A signature seen many times across recent runs points at a class of bug, not a fluke.",
		"3. Form a hypothesis about the most likely root cause. Cite the specific evidence (test error, stack frame) you base the hypothesis on.",
		"4. Record the hypothesis with `hypothesis_record`, citing the test_error_id and stack_frame_id. Once recorded, you (or the next agent) can validate it against a fix.",
		"",
		'Be specific. Avoid generic explanations like "the test environment is misconfigured" without evidence — those rarely turn out to be the cause.',
	].join("\n");
	return {
		messages: [{ role: "user", content: { type: "text", text } }],
	};
}
