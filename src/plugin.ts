/**
 * vitest-agent-reporter
 *
 * {@link AgentPlugin} convenience wrapper that injects {@link AgentReporter}
 * into the Vitest reporter chain via the `configureVitest` hook (Vitest 3.1+).
 *
 * @packageDocumentation
 */

import { join } from "node:path";
import { AgentReporter } from "./reporter.js";
import type { AgentPluginOptions } from "./types.js";
import { detectEnvironment, stripConsoleReporters } from "./utils.js";

/**
 * Vitest plugin that injects {@link AgentReporter} into the reporter chain.
 *
 * @remarks
 * Uses the `configureVitest` hook (Vitest 3.1+). The reporter always runs
 * and writes JSON cache + manifest. Cache directory defaults to Vite's
 * `cacheDir` + `"/vitest-agent-reporter"`, sitting alongside Vitest's own cache.
 *
 * Console behavior depends on the detected environment (or forced `mode`):
 *
 * - **Agent** (e.g., `CLAUDECODE=1`): suppresses built-in console reporters,
 *   shows only structured markdown output with failure details
 * - **CI** (`GITHUB_ACTIONS`, `CI=true`): keeps existing reporters,
 *   adds GFM summary to `GITHUB_STEP_SUMMARY`
 * - **Human**: keeps existing reporters, reporter runs silently
 *   (cache/JSON only, no console output)
 *
 * Cache directory resolution priority:
 * 1. Explicit `reporter.cacheDir` option
 * 2. `outputFile['vitest-agent-reporter']` from Vitest config
 * 3. Vite's `cacheDir` + `"/vitest-agent-reporter"` (default)
 *
 * @param options - Plugin configuration options
 * @returns Vitest plugin object with `configureVitest` hook
 *
 * @example
 * ```typescript
 * import { AgentPlugin } from "vitest-agent-reporter";
 * import { defineConfig } from "vitest/config";
 *
 * export default defineConfig({
 *   plugins: [AgentPlugin()],
 *   test: {
 *     // AgentReporter is injected automatically
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * import { AgentPlugin } from "vitest-agent-reporter";
 * import { defineConfig } from "vitest/config";
 *
 * // Force agent mode regardless of environment
 * export default defineConfig({
 *   plugins: [
 *     AgentPlugin({
 *       mode: "agent",
 *       reporter: {
 *         coverageThreshold: 80,
 *         coverageConsoleLimit: 5,
 *       },
 *     }),
 *   ],
 * });
 * ```
 *
 * @see {@link AgentReporter} for direct reporter usage without the plugin
 * @see {@link AgentPluginOptions} for all configuration options
 * @see {@link detectEnvironment} for environment detection details
 * @public
 */
export function AgentPlugin(options: AgentPluginOptions = {}) {
	const mode = options.mode ?? "auto";

	return {
		name: "vitest-agent-reporter",
		configureVitest({
			vitest,
		}: {
			vitest: {
				config: {
					reporters: unknown[];
					coverage: { thresholds?: Record<string, unknown> };
					outputFile?: string | Record<string, string>;
				};
				vite: { config: { cacheDir: string } };
			};
		}) {
			const env = mode === "auto" ? detectEnvironment() : mode === "agent" ? "agent" : "human";

			let consoleOutput: "failures" | "full" | "silent";
			let githubActions: boolean;

			switch (env) {
				case "agent":
					consoleOutput = "failures";
					githubActions = false;
					vitest.config.reporters = stripConsoleReporters(vitest.config.reporters);
					break;
				case "ci":
					consoleOutput = "silent";
					githubActions = true;
					break;
				default:
					consoleOutput = "silent";
					githubActions = false;
					break;
			}

			// Resolve cache directory with priority:
			// 1. Explicit reporter.cacheDir option
			// 2. outputFile['vitest-agent-reporter'] from vitest config (Vitest-native)
			// 3. Vite's cacheDir + /vitest-agent-reporter (default)
			const cacheDir =
				options.reporter?.cacheDir ??
				resolveOutputDir(vitest.config.outputFile) ??
				join(vitest.vite.config.cacheDir, "vitest-agent-reporter");

			// Read coverage threshold from vitest config if not explicitly set
			const coverageThreshold = options.reporter?.coverageThreshold ?? extractCoverageThreshold(vitest.config.coverage);

			vitest.config.reporters.push(
				new AgentReporter({
					...options.reporter,
					cacheDir,
					coverageThreshold,
					consoleOutput,
					githubActions,
				}),
			);
		},
	};
}

/**
 * Read the `outputFile` config for the `"vitest-agent-reporter"` key.
 *
 * @remarks
 * Vitest's `outputFile` can be a string (single file) or a record mapping
 * reporter names to file paths. We only use the record form and look for
 * our reporter name as the key.
 *
 * @param outputFile - Vitest's resolved `outputFile` config
 * @returns The configured output directory path, or `null`
 *
 * @internal
 */
function resolveOutputDir(outputFile: string | Record<string, string> | undefined): string | null {
	if (!outputFile || typeof outputFile === "string") return null;
	return outputFile["vitest-agent-reporter"] ?? null;
}

/**
 * Extract a single coverage threshold from Vitest's resolved coverage config.
 *
 * @remarks
 * When multiple metric thresholds are configured (lines, statements, branches,
 * functions), returns the **minimum** value. This ensures files are flagged
 * when they fall below any configured threshold. Returns `0` if no thresholds
 * are configured.
 *
 * @param coverage - Vitest's resolved coverage config object
 * @returns The minimum configured threshold, or `0`
 *
 * @internal
 */
function extractCoverageThreshold(coverage: { thresholds?: Record<string, unknown> }): number {
	const thresholds = coverage?.thresholds;
	if (!thresholds) return 0;

	const metrics = ["lines", "statements", "branches", "functions"] as const;
	const values = metrics.map((m) => thresholds[m]).filter((v): v is number => typeof v === "number");

	if (values.length === 0) return 0;
	return Math.min(...values);
}
