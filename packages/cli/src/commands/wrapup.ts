/**
 * CLI wrapup command -- emits the W5 wrap-up prompt for a session.
 *
 * Drives the four interpretive hooks (Stop / SessionEnd / PreCompact /
 * UserPromptSubmit). Hooks invoke the bin with --kind set; humans on
 * the terminal can also run it on demand with --session-id or
 * --cc-session-id.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { formatWrapupEffect } from "vitest-agent-reporter-shared";

const sessionIdOption = Options.optional(Options.integer("session-id"));
const ccSessionIdOption = Options.optional(Options.text("cc-session-id"));
const kindOption = Options.withDefault(
	Options.choice("kind", ["stop", "session_end", "pre_compact", "tdd_handoff", "user_prompt_nudge"]),
	"session_end",
);
const userPromptHintOption = Options.optional(Options.text("user-prompt-hint"));
const formatOption = Options.withDefault(Options.choice("format", ["markdown", "json"]), "markdown");

export const wrapupCommand = Command.make(
	"wrapup",
	{
		sessionId: sessionIdOption,
		ccSessionId: ccSessionIdOption,
		kind: kindOption,
		userPromptHint: userPromptHintOption,
		format: formatOption,
	},
	(opts) =>
		Effect.gen(function* () {
			const md = yield* formatWrapupEffect({
				...(opts.sessionId._tag === "Some" && { sessionId: opts.sessionId.value }),
				...(opts.ccSessionId._tag === "Some" && { ccSessionId: opts.ccSessionId.value }),
				kind: opts.kind as "stop" | "session_end" | "pre_compact" | "tdd_handoff" | "user_prompt_nudge",
				...(opts.userPromptHint._tag === "Some" && { userPromptHint: opts.userPromptHint.value }),
			});

			if (opts.format === "json") {
				yield* Effect.sync(() => process.stdout.write(`${JSON.stringify({ wrapup: md })}\n`));
				return;
			}

			yield* Effect.sync(() => process.stdout.write(md.length > 0 ? `${md}\n` : ""));
		}),
).pipe(Command.withDescription("Emit the W5 wrap-up prompt for a session"));
