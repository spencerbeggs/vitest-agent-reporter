/**
 * CI Annotations reporter — emits GitHub Actions workflow command
 * annotations (`::error file=...,line=...::message`) per the GH workflow-
 * commands spec. The right pick when running under
 * `stdEnv === "ci-github"` with `executor === "ci"`, where the runner
 * picks up annotations and surfaces them as PR review comments.
 */

import type { ReporterRenderInput, VitestAgentReporter, VitestAgentReporterFactory } from "vitest-agent-sdk";
import { ciAnnotationsFormatter } from "vitest-agent-sdk";
import { buildFormatterContext } from "./_kit-context.js";

export const ciAnnotationsReporter: VitestAgentReporterFactory = (kit): VitestAgentReporter => ({
	render(input: ReporterRenderInput) {
		return ciAnnotationsFormatter.render(input.reports, buildFormatterContext(kit, input.trendSummary));
	},
});
