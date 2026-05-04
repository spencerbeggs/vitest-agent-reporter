import { Schema } from "effect";

export const ToolCallPayload = Schema.Struct({
	type: Schema.Literal("tool_call"),
	tool_name: Schema.String,
	tool_input: Schema.Unknown,
	tool_use_id: Schema.optional(Schema.String),
});

export type ToolCallPayload = typeof ToolCallPayload.Type;
