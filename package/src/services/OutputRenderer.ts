import type { Effect } from "effect";
import { Context } from "effect";
import type { FormatterContext, RenderedOutput } from "../formatters/types.js";
import type { AgentReport } from "../schemas/AgentReport.js";
import type { OutputFormat } from "../schemas/Common.js";

export class OutputRenderer extends Context.Tag("vitest-agent-reporter/OutputRenderer")<
	OutputRenderer,
	{
		readonly render: (
			reports: ReadonlyArray<AgentReport>,
			format: OutputFormat,
			context: FormatterContext,
		) => Effect.Effect<ReadonlyArray<RenderedOutput>>;
	}
>() {}
