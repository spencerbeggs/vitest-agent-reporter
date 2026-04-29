import { Effect, Layer } from "effect";
import type { OutputFormat } from "../schemas/Common.js";
import { FormatSelector } from "../services/FormatSelector.js";

export const FormatSelectorLive = Layer.succeed(FormatSelector, {
	select: (executor, explicitFormat) =>
		Effect.succeed<OutputFormat>(explicitFormat ?? (executor === "human" ? "silent" : "markdown")),
});
