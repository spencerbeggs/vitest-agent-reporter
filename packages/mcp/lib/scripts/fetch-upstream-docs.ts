#!/usr/bin/env tsx
// packages/mcp/lib/scripts/fetch-upstream-docs.ts
//
// Sparse-clones vitest-dev/vitest at the requested tag and writes the raw
// markdown tree from `docs/` to packages/mcp/lib/vitest-docs-raw/, plus an
// `.upstream-info.json` describing what was captured. The raw directory is
// gitignored — it is the agent's working area for the
// update-vitest-snapshot skill.
//
// Usage: pnpm exec tsx packages/mcp/lib/scripts/fetch-upstream-docs.ts --tag v4.1.5
//
// Security note: every git invocation uses execFileSync with array args so
// the tag string is never passed through a shell.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect } from "effect";
import { encodeUpstreamManifest } from "../../src/resources/manifest-schema.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(SCRIPT_DIR, "..", "..");
const RAW_DIR = resolve(PKG_DIR, "lib", "vitest-docs-raw");
const SOURCE_URL = "https://github.com/vitest-dev/vitest";

function copyMarkdownTree(src: string, dst: string): number {
	let count = 0;
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		const srcPath = join(src, entry.name);
		const dstPath = join(dst, entry.name);
		if (entry.isDirectory()) {
			mkdirSync(dstPath, { recursive: true });
			count += copyMarkdownTree(srcPath, dstPath);
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			copyFileSync(srcPath, dstPath);
			count++;
		}
	}
	return count;
}

function parseCliArgs(): { tag: string } {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: { tag: { type: "string", short: "t" } },
		strict: true,
	});
	if (!values.tag) {
		process.stderr.write("Usage: tsx fetch-upstream-docs.ts --tag <vN.M.K>\n");
		process.exit(1);
	}
	return { tag: values.tag };
}

const program = Effect.gen(function* () {
	const { tag } = parseCliArgs();
	yield* Console.log(`Fetching ${SOURCE_URL} at ${tag} ...`);

	const tmp = mkdtempSync(join(tmpdir(), "vitest-snapshot-"));
	try {
		execFileSync("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", "--branch", tag, SOURCE_URL, "."], {
			cwd: tmp,
			stdio: "inherit",
		});
		execFileSync("git", ["sparse-checkout", "set", "docs"], { cwd: tmp, stdio: "inherit" });
		const commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: tmp }).toString().trim();

		if (existsSync(RAW_DIR)) rmSync(RAW_DIR, { recursive: true, force: true });
		mkdirSync(RAW_DIR, { recursive: true });
		const copied = copyMarkdownTree(join(tmp, "docs"), RAW_DIR);
		yield* Console.log(`Copied ${copied} markdown files`);

		const encoded = yield* encodeUpstreamManifest({
			tag,
			commitSha,
			capturedAt: new Date().toISOString(),
			source: SOURCE_URL,
		});
		writeFileSync(join(RAW_DIR, ".upstream-info.json"), `${JSON.stringify(encoded, null, 2)}\n`);

		yield* Console.log("");
		yield* Console.log("Fetched:");
		yield* Console.log(`  tag:    ${tag}`);
		yield* Console.log(`  sha:    ${commitSha}`);
		yield* Console.log(`  output: ${RAW_DIR}`);
		yield* Console.log("");
		yield* Console.log("Next: pnpm exec tsx packages/mcp/lib/scripts/build-snapshot.ts");
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
});

NodeRuntime.runMain(program.pipe(Effect.tapErrorCause((cause) => Console.error(cause))));
