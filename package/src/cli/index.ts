#!/usr/bin/env node
/**
 * CLI entry point for vitest-agent-reporter.
 *
 * @packageDocumentation
 */

import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Cause, Console, Effect } from "effect";
import { CliLive } from "../layers/CliLive.js";
import { cacheCommand } from "./commands/cache.js";
import { coverageCommand } from "./commands/coverage.js";
import { doctorCommand } from "./commands/doctor.js";
import { historyCommand } from "./commands/history.js";
import { overviewCommand } from "./commands/overview.js";
import { statusCommand } from "./commands/status.js";
import { trendsCommand } from "./commands/trends.js";

const rootCommand = Command.make("vitest-agent-reporter").pipe(
	Command.withSubcommands([
		statusCommand,
		overviewCommand,
		coverageCommand,
		historyCommand,
		trendsCommand,
		cacheCommand,
		doctorCommand,
	]),
);

const cli = Command.run(rootCommand, {
	name: "vitest-agent-reporter",
	version: "0.0.0",
});

const main = Effect.suspend(() => cli(process.argv)).pipe(
	Effect.provide(CliLive),
	Effect.provide(NodeContext.layer),
	Effect.catchAllCause((cause) => {
		const defects = Cause.defects(cause);
		if (defects.length > 0) {
			return Console.error(Cause.pretty(cause)).pipe(Effect.andThen(Effect.failCause(cause)));
		}
		return Effect.failCause(cause);
	}),
);

NodeRuntime.runMain(main);
