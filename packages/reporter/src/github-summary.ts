/**
 * GitHub Summary reporter — emits a single `RenderedOutput` with
 * `target: "github-summary"` carrying the GFM rendering of the run.
 * The plugin's router writes it to `$GITHUB_STEP_SUMMARY`.
 *
 * Used by {@link defaultReporter} as a sidecar reporter when the run
 * looks like it's under GitHub Actions, so the markdown/terminal stdout
 * output and the GFM summary file can be produced in a single render
 * pass without one stomping on the other.
 */

import type {
	AgentReport,
	ReporterRenderInput,
	VitestAgentReporter,
	VitestAgentReporterFactory,
} from "vitest-agent-sdk";
import { formatGfm } from "vitest-agent-sdk";

export const githubSummaryReporter: VitestAgentReporterFactory = (): VitestAgentReporter => ({
	render(input: ReporterRenderInput) {
		return [
			{
				target: "github-summary" as const,
				// formatGfm's signature predates the readonly contract
				// modernization; the call is read-only in practice.
				content: formatGfm(input.reports as AgentReport[]),
				contentType: "text/markdown",
			},
		];
	},
});
