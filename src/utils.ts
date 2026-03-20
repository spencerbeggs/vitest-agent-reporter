/**
 * vitest-agent-reporter
 *
 * Utility functions: compressLines, safeFilename, ansi/stripAnsi,
 * isGitHubActions, detectEnvironment, stripConsoleReporters.
 *
 * @packageDocumentation
 */

// --- compressLines ---

/**
 * Compress an array of line numbers into a compact range string.
 *
 * Consecutive line numbers are collapsed into `start-end` ranges,
 * separated by commas. Duplicate values are removed and the input
 * is sorted ascending before processing.
 *
 * @param lines - Array of line numbers to compress
 * @returns Compressed range string, or empty string for empty input
 *
 * @example
 * ```typescript
 * import { compressLines } from "vitest-agent-reporter/utils";
 *
 * compressLines([1, 2, 3, 5, 10, 11, 12]);
 * // Returns: "1-3,5,10-12"
 *
 * compressLines([42]);
 * // Returns: "42"
 *
 * compressLines([]);
 * // Returns: ""
 * ```
 *
 * @public
 */
export function compressLines(lines: number[]): string {
	if (lines.length === 0) return "";

	// Sort and deduplicate
	const sorted = [...new Set(lines)].sort((a, b) => a - b);

	const ranges: string[] = [];
	let start = sorted[0];
	let end = sorted[0];

	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i] === end + 1) {
			end = sorted[i];
		} else {
			ranges.push(start === end ? `${start}` : `${start}-${end}`);
			start = sorted[i];
			end = sorted[i];
		}
	}
	ranges.push(start === end ? `${start}` : `${start}-${end}`);

	return ranges.join(",");
}

// --- safeFilename ---

/**
 * Convert a project name to a filesystem-safe filename.
 *
 * Replaces `/` and `:` characters with `__` (double underscore).
 * Returns `"default"` for empty strings, which is used as the
 * fallback project name for single-repo configurations.
 *
 * @param name - Project name to sanitize
 * @returns Filesystem-safe filename string
 *
 * @example
 * ```typescript
 * import { safeFilename } from "vitest-agent-reporter/utils";
 *
 * safeFilename("\@savvy-web/my-lib:unit");
 * // Returns: "\@savvy-web__my-lib__unit"
 *
 * safeFilename("core");
 * // Returns: "core"
 *
 * safeFilename("");
 * // Returns: "default"
 * ```
 *
 * @public
 */
export function safeFilename(name: string): string {
	if (!name) return "default";
	return name.replace(/[/:]/g, "__");
}

// --- ansi / stripAnsi ---

/**
 * Options for ANSI color output control.
 *
 * @internal
 */
export interface AnsiOptions {
	noColor?: boolean;
}

const ANSI_CODES: Record<string, [number, number]> = {
	reset: [0, 0],
	bold: [1, 22],
	dim: [2, 22],
	red: [31, 39],
	green: [32, 39],
	yellow: [33, 39],
	cyan: [36, 39],
};

/**
 * Wrap text with an ANSI color/style escape code.
 *
 * No-ops when `options.noColor` is true, keeping output as valid plain
 * markdown when captured by agents or piped to files.
 *
 * @privateRemarks
 * Uses raw ANSI escape sequences (`\x1b[...m`) rather than a dependency
 * like `chalk` or `picocolors` to keep the package zero-dependency. The
 * `noColor` flag respects the `NO_COLOR` environment variable convention.
 *
 * @param text - Text to wrap
 * @param color - ANSI code name: `reset`, `bold`, `dim`, `red`, `green`, `yellow`, `cyan`
 * @param options - Control color output
 * @returns Text with ANSI escape codes, or plain text if noColor
 *
 * @see {@link https://no-color.org/ | NO_COLOR convention}
 * @internal
 */
export function ansi(text: string, color: string, options?: AnsiOptions): string {
	if (options?.noColor) return text;
	const codes = ANSI_CODES[color];
	if (!codes) return text;
	return `\x1b[${codes[0]}m${text}\x1b[${codes[1]}m`;
}

/**
 * Strip all ANSI escape codes from a string.
 *
 * @param text - String potentially containing ANSI escape sequences
 * @returns Plain text with all escape sequences removed
 *
 * @internal
 */
export function stripAnsi(text: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally strips ANSI escape sequences
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// --- isGitHubActions ---

/**
 * Detect whether the process is running inside GitHub Actions.
 *
 * Checks for `GITHUB_ACTIONS` set to `"true"` or `"1"`.
 *
 * @param env - Environment variables to check; defaults to `process.env`
 * @returns `true` when running in GitHub Actions
 *
 * @see {@link https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/store-information-in-variables#default-environment-variables | GitHub Actions default env vars}
 * @internal
 */
export function isGitHubActions(env?: Record<string, string | undefined>): boolean {
	const e = env ?? process.env;
	return e.GITHUB_ACTIONS === "true" || e.GITHUB_ACTIONS === "1";
}

// --- Environment Detection ---

/**
 * Detected runtime environment for the reporter.
 *
 * - `"agent"` -- an LLM coding agent is driving the tests
 * - `"ci"` -- running in CI (GitHub Actions, generic CI)
 * - `"human"` -- a human developer running tests locally
 *
 * @public
 */
export type RuntimeEnvironment = "agent" | "ci" | "human";

/**
 * Detect the runtime environment by checking for known agent, CI, and
 * human environment variable patterns.
 *
 * @remarks
 * Agent detection checks these environment variables in order:
 *
 * - `AI_AGENT` -- emerging cross-tool standard (any truthy value)
 * - `AUGMENT_AGENT=1` -- Augment Code
 * - `CLAUDECODE=1` -- Claude Code (Anthropic)
 * - `CLINE_ACTIVE=true` -- Cline (VS Code extension)
 * - `CODEX_SANDBOX` -- OpenAI Codex CLI (any value)
 * - `CURSOR_TRACE_ID` -- Cursor IDE agent (any value)
 * - `CURSOR_AGENT=1` -- Cursor CLI agent
 * - `GEMINI_CLI=1` -- Gemini CLI / Gemini Code Assist (Google)
 * - `AGENT` -- Goose, Amp, and other tools using this generic convention
 *
 * CI detection checks `GITHUB_ACTIONS` and the generic `CI=true`.
 * If no agent or CI variables are found, returns `"human"`.
 *
 * @param env - Environment variables to check; defaults to `process.env`
 * @returns The detected {@link RuntimeEnvironment}
 *
 * @example
 * ```typescript
 * import { detectEnvironment } from "vitest-agent-reporter/utils";
 *
 * const env = detectEnvironment();
 * // Returns "agent" when CLAUDECODE=1, "ci" in GitHub Actions, "human" otherwise
 *
 * // Testable with custom env:
 * const result = detectEnvironment({ CLAUDECODE: "1" });
 * // Returns "agent"
 * ```
 *
 * @see {@link https://docs.anthropic.com/en/docs/claude-code/overview | Claude Code docs}
 * @see {@link https://no-color.org/ | NO_COLOR convention}
 * @public
 */
export function detectEnvironment(env?: Record<string, string | undefined>): RuntimeEnvironment {
	const e = env ?? process.env;

	// Emerging standard
	if (e.AI_AGENT) return "agent";

	// Tool-specific agent detection (alphabetical by tool name)
	if (e.AUGMENT_AGENT === "1") return "agent";
	if (e.CLAUDECODE === "1") return "agent";
	if (e.CLINE_ACTIVE === "true") return "agent";
	if (e.CODEX_SANDBOX) return "agent";
	if (e.CURSOR_TRACE_ID) return "agent";
	if (e.CURSOR_AGENT === "1") return "agent";
	if (e.GEMINI_CLI === "1") return "agent";

	// Generic agent convention (Goose, Amp, etc.)
	if (e.AGENT) return "agent";

	// CI detection
	if (e.GITHUB_ACTIONS === "true" || e.GITHUB_ACTIONS === "1" || e.CI === "true") return "ci";

	return "human";
}

// --- Console Reporter Filtering ---

/**
 * Built-in Vitest reporters that write to the console (stdout).
 * These are the reporters suppressed when an agent takes over console output.
 *
 * @privateRemarks
 * `"agent"` is the built-in Vitest reporter added in v4.1 that reduces
 * console noise for AI agents. We strip it because our reporter replaces
 * its functionality with structured markdown output.
 *
 * @see {@link https://vitest.dev/api/advanced/reporters.html | Vitest Reporter docs}
 * @internal
 */
export const CONSOLE_REPORTERS = new Set([
	"default",
	"verbose",
	"tree",
	"dot",
	"tap",
	"tap-flat",
	"hanging-process",
	"agent",
]);

/**
 * Filter out built-in console reporters from a Vitest reporters array.
 *
 * Keeps custom reporters (class instances, file paths) and non-console
 * built-in reporters (`json`, `junit`, `html`, `blob`, `github-actions`).
 * Used by {@link AgentPlugin} in agent mode to suppress noisy console output.
 *
 * @param reporters - The Vitest `config.reporters` array
 * @returns Filtered array with console reporters removed
 *
 * @internal
 */
export function stripConsoleReporters(reporters: unknown[]): unknown[] {
	return reporters.filter((entry) => {
		// String name: "default", "verbose", etc.
		if (typeof entry === "string") {
			return !CONSOLE_REPORTERS.has(entry);
		}
		// Tuple: ["default", { options }]
		if (Array.isArray(entry) && typeof entry[0] === "string") {
			return !CONSOLE_REPORTERS.has(entry[0]);
		}
		// Class instance, file path with options, or unknown -- keep it
		return true;
	});
}
