/**
 * vitest-agent-reporter
 *
 * {@link AgentPlugin} convenience wrapper that injects {@link AgentReporter}
 * into the Vitest reporter chain via the `configureVitest` hook (Vitest 3.1+).
 *
 * @packageDocumentation
 */

import { join } from "node:path";
import type { Layer } from "effect";
import { Effect } from "effect";
import { AgentDetectionLive } from "./layers/AgentDetectionLive.js";
import { AgentReporter } from "./reporter.js";
import type { AgentPluginOptions } from "./schemas/Options.js";
import { AgentDetection } from "./services/AgentDetection.js";
import { stripConsoleReporters } from "./utils/strip-console-reporters.js";

/**
 * Resolve console output mode based on the detected environment and console strategy.
 *
 * @internal
 */
function resolveConsoleOutput(
	env: "agent" | "ci" | "human",
	strategy: "own" | "complement",
): "failures" | "full" | "silent" {
	if (env === "human") return "silent";
	if (env === "agent" && strategy === "own") return "failures";
	// complement mode or CI + own: reporter stays silent
	return "silent";
}

/**
 * Resolve whether the reporter should write GFM to GITHUB_STEP_SUMMARY.
 *
 * @internal
 */
function resolveGithubActions(env: "agent" | "ci" | "human", strategy: "own" | "complement"): boolean {
	if (env === "human") return false;
	if (strategy === "complement") return false; // Vitest handles GFM
	if (env === "agent" && strategy === "own") return false; // agent mode, no GFM
	if (env === "ci" && strategy === "own") return true; // CI + own = we write GFM
	return false;
}

/**
 * Vitest plugin that injects {@link AgentReporter} into the reporter chain.
 *
 * @remarks
 * Uses the `configureVitest` hook (Vitest 3.1+). The reporter always runs
 * and writes JSON cache + manifest. Cache directory defaults to Vite's
 * `cacheDir` + `"/vitest-agent-reporter"`, sitting alongside Vitest's own cache.
 *
 * Console behavior depends on the detected environment (or forced `mode`) and
 * the `consoleStrategy` option:
 *
 * - **`"complement"` (default)**: Delegates console output to Vitest's built-in
 *   reporters (including the `agent` reporter). Our reporter stays silent on
 *   console but still writes JSON cache. Warns if the `agent` reporter is missing.
 * - **`"own"`**: Our reporter takes over console output. In agent mode, strips
 *   built-in console reporters and emits structured markdown. In CI mode, writes
 *   GFM to `GITHUB_STEP_SUMMARY`.
 *
 * Cache directory resolution priority:
 * 1. Explicit `reporter.cacheDir` option
 * 2. `outputFile['vitest-agent-reporter']` from Vitest config
 * 3. Vite's `cacheDir` + `"/vitest-agent-reporter"` (default)
 *
 * @param options - Plugin configuration options
 * @param _layer - Internal: override the AgentDetection layer (for testing)
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
 * // Force agent mode with own console strategy
 * export default defineConfig({
 *   plugins: [
 *     AgentPlugin({
 *       mode: "agent",
 *       consoleStrategy: "own",
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
 * @public
 */
export function AgentPlugin(options: AgentPluginOptions = {}, _layer?: Layer.Layer<AgentDetection>) {
	const mode = options.mode ?? "auto";
	const strategy = options.consoleStrategy ?? "complement";
	const layer = _layer ?? AgentDetectionLive;

	return {
		name: "vitest-agent-reporter",
		async configureVitest({
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
			// Determine environment from AgentDetection service or forced mode
			let env: "agent" | "ci" | "human";
			if (mode === "auto") {
				env = await Effect.runPromise(
					Effect.provide(
						Effect.flatMap(AgentDetection, (d) => d.environment),
						layer,
					),
				);
			} else {
				env = mode === "agent" ? "agent" : "human";
			}

			// Only strip reporters when actively taking over console
			if (strategy === "own" && env === "agent") {
				vitest.config.reporters = stripConsoleReporters(vitest.config.reporters);
			}

			// Complement mode warning: agent detected but no built-in agent reporter
			if (env === "agent" && strategy === "complement") {
				const hasAgentReporter = vitest.config.reporters.some(
					(r) => r === "agent" || (Array.isArray(r) && r[0] === "agent"),
				);
				if (!hasAgentReporter) {
					process.stderr.write(
						'[vitest-agent-reporter] Warning: consoleStrategy is "complement" but ' +
							'Vitest\'s built-in "agent" reporter is not in the reporter chain. ' +
							"Console output may be verbose. Add 'agent' to your reporters or set " +
							'consoleStrategy: "own".\n',
					);
				}
			}

			// Resolve console output and GFM based on env + strategy matrix
			const consoleOutput = resolveConsoleOutput(env, strategy);
			const githubActions = resolveGithubActions(env, strategy);

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
