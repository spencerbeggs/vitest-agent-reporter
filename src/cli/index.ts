/**
 * CLI entry point for vitest-agent-reporter.
 *
 * @packageDocumentation
 */

import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { CliLive } from "../layers/CliLive.js";
import { coverageCommand } from "./commands/coverage.js";
import { historyCommand } from "./commands/history.js";
import { overviewCommand } from "./commands/overview.js";
import { statusCommand } from "./commands/status.js";

const rootCommand = Command.make("vitest-agent-reporter").pipe(
	Command.withSubcommands([statusCommand, overviewCommand, coverageCommand, historyCommand]),
);

const cli = Command.run(rootCommand, {
	name: "vitest-agent-reporter",
	version: "0.0.0",
});

export function runCli(): void {
	const main = Effect.suspend(() => cli(process.argv)).pipe(Effect.provide(CliLive), Effect.provide(NodeContext.layer));
	NodeRuntime.runMain(main);
}
