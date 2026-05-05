// packages/mcp/src/prompts/wrapup.ts
import type { PromptResult } from "./triage.js";

export type WrapupKind = "stop" | "session_end" | "pre_compact" | "tdd_handoff" | "user_prompt_nudge";

export interface WrapupArgs {
	readonly kind?: WrapupKind;
	readonly since?: string;
}

export function wrapupPrompt(args: WrapupArgs): PromptResult {
	const kind = args.kind ?? "user_prompt_nudge";
	const sinceClause = args.since ? `, since: "${args.since}"` : "";
	const text = [
		"Generate a wrapup for the current session.",
		"",
		`Call \`wrapup_prompt\` with \`kind: "${kind}"\`${sinceClause} and read the returned markdown. The output is a short, human-readable summary of what happened in the session and what the user might want to do next.`,
		"",
		"This is identical content to what the post-Stop / post-SessionEnd hooks emit automatically — invoking it here is for moments when you want to surface the same summary on demand.",
	].join("\n");
	return {
		messages: [{ role: "user", content: { type: "text", text } }],
	};
}
