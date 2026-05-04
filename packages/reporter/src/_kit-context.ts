/**
 * Build a {@link FormatterContext} from a {@link ReporterKit} and the
 * per-render {@link ReporterRenderInput.trendSummary | trendSummary}.
 *
 * Every reporter in this package converts kit + render input into the
 * same context shape before delegating to its chosen Formatter, so the
 * conversion lives here.
 *
 * @internal — module-private helper for the named reporter factories.
 */

import type { FormatterContext, ReporterKit, ReporterRenderInput } from "vitest-agent-sdk";

export const buildFormatterContext = (
	kit: ReporterKit,
	trendSummary?: ReporterRenderInput["trendSummary"],
): FormatterContext => {
	return {
		detail: kit.config.detail,
		noColor: kit.config.noColor,
		coverageConsoleLimit: kit.config.coverageConsoleLimit,
		...(kit.config.githubSummaryFile !== undefined && { githubSummaryFile: kit.config.githubSummaryFile }),
		...(kit.config.runCommand !== undefined && { runCommand: kit.config.runCommand }),
		...(kit.config.mcp ? { mcp: kit.config.mcp } : {}),
		...(trendSummary !== undefined && { trendSummary }),
	};
};
