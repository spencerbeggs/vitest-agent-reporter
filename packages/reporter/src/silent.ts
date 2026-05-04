/**
 * Silent reporter — produces no output. Use this when you only want
 * persistence (the SQLite database is still written by the plugin) and no
 * console output. Functionally equivalent to `() => ({ render: () => [] })`
 * but ships as a named factory for symmetry with the other reporters.
 */

import type { ReporterRenderInput, VitestAgentReporter, VitestAgentReporterFactory } from "vitest-agent-sdk";

export const silentReporter: VitestAgentReporterFactory = (): VitestAgentReporter => ({
	render(_input: ReporterRenderInput) {
		return [];
	},
});
