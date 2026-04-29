import { Effect, Option } from "effect";
import { DataReader } from "vitest-agent-reporter-shared";
import { publicProcedure } from "../context.js";

export const cacheHealth = publicProcedure.query(async ({ ctx }) => {
	return ctx.runtime.runPromise(
		Effect.gen(function* () {
			const reader = yield* DataReader;
			const manifestOpt = yield* reader.getManifest();

			const lines: string[] = ["# Cache Health", ""];

			if (Option.isNone(manifestOpt)) {
				lines.push("- ❌ **Manifest:** not found — run tests to populate the cache");
				return lines.join("\n");
			}

			const manifest = manifestOpt.value;

			lines.push("- ✅ **Manifest:** present");
			lines.push(`- ℹ️ **Projects:** ${manifest.projects.length}`);
			lines.push(`- ℹ️ **Cache directory:** \`${manifest.cacheDir}\``);
			lines.push(`- ℹ️ **Last updated:** ${manifest.updatedAt}`);

			const now = Date.now();
			const updatedAt = new Date(manifest.updatedAt).getTime();
			const ageMs = now - updatedAt;
			const ageHours = ageMs / (1000 * 60 * 60);

			if (ageHours > 24) {
				lines.push(`- ⚠️ **Staleness:** cache is ${Math.round(ageHours)} hours old — consider re-running tests`);
			} else {
				lines.push(`- ✅ **Staleness:** cache is ${Math.round(ageHours * 60)} minutes old`);
			}

			lines.push("");
			lines.push("## Projects");
			lines.push("");

			for (const entry of manifest.projects) {
				const icon =
					entry.lastResult === "passed"
						? "✅"
						: entry.lastResult === "failed"
							? "❌"
							: entry.lastResult === "interrupted"
								? "⚠️"
								: "⬜";
				const lastRun = entry.lastRun ? new Date(entry.lastRun).toLocaleString() : "never";
				lines.push(`- ${icon} **${entry.project}** — last run: ${lastRun}`);
			}

			return lines.join("\n");
		}),
	);
});
