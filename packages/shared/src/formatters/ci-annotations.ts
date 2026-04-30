/**
 * GitHub Actions log annotation formatter.
 *
 * Emits `::error file=...,line=...::<message>` per failed test and a
 * single `::notice::<summary>` when the run passes. Activated via
 * --format=ci-annotations or auto-selected when environment is
 * ci-github.
 *
 * @packageDocumentation
 */

import type { AgentReport } from "../schemas/AgentReport.js";
import type { ReportError } from "../schemas/Common.js";
import type { Formatter, FormatterContext, RenderedOutput } from "./types.js";

const escapeData = (s: string): string => s.replace(/%/g, "%25").replace(/\n/g, "%0A").replace(/\r/g, "%0D");

const escapeProperty = (s: string): string =>
	s.replace(/%/g, "%25").replace(/\n/g, "%0A").replace(/\r/g, "%0D").replace(/:/g, "%3A").replace(/,/g, "%2C");

const STACK_FILE_LINE = /\(([^)\s]+):(\d+):\d+\)/;

function extractFileAndLine(error: ReportError, fallbackFile: string): { file: string; line: number } {
	if (error.stack !== undefined) {
		const m = STACK_FILE_LINE.exec(error.stack);
		if (m) {
			return { file: m[1], line: Number.parseInt(m[2], 10) };
		}
	}
	return { file: fallbackFile, line: 1 };
}

function annotateFailure(report: AgentReport): string[] {
	const lines: string[] = [];
	for (const mod of report.failed) {
		for (const test of mod.tests) {
			if (test.state !== "failed") continue;
			const errors = test.errors ?? [];
			if (errors.length === 0) {
				lines.push(
					`::error file=${escapeProperty(mod.file)},line=1,title=${escapeProperty(test.fullName)}::${escapeData(`${test.fullName} failed`)}`,
				);
				continue;
			}
			for (const err of errors) {
				const { file, line } = extractFileAndLine(err, mod.file);
				lines.push(
					`::error file=${escapeProperty(file)},line=${line},title=${escapeProperty(test.fullName)}::${escapeData(err.message)}`,
				);
			}
		}
	}
	for (const err of report.unhandledErrors) {
		lines.push(`::error title=Unhandled%20error::${escapeData(err.message)}`);
	}
	return lines;
}

export const ciAnnotationsFormatter: Formatter = {
	format: "ci-annotations",
	render: (reports: ReadonlyArray<AgentReport>, _context: FormatterContext): ReadonlyArray<RenderedOutput> => {
		const allLines: string[] = [];
		let totalPassed = 0;
		let totalFailed = 0;
		let totalSkipped = 0;
		let totalDuration = 0;
		for (const r of reports) {
			allLines.push(...annotateFailure(r));
			totalPassed += r.summary.passed;
			totalFailed += r.summary.failed;
			totalSkipped += r.summary.skipped;
			totalDuration += r.summary.duration;
		}
		// Reference unused total to keep TS strict happy when noUnusedLocals is on.
		void totalFailed;
		if (allLines.length === 0) {
			allLines.push(
				`::notice::${escapeData(`Vitest: ${totalPassed} passed, ${totalSkipped} skipped (${totalDuration}ms)`)}`,
			);
		}
		return [
			{
				target: "stdout",
				content: `${allLines.join("\n")}\n`,
				contentType: "text/plain",
			},
		];
	},
};
