// packages/mcp/src/resources/index.ts

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { renderPatternsIndex, renderUpstreamIndex } from "./indexes.js";
import { readPattern } from "./patterns.js";
import { readUpstreamDoc } from "./upstream-docs.js";

function resolveContentRoots(): { vendorRoot: string; patternsRoot: string } {
	// __dirname equivalent for ESM. After build, this resolves to dist/<env>/resources/;
	// at runtime in tests/dev, it resolves to packages/mcp/src/resources/.
	// Both layouts have vendor/ and patterns/ as siblings two levels up.
	const here = dirname(fileURLToPath(import.meta.url));
	const packageRoot = join(here, "..", "..");
	return {
		vendorRoot: join(packageRoot, "vendor", "vitest-docs"),
		patternsRoot: join(packageRoot, "patterns"),
	};
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
		new ResourceTemplate("vitest://docs/{+path}", { list: undefined }),
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
