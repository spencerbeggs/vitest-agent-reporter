/**
 * vitest-agent-reporter
 *
 * Default reporter implementations for the {@link
 * https://npmjs.com/package/vitest-agent | vitest-agent} plugin.
 *
 * Each export implements the `VitestAgentReporter` contract from
 * `vitest-agent-sdk`: given resolved config + assembled per-run data, it
 * returns `RenderedOutput[]`. The plugin owns persistence and Vitest
 * lifecycle wiring; reporters are pure rendering callbacks.
 *
 * @packageDocumentation
 */

export { ciAnnotationsReporter } from "./ci-annotations.js";
export { defaultReporter } from "./default.js";
export { githubSummaryReporter } from "./github-summary.js";
export { jsonReporter } from "./json.js";
export { markdownReporter } from "./markdown.js";
export { silentReporter } from "./silent.js";
export { terminalReporter } from "./terminal.js";
