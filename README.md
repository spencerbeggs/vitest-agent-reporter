# vitest-agent-reporter

[![npm version](https://img.shields.io/npm/v/vitest-agent-reporter)](https://www.npmjs.com/package/vitest-agent-reporter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Vitest reporter for LLM coding agents. Produces structured markdown to
console, persistent JSON to disk, and GFM summaries for GitHub Actions --
so agents get actionable test feedback without the noise. Designed to
complement Vitest 4.1's built-in `agent` reporter, adding persistent
caching, coverage analysis, and CLI tooling on top.

## Features

- **Zero-config agent detection** -- uses [std-env](https://github.com/nicolo-ribaudo/std-env)
  to detect Claude Code, Cursor, Gemini CLI, Codex, Devin, and other agents
  automatically
- **Complement or own** -- layers on top of Vitest's built-in `agent`
  reporter by default, or takes over console output entirely
- **Persistent JSON cache** -- per-project reports with a manifest for
  selective reading
- **CLI bin** -- query test status, coverage gaps, and test landscape from
  the command line
- **Coverage gaps** -- flags files below threshold with uncovered line
  ranges, with scoped coverage for partial test runs
- **GitHub Actions GFM** -- writes structured summaries to
  `GITHUB_STEP_SUMMARY` automatically in CI

## Quick Start

```bash
npm install vitest-agent-reporter
```

```typescript
import { AgentPlugin } from "vitest-agent-reporter";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [AgentPlugin()],
});
```

That's it. The plugin detects whether an agent, CI, or human is running
tests and adjusts output automatically.

## Demo Output

When an agent runs tests and everything passes:

```markdown
## + Vitest -- 12 passed (340ms)

+ All tests passed

-> Cache: `node_modules/.cache/vitest-agent-reporter/reports/default.json`
```

When tests fail, the agent sees only what it needs to fix:

```markdown
## x Vitest -- 2 failed, 10 passed (520ms)

### x `src/utils.test.ts`

- x **compressLines > compresses consecutive lines into ranges**
  Expected "1-3,5" but received "1,2,3,5"

### Coverage gaps

- `src/coverage.ts` -- Lines: 42% -- uncovered: 65-80,95-110

### Next steps

- Re-run: `vitest run src/utils.test.ts`
- Full report: `node_modules/.cache/vitest-agent-reporter/reports/default.json`
```

## How It Works

The plugin detects three environments and adapts behavior:

| Environment | Detection | Console | JSON Cache | GFM Summary |
| --- | --- | --- | --- | --- |
| Agent | `std-env` agent detection | Vitest built-in or own markdown | Yes | Vitest built-in or own |
| CI | `GITHUB_ACTIONS`, `CI=true` | Silent (existing reporters kept) | Yes | Yes |
| Human | No agent/CI vars detected | Silent (existing reporters kept) | Yes | No |

In **agent mode** with `consoleStrategy: "complement"` (default), the plugin
layers on top of Vitest's built-in `agent` reporter -- adding JSON cache and
manifest while letting Vitest handle console suppression and GFM.

In **agent mode** with `consoleStrategy: "own"`, built-in console reporters
are suppressed and replaced with the compact markdown output (Phase 1
behavior).

In **CI mode**, your existing reporters stay active. The plugin adds GFM
output to `GITHUB_STEP_SUMMARY` for job summary display.

In **human mode**, the plugin runs silently -- JSON cache is written but
console output is suppressed so your normal reporter works undisturbed.

## CLI

The package provides a `vitest-agent-reporter` CLI bin for querying cached
test data:

```bash
# Show per-project pass/fail status
npx vitest-agent-reporter status

# Test landscape with file-to-test mapping
npx vitest-agent-reporter overview

# Coverage gap analysis (uses threshold from cached reports)
npx vitest-agent-reporter coverage
```

All commands accept `--cache-dir, -d` to specify the cache directory. When
omitted, the CLI checks common locations automatically.

## Cache and JSON Reports

All output lives under a single cache directory (default:
`node_modules/.cache/vitest-agent-reporter/`):

```text
node_modules/.cache/vitest-agent-reporter/
  manifest.json              # project index
  reports/
    default.json             # single-repo report
    core__unit.json           # monorepo: per-project reports
    api__integration.json
```

**Manifest-first read pattern:** agents read `manifest.json` once to find
failing projects, then open only those report files:

```json
{
  "updatedAt": "2025-01-15T10:30:00.000Z",
  "cacheDir": "node_modules/.cache/vitest-agent-reporter",
  "projects": [
    {
      "project": "default",
      "reportFile": "reports/default.json",
      "lastRun": "2025-01-15T10:30:00.000Z",
      "lastResult": "failed"
    }
  ]
}
```

Each report file contains structured test results:

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "reason": "failed",
  "summary": {
    "total": 12, "passed": 10, "failed": 2, "skipped": 0, "duration": 520
  },
  "failed": [
    {
      "file": "src/utils.test.ts",
      "state": "failed",
      "duration": 45,
      "tests": [
        {
          "name": "compresses consecutive lines",
          "fullName": "compressLines > compresses consecutive lines",
          "state": "failed",
          "errors": [
            { "message": "Expected \"1-3,5\" but received \"1,2,3,5\"" }
          ]
        }
      ]
    }
  ],
  "unhandledErrors": [],
  "failedFiles": ["src/utils.test.ts"]
}
```

## Configuration

### AgentPlugin Options

```typescript
AgentPlugin({
  mode: "auto",              // "auto" | "agent" | "silent"
  consoleStrategy: "complement", // "complement" | "own"
  reporter: {
    cacheDir: undefined,         // custom cache directory path
    coverageThreshold: 0,        // flag files below this % (0 = use vitest config)
    coverageConsoleLimit: 10,    // max low-coverage files in console output
    omitPassingTests: true,      // exclude passing tests from JSON reports
    includeBareZero: false,      // include files with all metrics at 0%
    githubSummaryFile: undefined // override GITHUB_STEP_SUMMARY path
  },
});
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `mode` | `"auto"` `"agent"` `"silent"` | `"auto"` | Force a specific mode instead of auto-detecting |
| `consoleStrategy` | `"complement"` `"own"` | `"complement"` | Layer on Vitest's agent reporter or take over console output |
| `reporter.cacheDir` | `string` | Vite's cacheDir | Override the cache directory path |
| `reporter.coverageThreshold` | `number` | `0` | Flag files below this coverage percentage |
| `reporter.coverageConsoleLimit` | `number` | `10` | Max low-coverage files shown in console |
| `reporter.omitPassingTests` | `boolean` | `true` | Exclude passing tests from JSON reports |
| `reporter.includeBareZero` | `boolean` | `false` | Include files where all metrics are 0% |
| `reporter.githubSummaryFile` | `string` | `GITHUB_STEP_SUMMARY` env var | Override the GFM output file path |

### Console Strategy

- **`"complement"`** (default) -- lets Vitest's built-in `agent` reporter
  handle console suppression and GFM summaries. This reporter adds JSON
  cache and manifest only. Does not strip any reporters from the chain.

- **`"own"`** -- takes over console output entirely. Strips built-in
  console reporters (including `agent`), uses this reporter's markdown
  formatter, and writes its own GFM. This was the default behavior in
  Phase 1.

### Cache Directory Resolution

The cache directory is resolved in this priority order:

1. Explicit `reporter.cacheDir` option
2. `outputFile['vitest-agent-reporter']` from Vitest config
3. Vite's `cacheDir` + `/vitest-agent-reporter` (default)

## Direct Reporter Usage

If you prefer not to use the plugin, configure `AgentReporter` directly:

```typescript
import { AgentReporter } from "vitest-agent-reporter";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: [
      new AgentReporter({
        cacheDir: ".vitest-agent-reporter",
        consoleOutput: "failures",
        coverageThreshold: 80,
      }),
    ],
  },
});
```

See [AgentReporterOptions](#agentplugin-options) for all configuration options.

## Programmatic Cache Access

For consumers who want to read cached reports programmatically, the package
exports `CacheReader` and `CacheReaderLive` (Effect services):

```typescript
import { CacheReader, CacheReaderLive, CacheError } from "vitest-agent-reporter";
import { Effect, Layer } from "effect";
import { NodeFileSystem } from "@effect/platform-node";

const program = Effect.gen(function* () {
  const reader = yield* CacheReader;
  const manifest = yield* reader.readManifest("/path/to/cache");
  // ... process manifest and reports
});

const live = CacheReaderLive.pipe(
  Layer.provideMerge(NodeFileSystem.layer),
);

await Effect.runPromise(Effect.provide(program, live));
```

## GitHub Actions

When `GITHUB_ACTIONS` is detected (or `githubActions: true` is set), the
reporter writes GFM-formatted output to `GITHUB_STEP_SUMMARY`. This
produces a job summary with:

- Pass/fail counts in a summary table
- Collapsible per-project details (monorepo)
- Coverage tables with threshold warnings
- Diff-fenced code blocks for assertion failures

No workflow configuration needed -- it works automatically in any GitHub
Actions job that runs vitest.

## Schemas

All data structures are defined as [Effect Schema](https://effect.website/docs/schema/introduction)
definitions. Import them for programmatic report validation:

```typescript
import { AgentReport, CacheManifest } from "vitest-agent-reporter";
import { Schema } from "effect";

const parsed = Schema.decodeUnknownSync(AgentReport)(rawData);
```

See the [Effect Schema docs](https://effect.website/docs/schema/introduction)
for more on schema usage.

## Requirements

- Vitest >= 4.1.0
- Node.js >= 22

## License

[MIT](./LICENSE)
