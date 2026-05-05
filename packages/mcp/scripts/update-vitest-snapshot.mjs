#!/usr/bin/env node
// packages/mcp/scripts/update-vitest-snapshot.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = dirname(SCRIPT_DIR);
const VENDOR_DIR = join(PACKAGE_DIR, "vendor", "vitest-docs");
const MANIFEST_PATH = join(VENDOR_DIR, "manifest.json");

function parseArgs(argv) {
	const args = { tag: null };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--tag" && argv[i + 1]) {
			args.tag = argv[i + 1];
			i++;
		}
	}
	return args;
}

function readCurrentTag() {
	try {
		const raw = readFileSync(MANIFEST_PATH, "utf8");
		return JSON.parse(raw).tag ?? null;
	} catch {
		return null;
	}
}

function walkMarkdown(rootDir, relPath = "") {
	const out = [];
	const entries = readdirSync(join(rootDir, relPath), { withFileTypes: true });
	for (const entry of entries) {
		const next = relPath ? `${relPath}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			out.push(...walkMarkdown(rootDir, next));
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			out.push(next);
		}
	}
	return out;
}

function emptyVendor() {
	rmSync(VENDOR_DIR, { recursive: true, force: true });
	mkdirSync(VENDOR_DIR, { recursive: true });
}

function copyAll(srcRoot, files) {
	for (const file of files) {
		const src = join(srcRoot, file);
		const dst = join(VENDOR_DIR, file);
		mkdirSync(dirname(dst), { recursive: true });
		copyFileSync(src, dst);
	}
}

function writeManifest(tag, commitSha) {
	const manifest = {
		tag,
		commitSha,
		capturedAt: new Date().toISOString(),
		source: "https://github.com/vitest-dev/vitest",
	};
	writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function ensureAttribution() {
	const path = join(VENDOR_DIR, "ATTRIBUTION.md");
	const content = [
		"# Attribution",
		"",
		"The markdown files under `vendor/vitest-docs/` are vendored from the [Vitest project](https://github.com/vitest-dev/vitest) under the MIT License.",
		"",
		"See `manifest.json` for the exact upstream tag and commit SHA captured.",
		"",
	].join("\n");
	writeFileSync(path, content);
}

function main() {
	const { tag: argTag } = parseArgs(process.argv.slice(2));
	const tag = argTag ?? readCurrentTag();
	if (!tag) {
		console.error("Error: no --tag provided and no existing manifest.json to read from.");
		console.error("Usage: node update-vitest-snapshot.mjs --tag v4.2.0");
		process.exit(1);
	}

	const tmp = mkdtempSync(join(tmpdir(), "vitest-snapshot-"));
	try {
		console.log(`Cloning vitest-dev/vitest at ${tag} (sparse, blob-filtered)...`);
		execFileSync(
			"git",
			[
				"clone",
				"--depth",
				"1",
				"--filter=blob:none",
				"--sparse",
				"--branch",
				tag,
				"https://github.com/vitest-dev/vitest",
				".",
			],
			{ cwd: tmp, stdio: "inherit" },
		);
		execFileSync("git", ["sparse-checkout", "set", "docs"], { cwd: tmp, stdio: "inherit" });
		const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmp }).toString().trim();

		const docsDir = join(tmp, "docs");
		const files = walkMarkdown(docsDir);
		console.log(`Found ${files.length} markdown files under docs/`);

		emptyVendor();
		copyAll(docsDir, files);
		writeManifest(tag, commitSha);
		ensureAttribution();

		console.log(`\nSnapshot complete:`);
		console.log(`  Tag:    ${tag}`);
		console.log(`  SHA:    ${commitSha}`);
		console.log(`  Files:  ${files.length}`);
		console.log(`  Output: ${relative(process.cwd(), VENDOR_DIR)}`);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

main();
