# vitest-agent-reporter

[![npm version](https://img.shields.io/npm/v/vitest-agent-reporter)](https://www.npmjs.com/package/vitest-agent-reporter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Vitest reporter that gives LLM coding agents superpowers -- persistent
test intelligence, coverage analysis, failure history, and notes via MCP
tools.

## Features

- **SQLite persistence** -- normalized database replaces JSON files for
  richer queries and cross-run analysis
- **MCP server** -- 16 tools over stdio for deep integration with LLM
  agents (test data, notes, coverage, run tests)
- **Claude Code plugin** -- auto-registers MCP tools, injects test
  context at session start, and provides teaching skills
- **Zero-config agent detection** -- uses
  [std-env](https://github.com/nicolo-ribaudo/std-env) to detect Claude
  Code, Cursor, Gemini CLI, Codex, Devin, and other agents automatically
- **Coverage thresholds and targets** -- Vitest-native threshold format
  plus aspirational targets with auto-ratcheting baselines
- **Coverage trends** -- tracks coverage direction across runs with
  tiered console output (green/yellow/red)
- **Failure history** -- per-test pass/fail tracking with classification:
  `stable`, `new-failure`, `persistent`, `flaky`, `recovered`
- **Notes system** -- CRUD + full-text search for persisting debugging
  notes across sessions
- **GitHub Actions GFM** -- writes structured summaries to
  `GITHUB_STEP_SUMMARY` automatically in CI
- **CLI bin** -- query test status, coverage gaps, failure history, and
  trends from the command line

## Quick Start

Install the package:

```bash
npm install vitest-agent-reporter
```

Add `AgentPlugin` to your Vitest config with coverage thresholds and
aspirational targets:

```typescript
import { AgentPlugin } from "vitest-agent-reporter";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    AgentPlugin({
      reporter: {
        coverageThresholds: { lines: 80, branches: 80 },
        coverageTargets: { lines: 95, branches: 90 },
      },
    }),
  ],
  test: {
    coverage: {
      provider: "v8",
    },
  },
});
```

Install the Claude Code plugin for the full agent experience:

```bash
# Add the plugin marketplace (one-time setup)
/plugin marketplace add spencerbeggs/bot

# Install the plugin for this project
/plugin install vitest-agent-reporter@spencerbeggs-bot --scope project
```

That's it. The plugin detects whether an agent, CI, or human is running
tests and adjusts output automatically. Agents get 16 MCP tools for
querying test data, tracking coverage, and persisting notes -- with no
manual MCP configuration.

## What Agents See

When tests fail, the reporter produces actionable markdown output with
classification labels, coverage gaps, and next steps:

````markdown
## x Vitest -- 2 failed, 10 passed (520ms)

Coverage regressing over 3 runs

### x `src/utils.test.ts`

- x **compressLines > compresses consecutive lines** [new-failure]
  Expected "1-3,5" but received "1,2,3,5"

  ```diff
  - Expected
  + Received

  - "1-3,5"
  + "1,2,3,5"
  ```

- x **compressLines > handles duplicates** [persistent]
  Expected [1,2] to equal [1]

### Coverage gaps

- `src/coverage.ts` -- Lines: 42% (threshold: 80%) -- uncovered: 65-80,95-110
- `src/utils.ts` -- Lines: 72% (target: 95%) -- uncovered: 42-50,99

### Next steps

- 1 new failure since last run
- 1 persistent failure across 3 runs
- Re-run: `pnpm vitest run src/utils.test.ts`
- Run `pnpm vitest-agent-reporter coverage` for gap analysis
- Run `pnpm vitest-agent-reporter trends` for coverage trajectory
````

When all tests pass and targets are met, output collapses to a single
summary line.

## How It Works

The plugin detects three environments and adapts behavior:

| Environment | Detection | Console | Database | GFM Summary |
| --- | --- | --- | --- | --- |
| Agent | `std-env` agent detection | Structured markdown | Yes | Auto |
| CI | `GITHUB_ACTIONS`, `CI=true` | Silent (existing reporters kept) | Yes | Yes |
| Human | No agent/CI vars detected | Silent (existing reporters kept) | Yes | No |

After each test run, `AgentReporter` writes structured data to a SQLite
database (default: `node_modules/.vite/vitest-agent-reporter/data.db`
when using `AgentPlugin`). The MCP server and CLI both query this database
on demand -- no background process required.

## Claude Code Plugin

A companion [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
plugin provides the full agent-native experience:

```bash
# Add the plugin marketplace (one-time setup)
/plugin marketplace add spencerbeggs/bot

# Install the plugin for this project
/plugin install vitest-agent-reporter@spencerbeggs-bot --scope project
```

The plugin provides:

- **MCP auto-registration** -- all 16 tools available immediately with
  no manual `.mcp.json` configuration
- **SessionStart hook** -- injects project status and available tools
  into Claude's context at the start of each session
- **PostToolUse hook** -- detects test runs and suggests MCP tools for
  deeper analysis when tests fail
- **Skills** -- `/vitest-agent-reporter:tdd`,
  `/vitest-agent-reporter:debugging`,
  `/vitest-agent-reporter:configuration`
- **Commands** -- `/vitest-agent-reporter:setup` (add plugin to vitest
  config), `/vitest-agent-reporter:configure` (view/modify settings)

## MCP Tools

The package includes an MCP server (`vitest-agent-reporter-mcp`) that
exposes test data as tools over stdio transport. The Claude Code plugin
registers this automatically, but you can also start it manually:

```bash
npx vitest-agent-reporter-mcp
```

<details>
<summary>Full tool reference (16 tools)</summary>

| Tool | Description |
| --- | --- |
| `test_status` | Per-project pass/fail state from the most recent run |
| `test_overview` | Test landscape summary with per-project run metrics |
| `test_coverage` | Coverage gap analysis with per-metric thresholds and targets |
| `test_history` | Flaky/persistent/recovered tests with run visualization |
| `test_trends` | Per-project coverage trajectory with direction and sparkline |
| `test_errors` | Detailed test errors with diffs and stack traces |
| `test_for_file` | Find test modules that cover a given source file |
| `run_tests` | Execute vitest for specific files or patterns |
| `cache_health` | Database health diagnostic |
| `configure` | View captured Vitest settings for a test run |
| `note_create` | Create a scoped note (global, project, module, suite, test, or free-form) |
| `note_list` | List notes with optional scope, project, and test filters |
| `note_get` | Read a note by ID |
| `note_update` | Update note content, pin state, or expiration |
| `note_delete` | Delete a note |
| `note_search` | Full-text search across note titles and content |

</details>

See [docs/mcp.md](../docs/mcp.md) for the full MCP reference.

## CLI

The `vitest-agent-reporter` CLI queries the SQLite database for on-demand
test landscape queries. All commands accept `--format` to switch between
`markdown` (default) and `json` output.

```bash
npx vitest-agent-reporter status      # Per-project pass/fail state
npx vitest-agent-reporter coverage    # Coverage gap analysis
npx vitest-agent-reporter history     # Flaky/persistent failure trends
npx vitest-agent-reporter trends      # Coverage trajectory over time
npx vitest-agent-reporter doctor      # Database health diagnostic
npx vitest-agent-reporter cache path  # Print the database file path
npx vitest-agent-reporter cache clean # Delete the database
```

See [docs/cli.md](../docs/cli.md) for the full CLI reference.

## Documentation

| Guide | Description |
| --- | --- |
| [Configuration](../docs/configuration.md) | Plugin and reporter options, thresholds, targets, cache resolution |
| [Direct Reporter Usage](../docs/reporter.md) | Using `AgentReporter` without the plugin |
| [Schemas](../docs/schemas.md) | Effect Schema definitions, programmatic access |
| [CLI Commands](../docs/cli.md) | Status, overview, coverage, history, trends, cache, and doctor commands |
| [MCP Server](../docs/mcp.md) | MCP tools reference, notes system, manual server usage |
| [Failure History](../docs/history.md) | Test classification and failure tracking |
| [Claude Code Plugin](../plugin/README.md) | Plugin installation, hooks, skills, and commands |

## Requirements

- Vitest >= 4.1.0
- Node.js >= 22

## License

[MIT](./LICENSE)
