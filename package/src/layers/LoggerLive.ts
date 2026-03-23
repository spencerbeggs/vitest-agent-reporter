import { appendFileSync } from "node:fs";
import { Layer, LogLevel, Logger } from "effect";

/**
 * Create a structured JSON (NDJSON) logger layer for stderr.
 *
 * When level is undefined or LogLevel.None, replaces the default logger with Logger.none (silent).
 * When logFile is set, composes with a file logger via Logger.zip.
 * Uses Logger.structuredLogger serialized to JSON for machine-readable output.
 */
export const LoggerLive = (level?: LogLevel.LogLevel, logFile?: string): Layer.Layer<never> => {
	if (!level || level._tag === "None") {
		return Logger.replace(Logger.defaultLogger, Logger.none);
	}

	// Build a stderr NDJSON logger from structuredLogger
	const stderrLogger = Logger.structuredLogger.pipe(
		Logger.map((entry) => JSON.stringify(entry)),
		Logger.withConsoleError,
	);

	const baseLogger = logFile
		? (() => {
				const fileLogger = Logger.make<unknown, void>(({ message, date, logLevel, annotations }) => {
					const entry = JSON.stringify({
						timestamp: date.toISOString(),
						level: logLevel._tag,
						message,
						...Object.fromEntries(annotations),
					});
					try {
						appendFileSync(logFile, `${entry}\n`);
					} catch {
						// Silently ignore file write failures in logging
					}
				});
				return Logger.zip(stderrLogger, fileLogger).pipe(Logger.map(() => undefined));
			})()
		: stderrLogger;

	return Layer.merge(Logger.replace(Logger.defaultLogger, baseLogger), Logger.minimumLogLevel(level));
};

/**
 * Resolve log level from option or environment variable.
 * Priority: explicit option \> VITEST_REPORTER_LOG_LEVEL env var \> undefined
 */
export function resolveLogLevel(option?: string): LogLevel.LogLevel | undefined {
	const raw = option ?? process.env.VITEST_REPORTER_LOG_LEVEL;
	if (!raw) return undefined;
	// Normalize: user passes lowercase ("debug"), Effect expects capitalized ("Debug")
	const normalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
	return LogLevel.fromLiteral(normalized as LogLevel.Literal);
}

/**
 * Resolve log file from option or environment variable.
 */
export function resolveLogFile(option?: string): string | undefined {
	return option ?? process.env.VITEST_REPORTER_LOG_FILE ?? undefined;
}
