// packages/mcp/src/resources/upstream-docs.ts
import { readFile } from "node:fs/promises";
import { resolveResourcePath } from "./paths.js";

export interface ResourceReadResult {
	readonly content: string;
	readonly mimeType: "text/markdown";
}

export async function readUpstreamDoc(vendorRoot: string, relativePath: string): Promise<ResourceReadResult> {
	const absPath = resolveResourcePath(vendorRoot, relativePath);
	let content: string;
	try {
		content = await readFile(absPath, "utf8");
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "ENOENT" || code === "EISDIR") {
			throw new Error(`upstream doc not found: ${relativePath}`);
		}
		throw err;
	}
	return { content, mimeType: "text/markdown" };
}
