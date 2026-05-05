// packages/mcp/src/resources/indexes.ts
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ResourceReadResult } from "./upstream-docs.js";

interface UpstreamManifest {
	readonly tag: string;
	readonly commitSha: string;
	readonly capturedAt: string;
}

interface PatternMeta {
	readonly slug: string;
	readonly title: string;
	readonly summary: string;
}

interface PatternsMeta {
	readonly patterns: ReadonlyArray<PatternMeta>;
}

async function listMarkdownPages(root: string): Promise<ReadonlyArray<string>> {
	const out: string[] = [];
	async function walk(rel: string): Promise<void> {
		const entries = await readdir(join(root, rel), { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
			const next = rel ? `${rel}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				await walk(next);
			} else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "ATTRIBUTION.md") {
				out.push(next.replace(/\.md$/, ""));
			}
		}
	}
	await walk("");
	out.sort();
	return out;
}

export async function renderUpstreamIndex(vendorRoot: string): Promise<ResourceReadResult> {
	const manifestRaw = await readFile(join(vendorRoot, "manifest.json"), "utf8");
	const manifest = JSON.parse(manifestRaw) as UpstreamManifest;
	const pages = await listMarkdownPages(vendorRoot);

	const grouped = new Map<string, string[]>();
	for (const page of pages) {
		const slash = page.indexOf("/");
		const section = slash === -1 ? "root" : page.slice(0, slash);
		const list = grouped.get(section) ?? [];
		list.push(page);
		grouped.set(section, list);
	}

	const lines: string[] = [];
	lines.push("# Vitest Documentation (Upstream Snapshot)");
	lines.push("");
	lines.push(
		`Snapshotted from [vitest-dev/vitest](https://github.com/vitest-dev/vitest) at tag \`${manifest.tag}\` (commit \`${manifest.commitSha.slice(0, 12)}\`).`,
	);
	lines.push("");
	lines.push("Fetch any page by URI: `vitest://docs/<path>` (e.g., `vitest://docs/api/mock`).");
	lines.push("");

	const sections = [...grouped.keys()].sort();
	for (const section of sections) {
		lines.push(`## ${section}`);
		lines.push("");
		for (const page of grouped.get(section) ?? []) {
			const display = page.startsWith(`${section}/`) ? page.slice(section.length + 1) : page;
			lines.push(`- \`vitest://docs/${page}\` — ${display}`);
		}
		lines.push("");
	}

	return { content: lines.join("\n"), mimeType: "text/markdown" };
}

export async function renderPatternsIndex(patternsRoot: string): Promise<ResourceReadResult> {
	const metaRaw = await readFile(join(patternsRoot, "_meta.json"), "utf8");
	const meta = JSON.parse(metaRaw) as PatternsMeta;

	const lines: string[] = [];
	lines.push("# vitest-agent Curated Patterns");
	lines.push("");
	lines.push(
		"Hand-written patterns specific to the vitest-agent project. Fetch any pattern by URI: `vitest-agent://patterns/<slug>`.",
	);
	lines.push("");
	for (const pattern of meta.patterns) {
		lines.push(`## ${pattern.title}`);
		lines.push("");
		lines.push(pattern.summary);
		lines.push("");
		lines.push(`- URI: \`vitest-agent://patterns/${pattern.slug}\``);
		lines.push("");
	}

	return { content: lines.join("\n"), mimeType: "text/markdown" };
}
