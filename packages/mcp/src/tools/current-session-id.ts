/**
 * `get_current_session_id` and `set_current_session_id` MCP tools.
 *
 * Lets the agent associate this MCP server process with a specific
 * Claude Code `cc_session_id`. Stored in-memory on the
 * {@link CurrentSessionIdRef} carried in {@link McpContext}; survives only
 * for the life of the MCP process. Each Claude Code window spawns its
 * own MCP server, so per-window scoping is automatic — there's no
 * cross-window contention.
 *
 * The plugin's MCP loader (`plugin/.claude-plugin/plugin.json`)
 * may seed the value via a positional argument substituted from
 * `${CLAUDE_SESSION_ID}` (untested as of this commit — Claude Code's
 * documented variable substitutions are `CLAUDE_PLUGIN_ROOT` and
 * `CLAUDE_PLUGIN_DATA`; the substitution behavior of other env names
 * is what this wiring is partly meant to test). When the seed is
 * absent the agent calls `set_current_session_id` once at the start
 * of the conversation after the SessionStart hook tells it its own
 * id via `additionalContext`.
 *
 * Session-aware tools (e.g. `wrapup_prompt`, `tdd_session_start`,
 * `triage_brief`) will consult this stored id as the default for
 * `ccSessionId`-shaped inputs in a follow-up commit.
 */

import { Schema } from "effect";
import { publicProcedure } from "../context.js";

export const getCurrentSessionId = publicProcedure
	.input(Schema.standardSchemaV1(Schema.Struct({})))
	.query(({ ctx }) => {
		return { currentSessionId: ctx.currentSessionId.get() };
	});

export const setCurrentSessionId = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				/**
				 * The Claude Code session id to associate with this MCP server
				 * process. Pass `null` to clear the association (rare — usually
				 * only the SessionEnd hook would do this).
				 */
				id: Schema.NullOr(Schema.String),
			}),
		),
	)
	.mutation(({ ctx, input }) => {
		ctx.currentSessionId.set(input.id);
		return { currentSessionId: ctx.currentSessionId.get() };
	});
