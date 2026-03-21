import { Data } from "effect";

export class DiscoveryError extends Data.TaggedError("DiscoveryError")<{
	readonly operation: "glob" | "read" | "stat";
	readonly path: string;
	readonly reason: string;
}> {}
