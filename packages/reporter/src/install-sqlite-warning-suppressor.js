/**
 * Side-effect-only module: installs an interceptor that swallows Node's
 * `ExperimentalWarning: SQLite is an experimental feature ...` emission.
 *
 * Plain JavaScript (not TypeScript) and copied verbatim into the
 * package output via `copyPatterns` in rslib.config.ts. Keeping this
 * file out of the bundle ensures ESM's module-evaluation order is
 * preserved when something does `import "./install-sqlite-warning-
 * suppressor.js"` from a sibling — the bundler can't inline what it
 * doesn't see.
 *
 * The plugin loads this file in two places:
 *
 *   1. As a Vitest `setupFile` that the plugin auto-injects into
 *      `vitest.config.setupFiles`. Each Vitest worker loads it before
 *      its test files, so workers that import `node:sqlite` (e.g.
 *      via test fixtures) silently swallow the warning.
 *   2. (Future) As an opt-in published entry point for users who want
 *      to suppress the warning in their Vitest main process too —
 *      the main-process warning fires once during config load, before
 *      our plugin module runs, so it can only be intercepted by an
 *      import that comes ahead of `vitest-agent-reporter` in the
 *      user's own config.
 *
 * Idempotent across workers and processes via a `Symbol.for` flag on
 * `globalThis`. Other experimental warnings (Fetch API, etc.) pass
 * through unchanged.
 */

const FLAG = Symbol.for("vitest-agent-reporter/sqlite-warning-suppressor-installed");

if (globalThis[FLAG] !== true) {
	globalThis[FLAG] = true;
	const originalEmit = process.emit.bind(process);
	process.emit = (event, ...args) => {
		if (event === "warning" && args.length > 0) {
			const data = args[0];
			if (
				data !== null &&
				typeof data === "object" &&
				data.name === "ExperimentalWarning" &&
				typeof data.message === "string" &&
				data.message.includes("SQLite is an experimental feature")
			) {
				return false;
			}
		}
		return originalEmit(event, ...args);
	};
}
