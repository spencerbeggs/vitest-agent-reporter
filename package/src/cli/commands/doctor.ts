/**
 * CLI doctor command -- diagnose cache health.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { FileSystem } from "@effect/platform";
import { Effect, Option } from "effect";
import { CacheReader } from "../../services/CacheReader.js";
import type { CheckResult } from "../lib/format-doctor.js";
import { formatDoctor } from "../lib/format-doctor.js";
import { resolveCacheDir } from "../lib/resolve-cache-dir.js";

const cacheDirOption = Options.text("cache-dir").pipe(
	Options.withAlias("d"),
	Options.withDescription("Cache directory path"),
	Options.optional,
);

export const doctorCommand = Command.make("doctor", { cacheDir: cacheDirOption }, ({ cacheDir }) =>
	Effect.gen(function* () {
		const reader = yield* CacheReader;
		const fs = yield* FileSystem.FileSystem;
		const results: CheckResult[] = [];

		// Check 1: Cache resolution
		const dirResult = yield* (Option.isSome(cacheDir) ? Effect.succeed(cacheDir.value) : resolveCacheDir).pipe(
			Effect.map((d) => ({ found: true as const, dir: d })),
			Effect.catchAll(() =>
				Effect.succeed({
					found: false as const,
					dir: undefined as string | undefined,
				}),
			),
		);

		if (!dirResult.found || !dirResult.dir) {
			results.push({
				name: "Cache found",
				passed: false,
				detail: "not found -- run tests first or specify --cache-dir",
			});
			const output = formatDoctor(results);
			yield* Effect.sync(() => process.stdout.write(`${output}\n`));
			yield* Effect.sync(() => process.exit(1));
			return;
		}

		const dir = dirResult.dir;
		results.push({
			name: "Cache found",
			passed: true,
			detail: `\`${dir}\``,
		});

		// Check 2: Manifest validation
		const manifestOpt = yield* reader
			.readManifest(dir)
			.pipe(Effect.catchAll(() => Effect.succeed(Option.none<never>())));

		if (Option.isNone(manifestOpt)) {
			const manifestExists = yield* fs
				.exists(`${dir}/manifest.json`)
				.pipe(Effect.catchAll(() => Effect.succeed(false)));

			results.push({
				name: "Manifest",
				passed: false,
				detail: manifestExists ? "`manifest.json` exists but is corrupt" : "`manifest.json` missing",
			});

			const output = formatDoctor(results);
			yield* Effect.sync(() => process.stdout.write(`${output}\n`));
			yield* Effect.sync(() => process.exit(1));
			return;
		}

		const manifest = manifestOpt.value;
		results.push({
			name: "Manifest valid",
			passed: true,
			detail: `${manifest.projects.length} project${manifest.projects.length !== 1 ? "s" : ""}`,
		});

		// Check 3: Report integrity
		let validReports = 0;
		const reportIssues: string[] = [];
		for (const entry of manifest.projects) {
			const reportPath = `${dir}/${entry.reportFile}`;
			const fileExists = yield* fs.exists(reportPath).pipe(Effect.catchAll(() => Effect.succeed(false)));

			if (!fileExists) {
				reportIssues.push(`\`${entry.reportFile}\` missing`);
				continue;
			}

			const reportOpt = yield* reader
				.readReport(dir, entry.project)
				.pipe(Effect.catchAll(() => Effect.succeed(Option.none<never>())));

			if (Option.isNone(reportOpt)) {
				reportIssues.push(`\`${entry.reportFile}\` corrupt`);
			} else {
				validReports++;
			}
		}

		const totalReports = manifest.projects.length;
		if (reportIssues.length > 0) {
			results.push({
				name: "Reports",
				passed: false,
				detail: `${validReports}/${totalReports} valid -- ${reportIssues.join(", ")}`,
			});
		} else {
			results.push({
				name: "Reports",
				passed: true,
				detail: `${validReports}/${totalReports} valid`,
			});
		}

		// Check 4: History integrity
		let validHistory = 0;
		let totalHistory = 0;
		const historyIssues: string[] = [];
		for (const entry of manifest.projects) {
			if (!entry.historyFile) continue;
			totalHistory++;
			const historyPath = `${dir}/${entry.historyFile}`;
			const fileExists = yield* fs.exists(historyPath).pipe(Effect.catchAll(() => Effect.succeed(false)));

			if (!fileExists) {
				historyIssues.push(`\`${entry.historyFile}\` missing`);
				continue;
			}

			// readHistory returns successfully for valid files (empty is valid initial state)
			yield* reader.readHistory(dir, entry.project);
			validHistory++;
		}

		if (totalHistory > 0) {
			if (historyIssues.length > 0) {
				results.push({
					name: "History",
					passed: false,
					detail: `${validHistory}/${totalHistory} valid -- ${historyIssues.join(", ")}`,
				});
			} else {
				results.push({
					name: "History",
					passed: true,
					detail: `${validHistory}/${totalHistory} valid`,
				});
			}
		}

		// Check 5: Staleness
		const timestamps = manifest.projects.map((e) => e.lastRun).filter((t): t is string => t !== null);

		if (timestamps.length > 0) {
			const latest = new Date(Math.max(...timestamps.map((t) => new Date(t).getTime())));
			const ageMs = Date.now() - latest.getTime();
			const ageMinutes = Math.floor(ageMs / 60_000);
			const ageHours = Math.floor(ageMs / 3_600_000);
			const ageDays = Math.floor(ageMs / 86_400_000);

			let ageStr: string;
			if (ageMinutes < 1) ageStr = "just now";
			else if (ageMinutes < 60) ageStr = `${ageMinutes} minute${ageMinutes !== 1 ? "s" : ""} ago`;
			else if (ageHours < 24) ageStr = `${ageHours} hour${ageHours !== 1 ? "s" : ""} ago`;
			else ageStr = `${ageDays} day${ageDays !== 1 ? "s" : ""} ago`;

			const isStale = ageHours >= 24;
			results.push({
				name: "Last run",
				passed: !isStale,
				detail: isStale ? `${ageStr} (stale)` : ageStr,
			});
		}

		// Output
		const output = formatDoctor(results);
		yield* Effect.sync(() => process.stdout.write(`${output}\n`));

		const hasFailures = results.some((r) => !r.passed);
		if (hasFailures) {
			yield* Effect.sync(() => process.exit(1));
		}
	}),
);
