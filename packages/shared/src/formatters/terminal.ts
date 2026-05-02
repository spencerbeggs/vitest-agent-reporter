/**
 * Plain-text terminal formatter for stdout-bound agent / human output.
 *
 * Sibling to {@link MarkdownFormatter} and {@link GfmFormatter}. The
 * markdown variants exist for surfaces that *render* markdown — Claude
 * via MCP, GitHub via the step summary file. Terminal output never
 * renders markdown; emitting `## ` and backticks there is pure visual
 * noise. This formatter produces plain text with optional ANSI color,
 * compact columnar project rows, and a coverage section keyed on the
 * threshold-vs-target distinction.
 *
 * OSC-8 hyperlinks for failing-test paths live here (not in the
 * markdown formatter), gated on `target === "stdout" && !ctx.noColor`.
 *
 * @packageDocumentation
 */

import { formatTerminal } from "../utils/format-terminal.js";
import { osc8 } from "../utils/hyperlink.js";
import type { Formatter, FormatterContext, RenderedOutput } from "./types.js";

/**
 * Wrap test-file paths in failing-test rows with `file://` OSC-8
 * hyperlinks. Only fires when the target is stdout and noColor is
 * unset; MCP responses never reach this formatter so they cannot
 * accidentally pick up escape sequences.
 *
 * Conservative pattern: a 4-space-indented cross + " " + path + " \> "
 * (the failing-test row format from `format-terminal.ts`). All other
 * paths in the output (project rows, coverage rows, etc.) are left
 * plain — the link is only useful where a click-to-open IDE
 * integration helps the user investigate a failure.
 */
const FAILED_TEST_ROW = /^( {4}✗ )([^ ]+)( > )/gm;

const wrapHyperlinks = (text: string, ctx: FormatterContext): string =>
	text.replace(FAILED_TEST_ROW, (_match, prefix: string, path: string, suffix: string) => {
		const linked = osc8(`file://${path}`, path, { enabled: !ctx.noColor });
		return `${prefix}${linked}${suffix}`;
	});

export const TerminalFormatter: Formatter = {
	format: "terminal",
	render: (reports, context) => {
		const text = formatTerminal(reports, {
			noColor: context.noColor,
			coverageConsoleLimit: context.coverageConsoleLimit,
			...(context.trendSummary !== undefined ? { trendSummary: context.trendSummary } : {}),
			...(context.mcp !== undefined ? { mcp: context.mcp } : {}),
		});
		if (text === "") return [];
		const enriched = context.noColor ? text : wrapHyperlinks(text, context);
		const out: RenderedOutput = {
			target: "stdout",
			content: enriched,
			contentType: "text/plain",
		};
		return [out];
	},
};
