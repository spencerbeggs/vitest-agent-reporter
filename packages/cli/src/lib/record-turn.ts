import { Effect, Schema } from "effect";
import { DataReader, DataStore, TurnPayload } from "vitest-agent-reporter-shared";

export type ParseResult = { ok: true; payload: typeof TurnPayload.Type } | { ok: false; error: string };

export const parseAndValidateTurnPayload = (raw: string): ParseResult => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (e) {
		return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
	}
	const decoded = Schema.decodeUnknownEither(TurnPayload)(parsed);
	if (decoded._tag === "Left") {
		return { ok: false, error: `Invalid TurnPayload: ${decoded.left.message}` };
	}
	return { ok: true, payload: decoded.right };
};

export interface RecordTurnInput {
	readonly ccSessionId: string;
	readonly payloadJson: string;
	readonly occurredAt: string;
}

export const recordTurnEffect = (
	input: RecordTurnInput,
): Effect.Effect<{ turnId: number }, Error, DataReader | DataStore> =>
	Effect.gen(function* () {
		const parse = parseAndValidateTurnPayload(input.payloadJson);
		if (!parse.ok) {
			return yield* Effect.fail(new Error(parse.error));
		}
		const reader = yield* DataReader;
		const store = yield* DataStore;
		const sessionOpt = yield* reader.getSessionByCcId(input.ccSessionId);
		if (sessionOpt._tag === "None") {
			return yield* Effect.fail(
				new Error(`Unknown cc_session_id: ${input.ccSessionId}. Run record session-start first.`),
			);
		}
		const turnId = yield* store.writeTurn({
			session_id: sessionOpt.value.id,
			type: parse.payload.type,
			payload: input.payloadJson,
			occurred_at: input.occurredAt,
		});
		return { turnId };
	});
