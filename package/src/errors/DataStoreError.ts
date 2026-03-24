import { Data } from "effect";

export class DataStoreError extends Data.TaggedError("DataStoreError")<{
	readonly operation: "read" | "write" | "migrate";
	readonly table: string;
	readonly reason: string;
}> {}
