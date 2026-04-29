/**
 * Formats history records into markdown for CLI output.
 *
 * @packageDocumentation
 */

import type { HistoryRecord, TestHistory } from "vitest-agent-reporter-shared";
import { classifyTest } from "vitest-agent-reporter-shared";

interface ClassifiedTest {
	test: TestHistory;
	project: string;
	classification: "flaky" | "persistent" | "recovered";
	failRate: string;
	consecutive: number;
	visualization: string;
	lastSeen: string;
}

function visualize(runs: TestHistory["runs"]): string {
	return [...runs]
		.reverse()
		.map((r) => (r.state === "passed" ? "P" : "F"))
		.join("");
}

function classifyFromHistory(test: TestHistory): "flaky" | "persistent" | "recovered" | "stable" | "new-failure" {
	if (test.runs.length === 0) return "stable";
	const current = test.runs[0].state;
	const prior = test.runs.slice(1);
	return classifyTest(current, prior);
}

function consecutiveFailures(runs: TestHistory["runs"]): number {
	let count = 0;
	for (const run of runs) {
		if (run.state === "failed") count++;
		else break;
	}
	return count;
}

export function formatHistory(records: ReadonlyArray<HistoryRecord>): string {
	const flaky: ClassifiedTest[] = [];
	const persistent: ClassifiedTest[] = [];
	const recovered: ClassifiedTest[] = [];

	for (const record of records) {
		for (const test of record.tests) {
			const cls = classifyFromHistory(test);
			if (cls === "stable" || cls === "new-failure") continue;

			const failCount = test.runs.filter((r) => r.state === "failed").length;
			const total = test.runs.length;
			const entry: ClassifiedTest = {
				test,
				project: record.project,
				classification: cls,
				failRate: `${failCount}/${total} (${Math.round((failCount / total) * 100)}%)`,
				consecutive: consecutiveFailures(test.runs),
				visualization: visualize(test.runs),
				lastSeen: test.runs.find((r) => r.state === "failed")?.timestamp.split("T")[0] ?? "",
			};

			if (cls === "flaky") flaky.push(entry);
			else if (cls === "persistent") persistent.push(entry);
			else recovered.push(entry);
		}
	}

	if (flaky.length === 0 && persistent.length === 0 && recovered.length === 0) {
		return "## Test Failure History\n\nNo failure history to display. All tracked tests are stable.";
	}

	const lines: string[] = ["## Test Failure History", ""];
	const projects = [...new Set([...flaky, ...persistent, ...recovered].map((e) => e.project))];

	for (const project of projects) {
		if (projects.length > 1 || project !== "default") {
			lines.push(`### Project: ${project}`, "");
		}

		const projFlaky = flaky.filter((e) => e.project === project);
		const projPersistent = persistent.filter((e) => e.project === project);
		const projRecovered = recovered.filter((e) => e.project === project);

		if (projFlaky.length > 0) {
			lines.push(`#### Flaky tests (${projFlaky.length})`, "");
			lines.push("| Test | Fail rate | Last runs | Last seen |");
			lines.push("| --- | --- | --- | --- |");
			for (const e of projFlaky) {
				lines.push(`| \`${e.test.fullName}\` | ${e.failRate} | ${e.visualization} | ${e.lastSeen} |`);
			}
			lines.push("");
		}

		if (projPersistent.length > 0) {
			lines.push(`#### Persistent failures (${projPersistent.length})`, "");
			lines.push("| Test | Consecutive | Last runs | Since |");
			lines.push("| --- | --- | --- | --- |");
			for (const e of projPersistent) {
				lines.push(`| \`${e.test.fullName}\` | ${e.consecutive} runs | ${e.visualization} | ${e.lastSeen} |`);
			}
			lines.push("");
		}

		if (projRecovered.length > 0) {
			lines.push(`#### Recently recovered (${projRecovered.length})`, "");
			lines.push("| Test | Last runs | Recovered |");
			lines.push("| --- | --- | --- |");
			for (const e of projRecovered) {
				const recoveredDate = e.test.runs[0]?.timestamp.split("T")[0] ?? "";
				lines.push(`| \`${e.test.fullName}\` | ${e.visualization} | ${recoveredDate} |`);
			}
			lines.push("");
		}
	}

	return lines.join("\n");
}
