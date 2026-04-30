import { Effect, Layer } from "effect";
import type { OutputFormat } from "../schemas/Common.js";
import { FormatSelector } from "../services/FormatSelector.js";

export const FormatSelectorLive = Layer.succeed(FormatSelector, {
	select: (executor, explicitFormat, environment) =>
		Effect.succeed<OutputFormat>(
			explicitFormat ??
				(environment === "ci-github" && executor === "ci"
					? "ci-annotations"
					: executor === "human"
						? "silent"
						: "markdown"),
		),
});
