/**
 * CLI overview command -- displays test landscape summary.
 *
 * @packageDocumentation
 */

import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { ProjectDiscovery } from "../../services/ProjectDiscovery.js";
import { formatOverview } from "../lib/format-overview.js";

const formatOption = Options.withDefault(Options.choice("format", ["markdown", "json"]), "markdown");

export const overviewCommand = Command.make("overview", { format: formatOption }, ({ format }) =>
	Effect.gen(function* () {
		const reader = yield* DataReader;
		const discovery = yield* ProjectDiscovery;

		// Read manifest if available
		let manifest = null;
		const manifestOpt = yield* reader.getManifest().pipe(Effect.catchAll(() => Effect.succeed(Option.none())));
		if (Option.isSome(manifestOpt)) manifest = manifestOpt.value;

		// Discover test files
		const testFiles = yield* discovery
			.discoverTestFiles(process.cwd())
			.pipe(
				Effect.catchAll(() =>
					Effect.succeed(
						[] as ReadonlyArray<{ readonly testFile: string; readonly sourceFiles: ReadonlyArray<string> }>,
					),
				),
			);

		if (format === "json") {
			const data = { manifest, testFiles };
			yield* Effect.sync(() => process.stdout.write(`${JSON.stringify(data, null, 2)}\n`));
		} else {
			const output = formatOverview(manifest, testFiles, null);
			yield* Effect.sync(() => process.stdout.write(`${output}\n`));
		}
	}),
);
