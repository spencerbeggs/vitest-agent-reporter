# vitest-agent-reporter

[![npm version](https://img.shields.io/npm/v/vitest-agent-reporter)](https://www.npmjs.com/package/vitest-agent-reporter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Vitest reporter for LLM coding agents. Produces structured markdown to
console, persistent JSON to disk, and GFM summaries for GitHub Actions --
so agents get actionable test feedback without the noise.

## Features

- **Zero-config agent detection** -- auto-detects Claude Code, Cursor, Cline,
  Gemini CLI, Codex, and other agents via environment variables
- **Compact failure output** -- failed tests with diffs and re-run commands,
  nothing else
- **Persistent JSON cache** -- per-project reports with a manifest for
  selective reading
- **Coverage gaps** -- flags files below threshold with uncovered line ranges
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
| Agent | `CLAUDECODE`, `CURSOR_TRACE_ID`, `AI_AGENT`, etc. | Structured markdown (failures only) | Yes | No |
| CI | `GITHUB_ACTIONS`, `CI=true` | Silent (existing reporters kept) | Yes | Yes |
| Human | No agent/CI vars detected | Silent (existing reporters kept) | Yes | No |

In **agent mode**, built-in console reporters (default, verbose, dot, etc.)
are suppressed. Only the compact markdown output remains.

In **CI mode**, your existing reporters stay active. The plugin adds GFM
output to `GITHUB_STEP_SUMMARY` for job summary display.

In **human mode**, the plugin runs silently -- JSON cache is written but
console output is suppressed so your normal reporter works undisturbed.

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
  mode: "auto",       // "auto" | "agent" | "silent"
  reporter: {
    cacheDir: undefined,         // custom cache directory path
    coverageThreshold: 0,        // flag files below this % (0 = use vitest config)
    coverageConsoleLimit: 10,    // max low-coverage files in console output
    omitPassingTests: true,      // exclude passing tests from JSON reports
    includeBareZero: false,      // skip files with all metrics at 0%
    githubSummaryFile: undefined // override GITHUB_STEP_SUMMARY path
  },
});
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `mode` | `"auto"` `"agent"` `"silent"` | `"auto"` | Force a specific mode instead of auto-detecting |
| `reporter.cacheDir` | `string` | Vite's cacheDir | Override the cache directory path |
| `reporter.coverageThreshold` | `number` | `0` | Flag files below this coverage percentage |
| `reporter.coverageConsoleLimit` | `number` | `10` | Max low-coverage files shown in console |
| `reporter.omitPassingTests` | `boolean` | `true` | Exclude passing tests from JSON reports |
| `reporter.includeBareZero` | `boolean` | `false` | Include files where all metrics are 0% |
| `reporter.githubSummaryFile` | `string` | `GITHUB_STEP_SUMMARY` env var | Override the GFM output file path |

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

See [docs/reporter.md](./docs/reporter.md) for all `AgentReporterOptions`.

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

## Agent Detection

The plugin checks these environment variables (in order):

| Variable | Agent |
| --- | --- |
| `AI_AGENT` | Cross-tool standard (any truthy value) |
| `AUGMENT_AGENT=1` | Augment Code |
| `CLAUDECODE=1` | Claude Code |
| `CLINE_ACTIVE=true` | Cline (VS Code extension) |
| `CODEX_SANDBOX` | OpenAI Codex CLI (any value) |
| `CURSOR_TRACE_ID` | Cursor IDE (any value) |
| `CURSOR_AGENT=1` | Cursor CLI agent |
| `GEMINI_CLI=1` | Gemini CLI / Gemini Code Assist |
| `AGENT` | Goose, Amp, and other generic agents |

## Zod Schemas

All data structures are defined as Zod v4 schemas with codecs for JSON
encode/decode. Import them for programmatic report validation:

```typescript
import { AgentReportCodec, CacheManifestCodec } from "vitest-agent-reporter";
import type { AgentReport } from "vitest-agent-reporter";
```

See [docs/schemas.md](./docs/schemas.md) for full schema documentation.

## Documentation

For configuration details, direct reporter usage, and schema reference,
see [docs/](./docs/).

## Requirements

- Vitest >= 4.1.0
- Node.js >= 22

## License

[MIT](./LICENSE)
