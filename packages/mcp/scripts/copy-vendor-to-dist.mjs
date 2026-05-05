#!/usr/bin/env node
// packages/mcp/scripts/copy-vendor-to-dist.mjs
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = dirname(SCRIPT_DIR);
const SOURCES = ["vendor", "patterns"];
const TARGETS = ["dist/dev", "dist/npm"];

let copied = 0;
for (const source of SOURCES) {
	const src = join(PACKAGE_DIR, source);
	if (!existsSync(src)) {
		console.warn(`skip: ${source}/ does not exist yet`);
		continue;
	}
	for (const target of TARGETS) {
		const dst = join(PACKAGE_DIR, target, source);
		const targetParent = join(PACKAGE_DIR, target);
		if (!existsSync(targetParent)) {
			console.warn(`skip: ${target}/ does not exist yet`);
			continue;
		}
		mkdirSync(dirname(dst), { recursive: true });
		cpSync(src, dst, { recursive: true });
		console.log(`copied ${source}/ -> ${target}/${source}/`);
		copied++;
	}
}
console.log(`done: ${copied} copy operation(s)`);
