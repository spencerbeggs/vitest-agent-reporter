/**
 * CLI doctor command -- diagnose database health.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { splitProject } from "../../utils/split-project.js";
import type { CheckResult } from "../lib/format-doctor.js";
import { formatDoctor } from "../lib/format-doctor.js";
import { resolveDbPath } from "../lib/resolve-cache-dir.js";

const formatOption = Options.withDefault(Options.choice("format", ["markdown", "json"]), "markdown");

const writeOutput = (results: CheckResult[], format: string) =>
	Effect.sync(() => {
		if (format === "json") {
			process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
		} else {
			process.stdout.write(`${formatDoctor(results)}\n`);
		}
	});

export const doctorCommand = Command.make("doctor", { format: formatOption }, ({ format }) =>
	Effect.gen(function* () {
		const reader = yield* DataReader;
		const results: CheckResult[] = [];

		// Check 1: Database resolution
		const dbResult = yield* resolveDbPath.pipe(
			Effect.map((d) => ({ found: true as const, path: d })),
			Effect.catchAll(() =>
				Effect.succeed({
					found: false as const,
					path: undefined as string | undefined,
				}),
			),
		);

		if (!dbResult.found || !dbResult.path) {
			results.push({
				name: "Database found",
				passed: false,
				detail: "not found -- run tests first",
			});
			yield* writeOutput(results, format);
			yield* Effect.sync(() => process.exit(1));
			return;
		}

		results.push({
			name: "Database found",
			passed: true,
			detail: `\`${dbResult.path}\``,
		});

		// Check 2: Manifest (can read project data from DB)
		const manifestOpt = yield* reader.getManifest().pipe(Effect.catchAll(() => Effect.succeed(Option.none<never>())));

		if (Option.isNone(manifestOpt)) {
			results.push({
				name: "Manifest",
				passed: false,
				detail: "no test run data found in database",
			});

			yield* writeOutput(results, format);
			yield* Effect.sync(() => process.exit(1));
			return;
		}

		const manifest = manifestOpt.value;
		results.push({
			name: "Manifest valid",
			passed: true,
			detail: `${manifest.projects.length} project${manifest.projects.length !== 1 ? "s" : ""}`,
		});

		// Check 3: Report integrity (can read latest run per project)
		let validReports = 0;
		const reportIssues: string[] = [];
		for (const entry of manifest.projects) {
			const { project, subProject } = splitProject(entry.project);
			const reportOpt = yield* reader
				.getLatestRun(project, subProject)
				.pipe(Effect.catchAll(() => Effect.succeed(Option.none<never>())));

			if (Option.isNone(reportOpt)) {
				reportIssues.push(`\`${entry.project}\` no report data`);
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

		// Check 4: History integrity (can read history per project)
		let validHistory = 0;
		let totalHistory = 0;
		const historyIssues: string[] = [];
		for (const entry of manifest.projects) {
			totalHistory++;
			const { project, subProject } = splitProject(entry.project);
			const history = yield* reader.getHistory(project, subProject).pipe(
				Effect.map((h) => ({ ok: true as const, record: h })),
				Effect.catchAll(() => Effect.succeed({ ok: false as const, record: null })),
			);

			if (!history.ok) {
				historyIssues.push(`\`${entry.project}\` history read error`);
			} else {
				validHistory++;
			}
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
		yield* writeOutput(results, format);

		const hasFailures = results.some((r) => !r.passed);
		if (hasFailures) {
			yield* Effect.sync(() => process.exit(1));
		}
	}),
);
