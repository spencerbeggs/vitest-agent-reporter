/**
 * vitest-agent-reporter
 *
 * {@link AgentPlugin} convenience wrapper that injects {@link AgentReporter}
 * into the Vitest reporter chain via the `configureVitest` hook (Vitest 3.1+).
 *
 * @packageDocumentation
 */

import type { Layer } from "effect";
import { Effect } from "effect";
import type { VitestPluginContext } from "vitest/node";
import type { AgentPluginOptions, Environment, OutputFormat, VitestAgentReporterFactory } from "vitest-agent-sdk";
import { EnvironmentDetector, EnvironmentDetectorLive, formatFatalError, resolveLogLevel } from "vitest-agent-sdk";
import { AgentReporter } from "./reporter.js";
import { resolveThresholds } from "./utils/resolve-thresholds.js";
import { stripConsoleReporters } from "./utils/strip-console-reporters.js";

/**
 * Plugin options shape with the (function-typed) `reporter` factory added
 * on top of the schema-defined {@link AgentPluginOptions}. Schema can't
 * easily encode functions, so the factory lives outside the published
 * Effect Schema.
 */
export interface AgentPluginConstructorOptions extends AgentPluginOptions {
	/**
	 * Factory that builds the reporter(s) the plugin will dispatch to.
	 * Defaults to the built-in `defaultReporter` from this package.
	 *
	 * Returning an array of reporters is supported: each is called once per
	 * run and their `RenderedOutput[]` results are concatenated and routed.
	 *
	 * Pass a factory function to swap out the default rendering pipeline:
	 * ```ts
	 * agentPlugin({ reporter: () => myReporter })
	 * ```
	 */
	reporter?: VitestAgentReporterFactory;
}

/**
 * Map strategy to output format for backward compatibility.
 *
 * @internal
 */
function resolveFormat(strategy: "own" | "complement", env: Environment, explicit?: OutputFormat): OutputFormat {
	if (explicit) return explicit;
	if (strategy === "own") {
		// "own" mode: agent gets the terminal formatter (plain text + ANSI;
		// no markdown noise for a target that doesn't render markdown).
		// Humans get silent so Vitest's own reporter handles their UX.
		return env === "agent-shell" ? "terminal" : "silent";
	}
	return "vitest-bypass";
}

/**
 * Resolve whether the reporter should write GFM to GITHUB_STEP_SUMMARY.
 *
 * @internal
 */
function resolveGithubActions(env: Environment, format: OutputFormat): boolean {
	if (env === "terminal") return false;
	if (format === "vitest-bypass" || format === "silent") return false;
	// GFM goes to the GitHub step summary file regardless of stdout format —
	// the markdown-rendering surface is independent of the terminal one.
	if (env === "ci-github" && (format === "markdown" || format === "terminal")) return true;
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
/**
 * Set to the Vitest object reference once we've pushed an aggregating
 * reporter for that Vitest instance. The flag is module-scoped (rather
 * than closure-scoped on the plugin) because Vitest can construct the
 * plugin more than once per `vitest run` invocation (e.g., once per
 * project). Keying the guard on the Vitest reference itself ensures we
 * push exactly one reporter per actual Vitest run, regardless of how
 * many times the plugin or `configureVitest` fires.
 *
 * The terminal/markdown formatters render all projects in one block
 * (Projects header, per-project rows, one Total at the bottom), so we
 * want exactly ONE reporter instance handling the whole run rather than
 * N reporters each rendering their own slice.
 *
 * @internal
 */
const aggregatedReporterByVitest = new WeakSet<object>();

export function AgentPlugin(options: AgentPluginConstructorOptions = {}, _layer?: Layer.Layer<EnvironmentDetector>) {
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
			try {
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

				// Map strategy + environment to format
				const format = resolveFormat(strategy, env, options.format);
				log("format:", format);

				// Determine if this is an agent environment (for reporter stripping)
				const isAgentEnv = env === "agent-shell";

				// Strip reporters when actively taking over the console — both
				// `markdown` (legacy) and `terminal` (new default for agent
				// stdout) replace Vitest's own progress output.
				if ((format === "markdown" || format === "terminal") && isAgentEnv) {
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

				// Resolve cache directory override with priority:
				// 1. Explicit reporter.cacheDir option
				// 2. outputFile['vitest-agent-reporter'] from vitest config (Vitest-native)
				// When unset, the reporter falls back to XDG-based resolution via
				// resolveDataPath (workspace name under $XDG_DATA_HOME).
				const outputFile = (vitest.config as { outputFile?: string | Record<string, string> }).outputFile;
				const cacheDir = options.reporterOptions?.cacheDir ?? resolveOutputDir(outputFile) ?? undefined;

				// Resolve coverage thresholds from plugin options or vitest config
				const coverageConfig = vitest.config.coverage as { thresholds?: Record<string, unknown> } | undefined;
				const coverageThresholds = resolveThresholds(
					(options.reporterOptions?.coverageThresholds as Record<string, unknown> | undefined) ??
						(coverageConfig?.thresholds as Record<string, unknown> | undefined),
				);
				const coverageTargets = options.reporterOptions?.coverageTargets
					? resolveThresholds(options.reporterOptions.coverageTargets as Record<string, unknown>)
					: undefined;
				const autoUpdate = options.reporterOptions?.autoUpdate ?? true;

				// Disable Vitest's native autoUpdate when our targets are set
				if (coverageTargets && autoUpdate) {
					const thresholds = coverageConfig?.thresholds;
					if (thresholds && typeof thresholds === "object") {
						(thresholds as Record<string, unknown>).autoUpdate = false;
					}
				}

				log("cacheDir:", cacheDir ?? "(XDG default)");

				// Push exactly one aggregating reporter per Vitest run. The
				// terminal/markdown formatters render all projects in one block
				// (Projects header + per-project rows + one Total), so a single
				// reporter handling all projects produces the right output. Per-
				// project calls after the first one still apply project-scoped
				// config (reporter stripping, native-coverage suppression) but
				// don't push another reporter.
				if (aggregatedReporterByVitest.has(vitest as object)) {
					log(
						"aggregate reporter already pushed for this Vitest run; skipping push for project:",
						project?.name ?? "(root)",
					);
					return;
				}

				const reporter = new AgentReporter({
					...options.reporterOptions,
					...(cacheDir !== undefined ? { cacheDir } : {}),
					coverageThresholds,
					coverageTargets,
					autoUpdate,
					format,
					mode,
					logLevel: options.logLevel,
					logFile: options.logFile,
					mcp,
					githubActions,
					...(options.reporter !== undefined && { reporter: options.reporter }),
				});

				// Push reporter into the config (mutating the reporters array)
				(vitest.config.reporters as unknown[]).push(reporter);
				aggregatedReporterByVitest.add(vitest as object);

				log("reporters after push:", vitest.config.reporters.length);
			} catch (err) {
				process.stderr.write(`vitest-agent-reporter: ${formatFatalError(err)}\n`);
				throw err;
			}
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
