import { formatConsoleMarkdown } from "../utils/format-console.js";
import { osc8 } from "../utils/hyperlink.js";
import type { Formatter, FormatterContext, RenderedOutput } from "./types.js";

/**
 * Returns `label` wrapped in an OSC-8 hyperlink to `url` when the
 * formatter is rendering to stdout AND the user has not opted out of
 * color (NO_COLOR unset). For any other target (file, github-summary,
 * MCP-bound output) or when noColor is true, returns the plain label.
 */
const link = (
	url: string,
	label: string,
	ctx: FormatterContext,
	target: "stdout" | "file" | "github-summary",
): string => osc8(url, label, { enabled: target === "stdout" && !ctx.noColor });

/**
 * Wrap test-file paths in the failing-test markdown headers
 * (e.g. \`### X \`src/foo.test.ts\` \`\`) with OSC-8 hyperlinks pointing
 * at `file://` URLs. Stdout-only; the GFM/file/MCP RenderedOutputs
 * leave paths plain so MCP `triage_brief` and `wrapup_prompt`
 * responses never carry escape sequences.
 *
 * Conservative pattern match: only headers that begin with `### ` and
 * contain an inline-code-wrapped path (the failing-test header in
 * `format-console.ts`'s "Failed tests" section). All other backticks
 * (run commands, coverage paths, etc.) are left untouched.
 */
const HEADER_LINE = /^(### .*?)`([^`\n]+)`/gm;

const wrapHeaderLinks = (md: string, ctx: FormatterContext): string =>
	md.replace(HEADER_LINE, (_match, prefix: string, path: string) => {
		const url = `file://${path}`;
		return `${prefix}\`${link(url, path, ctx, "stdout")}\``;
	});

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
				const enriched = context.noColor ? md : wrapHeaderLinks(md, context);
				outputs.push({
					target: "stdout",
					content: enriched,
					contentType: "text/markdown",
				});
			}
		}
		return outputs;
	},
};
