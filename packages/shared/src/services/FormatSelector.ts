import type { Effect } from "effect";
import { Context } from "effect";
import type { Executor, OutputFormat } from "../schemas/Common.js";

export class FormatSelector extends Context.Tag("vitest-agent-reporter/FormatSelector")<
	FormatSelector,
	{
		readonly select: (executor: Executor, explicitFormat?: OutputFormat) => Effect.Effect<OutputFormat>;
	}
>() {}
