/**
 * JSON reporter — emits the raw `AgentReport[]` as JSON to stdout. Useful
 * for downstream tooling that wants to consume report data programmatically
 * without scraping markdown.
 */

import type { ReporterRenderInput, VitestAgentReporter, VitestAgentReporterFactory } from "vitest-agent-sdk";
import { JsonFormatter } from "vitest-agent-sdk";
import { buildFormatterContext } from "./_kit-context.js";

export const jsonReporter: VitestAgentReporterFactory = (kit): VitestAgentReporter => ({
	render(input: ReporterRenderInput) {
		return JsonFormatter.render(input.reports, buildFormatterContext(kit, input.trendSummary));
	},
});
