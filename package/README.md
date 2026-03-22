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
- **CLI bin** -- query test status, coverage gaps, test landscape, and
  failure history from the command line
- **Coverage thresholds and targets** -- Vitest-native threshold format
  plus aspirational targets with auto-ratcheting baselines
- **Coverage trends** -- tracks coverage direction across runs with
  tiered console output (green/yellow/red)
- **Failure history tracking** -- persists per-test failure data across
  runs to distinguish new failures, persistent failures, flaky tests, and
  recovered tests
- **Test classification** -- each test is classified as `stable`,
  `new-failure`, `persistent`, `flaky`, or `recovered` based on run history
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
  plugins: [
    AgentPlugin({
      reporter: {
        coverageThresholds: { lines: 80, branches: 80 },
      },
    }),
  ],
});
```

That's it. The plugin detects whether an agent, CI, or human is running
tests and adjusts output automatically.

## Demo Output

**Green tier** -- all tests pass, all coverage targets met:

```markdown
## + Vitest -- 12 passed (340ms)

Coverage: all targets met | trending improving over 5 runs

+ All tests passed

-> Cache: `node_modules/.cache/vitest-agent-reporter/reports/default.json`
```

**Yellow tier** -- tests pass but coverage is below targets:

```markdown
## + Vitest -- 12 passed (340ms)

Coverage: 2 files below target | trending improving over 3 runs

### Room for improvement

- `src/utils.ts` -- Lines: 72% (target: 80%) -- uncovered: 42-50,99

-> Cache: `node_modules/.cache/vitest-agent-reporter/reports/default.json`
```

**Red tier** -- test failures or threshold violations:

```markdown
## x Vitest -- 2 failed, 10 passed (520ms)

### x `src/utils.test.ts`

- x **compressLines > compresses consecutive lines into ranges**
  Expected "1-3,5" but received "1,2,3,5"

### Coverage gaps

- `src/coverage.ts` -- Lines: 42% (threshold: 80%) -- uncovered: 65-80,95-110

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
are suppressed and replaced with the compact markdown output.

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

# Failure history with test classification across runs
npx vitest-agent-reporter history

# Coverage trends across runs with target gap analysis
npx vitest-agent-reporter trends

# Print the resolved cache directory path
npx vitest-agent-reporter cache path

# Delete all cached data
npx vitest-agent-reporter cache clean

# Diagnose cache health (manifest, reports, history, staleness)
npx vitest-agent-reporter doctor
```

All commands accept `--cache-dir, -d` to specify the cache directory. When
omitted, the CLI checks common locations automatically.

## Documentation

For detailed guides on configuration, direct reporter usage, schemas,
and more:

| Guide | Description |
| --- | --- |
| [Configuration](../docs/configuration.md) | Plugin and reporter options, thresholds, targets, cache resolution |
| [Direct Reporter Usage](../docs/reporter.md) | Using `AgentReporter` without the plugin |
| [Schemas](../docs/schemas.md) | Effect Schema definitions, programmatic validation |
| [CLI Commands](../docs/cli.md) | Status, overview, coverage, history, trends, cache, and doctor commands |
| [Failure History](../docs/history.md) | Test classification and failure tracking |

## Requirements

- Vitest >= 4.1.0
- Node.js >= 22

## License

[MIT](./LICENSE)
