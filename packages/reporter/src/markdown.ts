/**
 * Markdown reporter — structured tiered output (green/yellow/red) suitable
 * for Claude/MCP and other markdown-aware consumers.
 *
 * Always renders the SDK's `MarkdownFormatter` regardless of `kit.config.format`.
 * Pair with {@link defaultReporter} for env-aware format selection, or use
 * directly when you want markdown unconditionally.
 */

import type { ReporterRenderInput, VitestAgentReporter, VitestAgentReporterFactory } from "vitest-agent-sdk";
import { MarkdownFormatter } from "vitest-agent-sdk";
import { buildFormatterContext } from "./_kit-context.js";

export const markdownReporter: VitestAgentReporterFactory = (kit): VitestAgentReporter => ({
	render(input: ReporterRenderInput) {
		return MarkdownFormatter.render(input.reports, buildFormatterContext(kit, input.trendSummary));
	},
});
