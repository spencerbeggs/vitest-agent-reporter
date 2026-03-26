import { Effect, Schema } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { publicProcedure } from "../context.js";

export const settingsList = publicProcedure.input(Schema.standardSchemaV1(Schema.Struct({}))).query(async ({ ctx }) => {
	return ctx.runtime.runPromise(
		Effect.gen(function* () {
			const reader = yield* DataReader;
			const settings = yield* reader.listSettings();

			if (settings.length === 0) {
				return "No settings found. Run tests first.";
			}

			const lines: string[] = ["## Settings", ""];
			lines.push("| Hash | Timestamp |");
			lines.push("| --- | --- |");

			for (const s of settings) {
				lines.push(`| ${s.hash} | ${s.capturedAt} |`);
			}

			return lines.join("\n");
		}),
	);
});
