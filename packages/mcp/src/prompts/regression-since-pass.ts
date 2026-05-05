// packages/mcp/src/prompts/regression-since-pass.ts
import type { PromptResult } from "./triage.js";

export interface RegressionSincePassArgs {
	readonly test: string;
	readonly project?: string;
}

export function regressionSincePassPrompt(args: RegressionSincePassArgs): PromptResult {
	const projectClause = args.project ? ` in project \`${args.project}\`` : "";
	const text = [
		`Identify what broke the test \`${args.test}\`${projectClause}.`,
		"",
		"The test passed at some point in recent history and now fails. The change that broke it lies in the window between then and now.",
		"",
		"Steps:",
		"",
		`1. Call \`test_history\` for ${args.project ? `\`project: "${args.project}"\` and ` : ""}the named test. Find the timestamp of the most recent passing run. Note the run id.`,
		"2. Call `commit_changes` with no `sha` argument to fetch up to 20 most-recent commits. Filter to commits whose `committedAt` is later than the last passing run's timestamp.",
		"3. Call `turn_search` for the same time window to see the agent activity (file_edits especially) between the last pass and the current fail.",
		"4. Cross-reference the failing test's source / test files against the changed-files list. The cause is almost always in a file that appears in both.",
		"5. Once you have a likely culprit, record a hypothesis via `hypothesis_record` citing the test_error_id and stack_frame_id of the most recent failure plus a short description of the change.",
		"",
		"If `turn_search` reveals the failing test was newly written in this window (no prior history), this is not a regression — it never passed. Treat it as a TDD-cycle failure instead.",
	].join("\n");
	return {
		messages: [{ role: "user", content: { type: "text", text } }],
	};
}
