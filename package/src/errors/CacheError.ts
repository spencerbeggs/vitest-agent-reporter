import { Data } from "effect";

export class CacheError extends Data.TaggedError("CacheError")<{
	readonly operation: "read" | "write" | "mkdir";
	readonly path: string;
	readonly reason: string;
}> {}
