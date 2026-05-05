// packages/mcp/src/resources/patterns.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResourceReadResult } from "./upstream-docs.js";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function readPattern(patternsRoot: string, slug: string): Promise<ResourceReadResult> {
	if (!SLUG_PATTERN.test(slug)) {
		throw new Error(`invalid slug: ${slug}`);
	}
	const absPath = join(patternsRoot, `${slug}.md`);
	try {
		const content = await readFile(absPath, "utf8");
		return { content, mimeType: "text/markdown" };
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "EISDIR") {
			throw new Error(`pattern not found: ${slug}. See vitest-agent://patterns/ for the index.`);
		}
		throw err;
	}
}
