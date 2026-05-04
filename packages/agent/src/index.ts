/**
 * vitest-agent
 *
 * Vitest plugin for the vitest-agent ecosystem. Owns persistence, history
 * classification, baselines, trend tracking, failure-signature computation,
 * and Vitest reporter-chain wiring. Dispatches the rendering stage to a
 * configurable reporter (default: `defaultReporter` from
 * `vitest-agent-reporter`).
 *
 * The current export surface is transitional: `AgentReporter` and
 * `AgentPlugin` are re-exported here as a checkpoint after the file move
 * out of `vitest-agent-reporter`. The next refactor pass replaces
 * `AgentReporter` with an internal Vitest-API class that delegates the
 * rendering stage to the user-supplied {@link VitestAgentReporter}, and
 * `AgentPlugin` gains the `reporter` factory option that drives that
 * delegation.
 *
 * @packageDocumentation
 */

// --- Plugin and internal Vitest reporter ---

export type { AgentPluginConstructorOptions } from "./plugin.js";
export { AgentPlugin } from "./plugin.js";
export type { AgentReporterConstructorOptions } from "./reporter.js";
export { AgentReporter } from "./reporter.js";

// --- Composition layer ---

export { ReporterLive } from "./layers/ReporterLive.js";

// --- CoverageAnalyzer service (only istanbul-aware service) ---

export { CoverageAnalyzerLive } from "./layers/CoverageAnalyzerLive.js";
export { CoverageAnalyzerTest } from "./layers/CoverageAnalyzerTest.js";
export { CoverageAnalyzer } from "./services/CoverageAnalyzer.js";

// --- Reporter-side utilities ---

export { captureEnvVars } from "./utils/capture-env.js";
export { captureSettings, hashSettings } from "./utils/capture-settings.js";
export type { VitestErrorLike, VitestStackFrameLike } from "./utils/process-failure.js";
export { processFailure } from "./utils/process-failure.js";
export type { VitestThresholdsInput } from "./utils/resolve-thresholds.js";
export { resolveThresholds } from "./utils/resolve-thresholds.js";
export { CONSOLE_REPORTERS, stripConsoleReporters } from "./utils/strip-console-reporters.js";
