import { Effect, Option, Schema } from "effect";
import { DataReader } from "vitest-agent-reporter-shared";
import { publicProcedure } from "../context.js";

export const failureSignatureGet = publicProcedure
	.input(Schema.standardSchemaV1(Schema.Struct({ hash: Schema.String })))
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const opt = yield* reader.getFailureSignatureByHash(input.hash);
				if (Option.isNone(opt)) return `No failure signature found with hash=${input.hash}.`;
				const sig = opt.value;
				const lines: string[] = [
					`# Failure Signature \`${sig.signatureHash}\``,
					"",
					`**Hash:** ${sig.signatureHash}`,
					"",
					`- first_seen_at: ${sig.firstSeenAt}`,
					`- first_seen_run_id: ${sig.firstSeenRunId ?? "unknown"}`,
					`- occurrence_count: ${sig.occurrenceCount}`,
				];
				if (sig.recentErrors.length > 0) {
					lines.push("", "## Recent Errors", "");
					for (const e of sig.recentErrors) {
						lines.push(`- run=${e.runId} name=${e.errorName ?? "(none)"}: ${e.message.slice(0, 120)}`);
					}
				}
				return lines.join("\n");
			}),
		);
	});
