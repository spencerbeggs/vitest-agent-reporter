/**
 * Suppress Node's `ExperimentalWarning` for `node:sqlite`.
 *
 * Some test fixtures and tools in this package family touch the
 * built-in `node:sqlite` module (still flagged experimental in current
 * Node versions). Each load triggers a noisy stderr warning:
 *
 * ```text
 * (node:NNNNN) ExperimentalWarning: SQLite is an experimental feature
 * and might change at any time
 * ```
 *
 * The warning fires once per process via `process.emitWarning`. We
 * intercept `process.emit('warning', ...)` and swallow only this
 * specific warning class — other experimental warnings (which may
 * surface real upgrade signals) pass through untouched.
 *
 * Idempotent. Safe to call from multiple entry points (bin scripts,
 * the Vitest plugin); only the first call installs the wrapper.
 *
 * @packageDocumentation
 */

let installed = false;

/**
 * Install the warning interceptor. No-op after the first call.
 *
 * @public
 */
export const suppressSqliteExperimentalWarning = (): void => {
	if (installed) return;
	installed = true;

	const originalEmit = process.emit.bind(process);

	// Cast: process.emit's overloads are notoriously broad; we replace
	// it with a function that delegates to the original for everything
	// except the one warning we want to drop.
	(process as unknown as { emit: typeof process.emit }).emit = ((
		event: string | symbol,
		...args: unknown[]
	): boolean => {
		if (event === "warning" && args.length > 0) {
			const data = args[0];
			if (
				data !== null &&
				typeof data === "object" &&
				"name" in data &&
				(data as { name: unknown }).name === "ExperimentalWarning" &&
				"message" in data &&
				typeof (data as { message: unknown }).message === "string" &&
				(data as { message: string }).message.includes("SQLite is an experimental feature")
			) {
				return false;
			}
		}
		return originalEmit(event as never, ...(args as never[]));
	}) as typeof process.emit;
};
