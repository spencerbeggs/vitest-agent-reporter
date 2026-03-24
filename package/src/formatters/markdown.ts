import { formatConsoleMarkdown } from "../utils/format-console.js";
import type { Formatter, RenderedOutput } from "./types.js";

export const MarkdownFormatter: Formatter = {
	format: "markdown",
	render: (reports, context) => {
		const outputs: RenderedOutput[] = [];
		for (const report of reports) {
			const md = formatConsoleMarkdown(report, {
				consoleOutput: context.detail === "minimal" ? "failures" : "full",
				coverageConsoleLimit: context.coverageConsoleLimit,
				noColor: context.noColor,
				...(context.trendSummary !== undefined ? { trendSummary: context.trendSummary } : {}),
				...(context.runCommand !== undefined ? { runCommand: context.runCommand } : {}),
				...(context.mcp !== undefined ? { mcp: context.mcp } : {}),
			});
			if (md) {
				outputs.push({
					target: "stdout",
					content: md,
					contentType: "text/markdown",
				});
			}
		}
		return outputs;
	},
};
