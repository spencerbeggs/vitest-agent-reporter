/**
 * Terminal reporter — plain text plus optional ANSI color and OSC-8
 * hyperlinks. The right pick for an `agent-shell` executor that doesn't
 * render markdown.
 */

import type { ReporterRenderInput, VitestAgentReporter, VitestAgentReporterFactory } from "vitest-agent-sdk";
import { TerminalFormatter } from "vitest-agent-sdk";
import { buildFormatterContext } from "./_kit-context.js";

export const terminalReporter: VitestAgentReporterFactory = (kit): VitestAgentReporter => ({
	render(input: ReporterRenderInput) {
		return TerminalFormatter.render(input.reports, buildFormatterContext(kit, input.trendSummary));
	},
});
