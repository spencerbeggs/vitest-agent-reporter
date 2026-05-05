// packages/mcp/src/resources/manifest-schema.ts
import { Schema } from "effect";

const RELATIVE_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

export const ManifestPage = Schema.Struct({
	path: Schema.String.pipe(Schema.pattern(RELATIVE_PATH)),
	title: Schema.NonEmptyString,
	description: Schema.NonEmptyString,
});

export const UpstreamManifest = Schema.Struct({
	tag: Schema.NonEmptyString,
	commitSha: Schema.NonEmptyString,
	capturedAt: Schema.NonEmptyString,
	source: Schema.NonEmptyString,
	pages: Schema.optional(Schema.Array(ManifestPage)),
});

export type ManifestPage = Schema.Schema.Type<typeof ManifestPage>;
export type UpstreamManifest = Schema.Schema.Type<typeof UpstreamManifest>;

export const decodeUpstreamManifest = Schema.decodeUnknown(UpstreamManifest);
export const encodeUpstreamManifest = Schema.encodeUnknown(UpstreamManifest);
