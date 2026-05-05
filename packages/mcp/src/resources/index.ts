// packages/mcp/src/resources/index.ts

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";
import { renderPatternsIndex, renderUpstreamIndex } from "./indexes.js";
import { decodeUpstreamManifest } from "./manifest-schema.js";
import { readPattern } from "./patterns.js";
import { readUpstreamDoc } from "./upstream-docs.js";

function resolveContentRoots(): { vendorRoot: string; patternsRoot: string } {
	// import.meta.url maps to two layouts:
	//   source (tsx/vitest):  packages/mcp/src/resources/index.ts -> vendor at ../vendor/vitest-docs
	//   built (rslib bundle): dist/<env>/<chunk>.js              -> vendor at ./vendor/vitest-docs (via copyPatterns)
	const here = dirname(fileURLToPath(import.meta.url));
	const builtBase = here;
	const sourceBase = join(here, "..");
	const base = existsSync(join(builtBase, "vendor")) ? builtBase : sourceBase;
	return {
		vendorRoot: join(base, "vendor", "vitest-docs"),
		patternsRoot: join(base, "patterns"),
	};
}

interface ListedPage {
	readonly relativePath: string;
	readonly title?: string;
	readonly description?: string;
}

async function listManifestPages(vendorRoot: string): Promise<ReadonlyArray<ListedPage>> {
	const manifestPath = join(vendorRoot, "manifest.json");
	if (!existsSync(manifestPath)) return [];
	let raw: string;
	try {
		raw = await readFile(manifestPath, "utf8");
	} catch {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	const decoded = await Effect.runPromise(
		decodeUpstreamManifest(parsed).pipe(Effect.catchAll(() => Effect.succeed(null))),
	);
	if (!decoded?.pages) return [];
	return decoded.pages.map((page) => ({
		relativePath: page.path,
		title: page.title,
		description: page.description,
	}));
}

export function registerAllResources(server: McpServer): void {
	const { vendorRoot, patternsRoot } = resolveContentRoots();

	server.registerResource(
		"vitest_docs_index",
		"vitest://docs/",
		{
			title: "Vitest Documentation Index",
			description: "Table of contents for the vendored vitest.dev documentation snapshot.",
			mimeType: "text/markdown",
		},
		async (uri) => {
			const result = await renderUpstreamIndex(vendorRoot);
			return {
				contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.content }],
			};
		},
	);

	server.registerResource(
		"vitest_docs_page",
		new ResourceTemplate("vitest://docs/{+path}", {
			list: async () => {
				const pages = await listManifestPages(vendorRoot);
				return {
					resources: pages.map((page) => ({
						name: `vitest_docs__${page.relativePath.replace(/\//g, "__")}`,
						uri: `vitest://docs/${page.relativePath}`,
						title: page.title ?? page.relativePath,
						description: page.description ?? `Vitest docs page: ${page.relativePath}`,
						mimeType: "text/markdown",
					})),
				};
			},
		}),
		{
			title: "Vitest Documentation Page",
			description: "A single page from the vendored vitest.dev docs.",
			mimeType: "text/markdown",
		},
		async (uri, variables) => {
			const path = variables["path"];
			const relative = Array.isArray(path) ? path.join("/") : String(path);
			const result = await readUpstreamDoc(vendorRoot, relative);
			return {
				contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.content }],
			};
		},
	);

	server.registerResource(
		"vitest_agent_patterns_index",
		"vitest-agent://patterns/",
		{
			title: "vitest-agent Patterns Index",
			description: "Table of contents for vitest-agent project's curated testing patterns.",
			mimeType: "text/markdown",
		},
		async (uri) => {
			const result = await renderPatternsIndex(patternsRoot);
			return {
				contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.content }],
			};
		},
	);

	server.registerResource(
		"vitest_agent_pattern",
		new ResourceTemplate("vitest-agent://patterns/{slug}", { list: undefined }),
		{
			title: "vitest-agent Pattern",
			description: "A single curated pattern from the vitest-agent project.",
			mimeType: "text/markdown",
		},
		async (uri, variables) => {
			const slug = variables["slug"];
			const slugStr = Array.isArray(slug) ? slug[0] : String(slug);
			const result = await readPattern(patternsRoot, slugStr);
			return {
				contents: [{ uri: uri.href, mimeType: result.mimeType, text: result.content }],
			};
		},
	);
}
