/**
 * vitest-agent-reporter-cli
 *
 * On-demand CLI for vitest-agent-reporter. Reads cached test data and
 * reports status, overview, coverage, history, trends, and cache health.
 *
 * The default entry point is `bin.ts` (registered as the
 * `vitest-agent-reporter` bin); this barrel re-exports the supporting
 * pieces for programmatic use.
 *
 * @packageDocumentation
 */

export { CliLive } from "./layers/CliLive.js";
