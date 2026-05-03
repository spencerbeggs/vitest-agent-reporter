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
import type { ArtifactKind, ChangeKind } from "vitest-agent-reporter-shared";
import { DataStore } from "vitest-agent-reporter-shared";
import { recordSessionEnd, recordSessionStart } from "../lib/record-session.js";
import { recordTddArtifactEffect } from "../lib/record-tdd-artifact.js";
import { recordTurnEffect } from "../lib/record-turn.js";
import { recordRunWorkspaceChangesEffect } from "../lib/record-workspace-changes.js";
import { resolveCcSessionId } from "../lib/resolve-cc-session-id.js";

// Required for `record session-start` (only the SessionStart hook calls it,
// and the hook always has the id from the envelope).
const ccSessionId = Options.text("cc-session-id").pipe(
	Options.withDescription("Claude Code session id (from hook envelope)"),
);

// Optional for the rest. When omitted, the resolver reads the per-workspace
// pointer file written by SessionStart. Hooks continue to pass the flag
// explicitly; agent-invoked CLI calls can rely on the pointer.
const ccSessionIdOptional = Options.optional(Options.text("cc-session-id")).pipe(
	Options.withDescription("Claude Code session id; falls back to the pointer file when omitted"),
);

const requireResolvedCcSessionId = (explicit: string | undefined) =>
	resolveCcSessionId({ explicit }).pipe(
		Effect.flatMap((id) =>
			id !== null
				? Effect.succeed(id)
				: Effect.fail(
						new Error(
							"--cc-session-id was not provided and no active session pointer was found. The pointer is written by SessionStart and cleared by SessionEnd; pass --cc-session-id explicitly when invoking outside a Claude Code session.",
						),
					),
		),
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
	{ ccSessionId: ccSessionIdOptional, occurredAt, payload: payloadArg },
	({ ccSessionId, occurredAt, payload }) =>
		Effect.gen(function* () {
			const resolved = yield* requireResolvedCcSessionId(ccSessionId._tag === "Some" ? ccSessionId.value : undefined);
			return yield* recordTurnEffect({ ccSessionId: resolved, payloadJson: payload, occurredAt });
		}).pipe(
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

const sessionEndSubcommand = Command.make(
	"session-end",
	{ ccSessionId: ccSessionIdOptional, endedAt, endReason },
	(opts) =>
		Effect.gen(function* () {
			const resolved = yield* requireResolvedCcSessionId(
				opts.ccSessionId._tag === "Some" ? opts.ccSessionId.value : undefined,
			);
			return yield* recordSessionEnd({
				ccSessionId: resolved,
				endedAt: opts.endedAt,
				endReason: opts.endReason._tag === "Some" ? opts.endReason.value : null,
			});
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

const artifactKindOpt = Options.choice("artifact-kind", [
	"test_written",
	"test_failed_run",
	"code_written",
	"test_passed_run",
	"refactor",
	"test_weakened",
]);
const filePathOpt = Options.optional(Options.text("file-path"));
const testCaseIdOpt = Options.optional(Options.integer("test-case-id"));
const testRunIdOpt = Options.optional(Options.integer("test-run-id"));
const testFirstFailureRunIdOpt = Options.optional(Options.integer("test-first-failure-run-id"));
const diffExcerptOpt = Options.optional(Options.text("diff-excerpt"));
const recordedAtOpt = Options.text("recorded-at").pipe(Options.withDefault(new Date().toISOString()));

const tddArtifactSubcommand = Command.make(
	"tdd-artifact",
	{
		ccSessionId: ccSessionIdOptional,
		artifactKind: artifactKindOpt,
		filePath: filePathOpt,
		testCaseId: testCaseIdOpt,
		testRunId: testRunIdOpt,
		testFirstFailureRunId: testFirstFailureRunIdOpt,
		diffExcerpt: diffExcerptOpt,
		recordedAt: recordedAtOpt,
	},
	(opts) =>
		Effect.gen(function* () {
			const resolvedCcSessionId = yield* requireResolvedCcSessionId(
				opts.ccSessionId._tag === "Some" ? opts.ccSessionId.value : undefined,
			);
			// Resolve filePath -> fileId via DataStore.ensureFile if provided.
			let fileId: number | undefined;
			if (opts.filePath._tag === "Some") {
				const ds = yield* DataStore;
				fileId = yield* ds.ensureFile(opts.filePath.value);
			}
			return yield* recordTddArtifactEffect({
				ccSessionId: resolvedCcSessionId,
				artifactKind: opts.artifactKind as ArtifactKind,
				...(fileId !== undefined && { fileId }),
				...(opts.testCaseId._tag === "Some" && { testCaseId: opts.testCaseId.value }),
				...(opts.testRunId._tag === "Some" && { testRunId: opts.testRunId.value }),
				...(opts.testFirstFailureRunId._tag === "Some" && {
					testFirstFailureRunId: opts.testFirstFailureRunId.value,
				}),
				...(opts.diffExcerpt._tag === "Some" && { diffExcerpt: opts.diffExcerpt.value }),
				recordedAt: opts.recordedAt,
			});
		}).pipe(
			Effect.flatMap((result) => Effect.sync(() => process.stdout.write(`${JSON.stringify(result)}\n`))),
			Effect.catchAll((err) =>
				Effect.sync(() => {
					process.stderr.write(`record tdd-artifact: ${err instanceof Error ? err.message : String(err)}\n`);
					process.exit(1);
				}),
			),
		),
).pipe(Command.withDescription("Record a TDD artifact (D7: CLI-only)"));

const shaOpt = Options.text("sha");
const parentShaOpt = Options.optional(Options.text("parent-sha"));
const messageOpt = Options.optional(Options.text("message"));
const authorOpt = Options.optional(Options.text("author"));
const committedAtOpt = Options.optional(Options.text("committed-at"));
const branchOpt = Options.optional(Options.text("branch"));
const projectOpt = Options.optional(Options.text("project"));
const filesArg = Args.text({ name: "files-json" }).pipe(
	Args.withDescription('JSON array of {"filePath","changeKind"} objects'),
);

const runWorkspaceChangesSubcommand = Command.make(
	"run-workspace-changes",
	{
		sha: shaOpt,
		parentSha: parentShaOpt,
		message: messageOpt,
		author: authorOpt,
		committedAt: committedAtOpt,
		branch: branchOpt,
		project: projectOpt,
		files: filesArg,
	},
	(opts) =>
		Effect.gen(function* () {
			const parsed = yield* Effect.try({
				try: () =>
					JSON.parse(opts.files) as ReadonlyArray<{
						filePath: string;
						changeKind: ChangeKind;
					}>,
				catch: (e) => new Error(`Invalid files-json: ${e instanceof Error ? e.message : String(e)}`),
			});
			return yield* recordRunWorkspaceChangesEffect({
				sha: opts.sha,
				...(opts.parentSha._tag === "Some" && { parentSha: opts.parentSha.value }),
				...(opts.message._tag === "Some" && { message: opts.message.value }),
				...(opts.author._tag === "Some" && { author: opts.author.value }),
				...(opts.committedAt._tag === "Some" && { committedAt: opts.committedAt.value }),
				...(opts.branch._tag === "Some" && { branch: opts.branch.value }),
				...(opts.project._tag === "Some" && { project: opts.project.value }),
				files: parsed,
			});
		}).pipe(
			Effect.flatMap((result) => Effect.sync(() => process.stdout.write(`${JSON.stringify(result)}\n`))),
			Effect.catchAll((err) =>
				Effect.sync(() => {
					process.stderr.write(`record run-workspace-changes: ${err instanceof Error ? err.message : String(err)}\n`);
					process.exit(1);
				}),
			),
		),
).pipe(Command.withDescription("Record a commit + its changed files (driven by post-commit hook)"));

export const recordCommand = Command.make("record").pipe(
	Command.withSubcommands([
		turnSubcommand,
		sessionStartSubcommand,
		sessionEndSubcommand,
		tddArtifactSubcommand,
		runWorkspaceChangesSubcommand,
	]),
	Command.withDescription(
		"Hook write surface (Decision D3): turn, session-start, session-end, tdd-artifact, run-workspace-changes",
	),
);
