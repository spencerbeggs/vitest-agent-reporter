import { Schema } from "effect";

export const NotePayload = Schema.Struct({
	type: Schema.Literal("note"),
	scope: Schema.String,
	title: Schema.optional(Schema.String),
	content: Schema.String,
});

export type NotePayload = typeof NotePayload.Type;
