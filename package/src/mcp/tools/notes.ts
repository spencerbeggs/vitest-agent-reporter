import { Effect, Option, Schema } from "effect";
import { DataReader } from "../../services/DataReader.js";
import { DataStore } from "../../services/DataStore.js";
import { publicProcedure } from "../context.js";

const NoteScope = Schema.Literal("global", "project", "module", "suite", "test", "note");

export const noteCreate = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				title: Schema.String,
				content: Schema.String,
				scope: NoteScope,
				project: Schema.optional(Schema.String),
				subProject: Schema.optional(Schema.String),
				testFullName: Schema.optional(Schema.String),
				modulePath: Schema.optional(Schema.String),
				parentNoteId: Schema.optional(Schema.Number),
				createdBy: Schema.optional(Schema.String),
				expiresAt: Schema.optional(Schema.String),
				pinned: Schema.optional(Schema.Boolean),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const store = yield* DataStore;
				const noteInput = {
					title: input.title,
					content: input.content,
					scope: input.scope,
					...(input.project !== undefined && { project: input.project }),
					...(input.subProject !== undefined && { subProject: input.subProject }),
					...(input.testFullName !== undefined && { testFullName: input.testFullName }),
					...(input.modulePath !== undefined && { modulePath: input.modulePath }),
					...(input.parentNoteId !== undefined && { parentNoteId: input.parentNoteId }),
					...(input.createdBy !== undefined && { createdBy: input.createdBy }),
					...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
					...(input.pinned !== undefined && { pinned: input.pinned }),
				};
				const id = yield* store.writeNote(noteInput);
				return { id };
			}),
		);
	});

export const noteList = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				scope: Schema.optional(Schema.String),
				project: Schema.optional(Schema.String),
				testFullName: Schema.optional(Schema.String),
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				return yield* reader.getNotes(input.scope, input.project, input.testFullName);
			}),
		);
	});

export const noteGet = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				id: Schema.Number,
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				const noteOpt = yield* reader.getNoteById(input.id);
				return Option.getOrNull(noteOpt);
			}),
		);
	});

export const noteUpdate = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				id: Schema.Number,
				title: Schema.optional(Schema.String),
				content: Schema.optional(Schema.String),
				pinned: Schema.optional(Schema.Boolean),
				expiresAt: Schema.optional(Schema.String),
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const store = yield* DataStore;
				const { id } = input;
				const fields: Partial<import("../../services/DataStore.js").NoteInput> = {
					...(input.title !== undefined && { title: input.title }),
					...(input.content !== undefined && { content: input.content }),
					...(input.pinned !== undefined && { pinned: input.pinned }),
					...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
				};
				yield* store.updateNote(id, fields);
				return { success: true as const };
			}),
		);
	});

export const noteDelete = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				id: Schema.Number,
			}),
		),
	)
	.mutation(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const store = yield* DataStore;
				yield* store.deleteNote(input.id);
				return { success: true as const };
			}),
		);
	});

export const noteSearch = publicProcedure
	.input(
		Schema.standardSchemaV1(
			Schema.Struct({
				query: Schema.String,
			}),
		),
	)
	.query(async ({ ctx, input }) => {
		return ctx.runtime.runPromise(
			Effect.gen(function* () {
				const reader = yield* DataReader;
				return yield* reader.searchNotes(input.query);
			}),
		);
	});
