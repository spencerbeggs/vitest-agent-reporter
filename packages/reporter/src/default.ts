/**
 * Default reporter — env-aware composition of the named reporters.
 *
 * Picks the primary reporter based on `kit.config.format` (resolved by
 * the plugin's `FormatSelector`) and adds {@link githubSummaryReporter}
 * as a sidecar when the run is under GitHub Actions and the primary
 * format isn't already a CI-specific one (silent, vitest-bypass,
 * ci-annotations).
 *
 * Returns an array, leveraging the contract's
 * `VitestAgentReporter | ReadonlyArray<VitestAgentReporter>` shape:
 * the plugin invokes each reporter once per run and concatenates their
 * `RenderedOutput[]` before routing.
 *
 * This is what `agentPlugin()` uses when no `reporterFactory` is
 * supplied. Replicates the pre-split AgentReporter output behavior: the
 * same Formatter is chosen and a GFM step-summary is written under
 * GitHub Actions.
 */

import type { ReporterKit, VitestAgentReporter, VitestAgentReporterFactory } from "vitest-agent-sdk";
import { ciAnnotationsReporter } from "./ci-annotations.js";
import { githubSummaryReporter } from "./github-summary.js";
import { jsonReporter } from "./json.js";
import { markdownReporter } from "./markdown.js";
import { silentReporter } from "./silent.js";
import { terminalReporter } from "./terminal.js";

const primaryFor = (kit: ReporterKit): VitestAgentReporter => {
	switch (kit.config.format) {
		case "markdown":
			return markdownReporter(kit) as VitestAgentReporter;
		case "terminal":
			return terminalReporter(kit) as VitestAgentReporter;
		case "json":
			return jsonReporter(kit) as VitestAgentReporter;
		case "silent":
		case "vitest-bypass":
			return silentReporter(kit) as VitestAgentReporter;
		case "ci-annotations":
			return ciAnnotationsReporter(kit) as VitestAgentReporter;
	}
};

const wantsGfmSummary = (kit: ReporterKit): boolean => {
	if (kit.config.githubActions === true) return true;
	if (kit.stdEnv !== "ci-github") return false;
	const f = kit.config.format;
	return f !== "silent" && f !== "vitest-bypass" && f !== "ci-annotations";
};

export const defaultReporter: VitestAgentReporterFactory = (kit) => {
	const reporters: VitestAgentReporter[] = [primaryFor(kit)];
	if (wantsGfmSummary(kit)) reporters.push(githubSummaryReporter(kit) as VitestAgentReporter);
	return reporters;
};
