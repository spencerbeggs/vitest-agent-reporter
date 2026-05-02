import { Effect, Option, Schema } from "effect";
import { DataReader } from "vitest-agent-reporter-shared";
import { publicProcedure } from "../context.js";

export const tddSessionResume = publicProcedure
	.input(Schema.standardSchemaV1(Schema.Struct({ id: Schema.Number })))
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const tddOpt = yield* reader.getTddSessionById(input.id);
				if (Option.isNone(tddOpt)) {
					return `No TDD session with id ${input.id}.`;
				}
				const tdd = tddOpt.value;
				const currentOpt = yield* reader.getCurrentTddPhase(input.id);

				const lines: string[] = [];
				lines.push(`# TDD session #${tdd.id}: ${tdd.goal}`);
				lines.push("");
				lines.push(`**Status:** ${tdd.outcome ?? "in progress"}`);
				if (Option.isSome(currentOpt)) {
					lines.push(`**Current phase:** ${currentOpt.value.phase} (started ${currentOpt.value.startedAt})`);
				} else {
					lines.push(`**Current phase:** none (TDD cycle not yet entered)`);
				}
				lines.push("");
				lines.push(`**Phases recorded:** ${tdd.phases.length}`);
				if (tdd.artifacts && tdd.artifacts.length > 0) {
					lines.push(`**Artifacts:** ${tdd.artifacts.length}`);
				}
				lines.push("");
				lines.push(
					`Use \`tdd_session_get(${input.id})\` for the full detail tree, or call \`tdd_phase_transition_request\` to advance.`,
				);
				return lines.join("\n");
			}),
		);
	});
