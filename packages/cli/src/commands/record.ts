/**
 * CLI record command -- write session/turn data to the database.
 *
 * Hook scripts in plugin/hooks/ shell out to these subcommands. The
 * record-turn and record-session libs (in ../lib) implement the actual
 * write effects; commands here are thin \@effect/cli wrappers.
 *
 * @packageDocumentation
 */

import { Args, Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { recordSessionEnd, recordSessionStart } from "../lib/record-session.js";
import { recordTurnEffect } from "../lib/record-turn.js";

const ccSessionId = Options.text("cc-session-id").pipe(
	Options.withDescription("Claude Code session id (from hook envelope)"),
);

const occurredAt = Options.text("occurred-at").pipe(
	Options.withDefault(new Date().toISOString()),
	Options.withDescription("ISO 8601 timestamp; defaults to now"),
);

const payloadArg = Args.text({ name: "payload-json" }).pipe(
	Args.withDescription("Stringified JSON payload (validated against TurnPayload)"),
);

const turnSubcommand = Command.make(
	"turn",
	{ ccSessionId, occurredAt, payload: payloadArg },
	({ ccSessionId, occurredAt, payload }) =>
		recordTurnEffect({ ccSessionId, payloadJson: payload, occurredAt }).pipe(
			Effect.flatMap((result) => Effect.sync(() => process.stdout.write(`${JSON.stringify(result)}\n`))),
			Effect.catchAll((err) =>
				Effect.sync(() => {
					process.stderr.write(`record turn: ${err instanceof Error ? err.message : String(err)}\n`);
					process.exit(1);
				}),
			),
		),
).pipe(Command.withDescription("Validate a TurnPayload JSON and write a turn row"));

const project = Options.text("project");
const subProject = Options.optional(Options.text("sub-project"));
const cwd = Options.text("cwd");
const agentKind = Options.choice("agent-kind", ["main", "subagent"]).pipe(Options.withDefault("main"));
const agentType = Options.optional(Options.text("agent-type"));
const parentCcSessionId = Options.optional(Options.text("parent-cc-session-id"));
const triageWasNonEmpty = Options.boolean("triage-was-non-empty").pipe(Options.withDefault(false));
const startedAt = Options.text("started-at").pipe(Options.withDefault(new Date().toISOString()));

const sessionStartSubcommand = Command.make(
	"session-start",
	{
		ccSessionId,
		project,
		subProject,
		cwd,
		agentKind,
		agentType,
		parentCcSessionId,
		triageWasNonEmpty,
		startedAt,
	},
	(opts) =>
		recordSessionStart({
			ccSessionId: opts.ccSessionId,
			project: opts.project,
			...(opts.subProject._tag === "Some" && { subProject: opts.subProject.value }),
			cwd: opts.cwd,
			agentKind: opts.agentKind as "main" | "subagent",
			...(opts.agentType._tag === "Some" && { agentType: opts.agentType.value }),
			...(opts.parentCcSessionId._tag === "Some" && {
				parentCcSessionId: opts.parentCcSessionId.value,
			}),
			triageWasNonEmpty: opts.triageWasNonEmpty,
			startedAt: opts.startedAt,
		}).pipe(
			Effect.flatMap((result) => Effect.sync(() => process.stdout.write(`${JSON.stringify(result)}\n`))),
			Effect.catchAll((err) =>
				Effect.sync(() => {
					process.stderr.write(`record session-start: ${err instanceof Error ? err.message : String(err)}\n`);
					process.exit(1);
				}),
			),
		),
).pipe(Command.withDescription("Insert a new sessions row"));

const endedAt = Options.text("ended-at").pipe(Options.withDefault(new Date().toISOString()));
const endReason = Options.optional(Options.text("end-reason"));

const sessionEndSubcommand = Command.make("session-end", { ccSessionId, endedAt, endReason }, (opts) =>
	recordSessionEnd({
		ccSessionId: opts.ccSessionId,
		endedAt: opts.endedAt,
		endReason: opts.endReason._tag === "Some" ? opts.endReason.value : null,
	}).pipe(
		Effect.flatMap(() => Effect.sync(() => process.stdout.write(`{"ok":true}\n`))),
		Effect.catchAll((err) =>
			Effect.sync(() => {
				process.stderr.write(`record session-end: ${err instanceof Error ? err.message : String(err)}\n`);
				process.exit(1);
			}),
		),
	),
).pipe(Command.withDescription("Update sessions.ended_at + end_reason"));

export const recordCommand = Command.make("record").pipe(
	Command.withSubcommands([turnSubcommand, sessionStartSubcommand, sessionEndSubcommand]),
	Command.withDescription("Hook write surface (Decision D3): turn, session-start, session-end"),
);
