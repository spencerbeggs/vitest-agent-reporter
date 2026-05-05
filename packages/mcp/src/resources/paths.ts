// packages/mcp/src/resources/paths.ts
import { isAbsolute, normalize, resolve, sep } from "node:path";

/**
 * Resolves a user-provided relative path against a vendored root,
 * appending `.md` if missing and rejecting traversal attempts.
 */
export function resolveResourcePath(root: string, relativePath: string): string {
	if (relativePath === "") return root;
	if (relativePath.includes("\0")) {
		throw new Error("path contains null byte");
	}
	if (isAbsolute(relativePath)) {
		throw new Error("absolute path not allowed");
	}

	const stripped = relativePath.replace(/^\/+/, "");
	const withExt = stripped.endsWith(".md") ? stripped : `${stripped}.md`;
	const normalized = normalize(withExt);
	const resolved = resolve(root, normalized);

	const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
	if (!resolved.startsWith(rootWithSep) && resolved !== root) {
		throw new Error("path escapes vendor root");
	}

	return resolved;
}
