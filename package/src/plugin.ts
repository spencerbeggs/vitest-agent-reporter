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
import type { VitestPluginContext } from "vitest/node";
import { EnvironmentDetectorLive } from "./layers/EnvironmentDetectorLive.js";
import { resolveLogLevel } from "./layers/LoggerLive.js";
import { AgentReporter } from "./reporter.js";
import type { Environment, OutputFormat } from "./schemas/Common.js";
import type { AgentPluginOptions } from "./schemas/Options.js";
import { EnvironmentDetector } from "./services/EnvironmentDetector.js";
import { resolveThresholds } from "./utils/resolve-thresholds.js";
import { stripConsoleReporters } from "./utils/strip-console-reporters.js";

/**
 * Map strategy to output format for backward compatibility.
 *
 * @internal
 */
function resolveFormat(strategy: "own" | "complement", explicit?: OutputFormat): OutputFormat {
	if (explicit) return explicit;
	return strategy === "own" ? "markdown" : "vitest-bypass";
}

/**
 * Resolve whether the reporter should write GFM to GITHUB_STEP_SUMMARY.
 *
 * @internal
 */
function resolveGithubActions(env: Environment, format: OutputFormat): boolean {
	if (env === "terminal") return false;
	if (format === "vitest-bypass" || format === "silent") return false;
	if (env === "ci-github" && format === "markdown") return true;
	return false;
}

/**
 * Vitest plugin that injects {@link AgentReporter} into the reporter chain.
 *
 * @param options - Plugin configuration options
 * @param _layer - Internal: override the EnvironmentDetector layer (for testing)
 * @returns Vitest plugin object with `configureVitest` hook
 *
 * @public
 */
export function AgentPlugin(options: AgentPluginOptions = {}, _layer?: Layer.Layer<EnvironmentDetector>) {
	const mode = options.mode ?? "auto";
	const strategy = options.strategy ?? "complement";
	const mcp = options.mcp ?? false;
	const layer = _layer ?? EnvironmentDetectorLive;

	// Resolve log level for local debug logging in the plugin.
	// The plugin runs outside an Effect program, so we use a simple stderr function.
	// logLevel/logFile options are passed through to AgentReporter for Effect logging.
	const logLevel = resolveLogLevel(options.logLevel);
	const shouldLog = logLevel !== undefined && logLevel._tag !== "None";
	const log = shouldLog
		? (...args: unknown[]) => process.stderr.write(`[vitest-agent-reporter:plugin] ${args.map(String).join(" ")}\n`)
		: (..._args: unknown[]) => {};

	return {
		name: "vitest-agent-reporter",
		async configureVitest(ctx: VitestPluginContext) {
			const { vitest, project } = ctx;
			log("configureVitest called | project:", project?.name ?? "(root)");

			log("mode:", mode, "| strategy:", strategy);

			// Determine environment from EnvironmentDetector service or forced mode
			let env: Environment;
			if (mode === "auto") {
				env = await Effect.runPromise(
					Effect.provide(
						Effect.flatMap(EnvironmentDetector, (d) => d.detect()),
						layer,
					),
				);
			} else {
				env = mode === "agent" ? "agent-shell" : "terminal";
			}
			log("env:", env);

			// Map strategy to format (backward compat)
			const format = resolveFormat(strategy, options.format);
			log("format:", format);

			// Determine if this is an agent environment (for reporter stripping)
			const isAgentEnv = env === "agent-shell";

			// Only strip reporters when actively taking over console
			if (format === "markdown" && isAgentEnv) {
				log("stripping console reporters");
				const stripped = stripConsoleReporters(vitest.config.reporters as unknown[]);
				// Write back via mutation (Vitest config is mutable at this point)
				(vitest.config as { reporters: unknown[] }).reporters = stripped;

				// Also suppress Vitest's native coverage text reporter (the big table)
				// since our reporter handles coverage output
				const coverageCfg = vitest.config.coverage as { reporter?: unknown[] } | undefined;
				if (coverageCfg) {
					log("suppressing native coverage text reporter");
					coverageCfg.reporter = [];
				}
			}

			// Complement mode warning: agent detected but no built-in agent reporter
			if (isAgentEnv && strategy === "complement" && format === "vitest-bypass") {
				const reporters = vitest.config.reporters as unknown[];
				const hasAgentReporter = reporters.some((r) => r === "agent" || (Array.isArray(r) && r[0] === "agent"));
				if (!hasAgentReporter) {
					process.stderr.write(
						'[vitest-agent-reporter] Warning: strategy is "complement" but ' +
							'Vitest\'s built-in "agent" reporter is not in the reporter chain. ' +
							"Console output may be verbose. Add 'agent' to your reporters or set " +
							'strategy: "own".\n',
					);
				}
			}

			// Resolve GFM based on env + format
			const githubActions = resolveGithubActions(env, format);
			log("githubActions:", githubActions);

			// Resolve cache directory with priority:
			// 1. Explicit reporter.cacheDir option
			// 2. outputFile['vitest-agent-reporter'] from vitest config (Vitest-native)
			// 3. Vite's cacheDir + /vitest-agent-reporter (default)
			const outputFile = (vitest.config as { outputFile?: string | Record<string, string> }).outputFile;
			const cacheDir =
				options.reporter?.cacheDir ??
				resolveOutputDir(outputFile) ??
				join(vitest.vite.config.cacheDir, "vitest-agent-reporter");

			// Resolve coverage thresholds from plugin options or vitest config
			const coverageConfig = vitest.config.coverage as { thresholds?: Record<string, unknown> } | undefined;
			const coverageThresholds = resolveThresholds(
				(options.reporter?.coverageThresholds as Record<string, unknown> | undefined) ??
					(coverageConfig?.thresholds as Record<string, unknown> | undefined),
			);
			const coverageTargets = options.reporter?.coverageTargets
				? resolveThresholds(options.reporter.coverageTargets as Record<string, unknown>)
				: undefined;
			const autoUpdate = options.reporter?.autoUpdate ?? true;

			// Disable Vitest's native autoUpdate when our targets are set
			if (coverageTargets && autoUpdate) {
				const thresholds = coverageConfig?.thresholds;
				if (thresholds && typeof thresholds === "object") {
					(thresholds as Record<string, unknown>).autoUpdate = false;
				}
			}

			log("cacheDir:", cacheDir);

			// In multi-project mode, scope this reporter to its project
			const projectFilter = project?.name;
			log("projectFilter:", projectFilter ?? "(none)");

			const reporter = new AgentReporter({
				...options.reporter,
				cacheDir,
				coverageThresholds,
				coverageTargets,
				autoUpdate,
				format,
				mode,
				logLevel: options.logLevel,
				logFile: options.logFile,
				mcp,
				githubActions,
				...(projectFilter ? { projectFilter } : {}),
			});

			// Push reporter into the config (mutating the reporters array)
			(vitest.config.reporters as unknown[]).push(reporter);

			log("reporters after push:", vitest.config.reporters.length);
		},
	};
}

/**
 * Read the `outputFile` config for the `"vitest-agent-reporter"` key.
 *
 * @internal
 */
function resolveOutputDir(outputFile: string | Record<string, string> | undefined): string | null {
	if (!outputFile || typeof outputFile === "string") return null;
	return outputFile["vitest-agent-reporter"] ?? null;
}
