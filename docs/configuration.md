# Configuration

## AgentPlugin Options

`AgentPlugin` is the recommended entry point. It wraps `AgentReporter` and
handles environment detection, reporter injection, and cache directory
resolution automatically.

```typescript
import { AgentPlugin } from "vitest-agent-reporter";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    AgentPlugin({
      mode: "auto",
      reporter: {
        coverageThresholds: { lines: 80, branches: 80 },
        coverageConsoleLimit: 5,
      },
    }),
  ],
});
```

### `mode`

| Value | Behavior |
| --- | --- |
| `"auto"` (default) | Detect environment from env vars -- agent, CI, or human |
| `"agent"` | Force agent mode: suppress built-in reporters, show markdown |
| `"silent"` | Force silent mode: cache/JSON only, no console output |

When `mode` is `"auto"`, the plugin checks environment variables to determine
the runtime context. See [Agent Detection](#agent-detection) for the full
list.

### `consoleStrategy`

| Value | Behavior |
| --- | --- |
| `"complement"` (default) | Layer on Vitest's built-in `agent` reporter. Adds JSON cache and manifest only. Does not strip any reporters from the chain. |
| `"own"` | Take over console output entirely. Strips built-in console reporters (including `agent`), uses this reporter's markdown formatter, and writes its own GFM. |

### `reporter`

Nested reporter options passed through to `AgentReporter`. The plugin manages
`consoleOutput` and `githubActions` automatically based on environment
detection, so those fields are not available through the plugin interface.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `cacheDir` | `string` | Vite's cacheDir | Override the cache directory path |
| `coverageThresholds` | `object` | `{}` | Vitest-native threshold format (per-metric, per-glob) |
| `coverageTargets` | `object` | -- | Aspirational coverage targets (same format as thresholds) |
| `autoUpdate` | `boolean` | `true` when targets set | Auto-ratchet baselines when coverage improves |
| `coverageConsoleLimit` | `number` | `10` | Max low-coverage files shown in console |
| `omitPassingTests` | `boolean` | `true` | Exclude passing tests from JSON reports |
| `includeBareZero` | `boolean` | `false` | Include files where all four metrics are 0% |
| `githubSummaryFile` | `string` | `GITHUB_STEP_SUMMARY` env var | Override the GFM output file path |

## AgentReporter Options

When using `AgentReporter` directly (without the plugin), all options are
available:

```typescript
import { AgentReporter } from "vitest-agent-reporter";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    reporters: [
      new AgentReporter({
        cacheDir: ".vitest-agent-reporter",
        consoleOutput: "failures",
        omitPassingTests: true,
        coverageThresholds: { lines: 80, branches: 80 },
        coverageConsoleLimit: 10,
        includeBareZero: false,
        githubActions: false,
        githubSummaryFile: undefined,
      }),
    ],
  },
});
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `cacheDir` | `string` | `".vitest-agent-reporter"` | Directory for JSON cache files |
| `consoleOutput` | `"failures"` `"full"` `"silent"` | `"failures"` | Console output verbosity |
| `omitPassingTests` | `boolean` | `true` | Exclude passing tests from JSON reports |
| `coverageThresholds` | `object` | `{}` | Vitest-native threshold format (see below) |
| `coverageTargets` | `object` | -- | Aspirational coverage targets (same format) |
| `autoUpdate` | `boolean` | `true` when targets set | Auto-ratchet baselines when coverage improves |
| `coverageConsoleLimit` | `number` | `10` | Max low-coverage files shown in console |
| `includeBareZero` | `boolean` | `false` | Include files where all four metrics are 0% |
| `githubActions` | `boolean` | auto-detect | Force GFM output on/off |
| `githubSummaryFile` | `string` | `GITHUB_STEP_SUMMARY` env var | Override the GFM output file path |

## Cache Directory Resolution

When using `AgentPlugin`, the cache directory is resolved with this priority:

1. **Explicit option** -- `reporter.cacheDir` in plugin options
2. **Vitest outputFile** -- `outputFile['vitest-agent-reporter']` in Vitest
   config
3. **Vite cacheDir** -- `node_modules/.cache` (Vite default) +
   `/vitest-agent-reporter`

When using `AgentReporter` directly, the `cacheDir` option defaults to
`".vitest-agent-reporter"` relative to the working directory.

The plugin default places cache files alongside Vitest's own cache:

```text
node_modules/.cache/
  vitest/                    # Vitest's own cache
  vitest-agent-reporter/     # reporter cache
    manifest.json
    reports/
      default.json
```

## Coverage Thresholds

The `coverageThresholds` option uses Vitest's native threshold format. Files
with any metric below their applicable threshold appear in the "Coverage gaps"
section of console output and JSON reports.

```typescript
AgentPlugin({
  reporter: {
    // Per-metric thresholds
    coverageThresholds: {
      lines: 80,
      branches: 75,
      functions: 80,
      statements: 80,
    },
  },
});
```

When using `AgentPlugin`, thresholds are resolved in this order:

1. **Explicit option** -- `reporter.coverageThresholds` in plugin options
2. **Vitest config** -- `coverage.thresholds` from your Vitest config
3. **Default** -- `{}` (no files flagged)

Per-glob patterns are also supported:

```typescript
coverageThresholds: {
  lines: 80,
  "src/utils/**": { lines: 90 },
  "src/generated/**": { lines: 0 },
}
```

Negative numbers specify maximum uncovered items (matching Vitest's format),
and `100` enforces full coverage. The `perFile` boolean applies thresholds
per file rather than in aggregate.

**Bare-zero files** (all four metrics at 0%) are excluded by default. These
are typically generated files, re-exports, or index files with no executable
code. Set `includeBareZero: true` to include them.

## Coverage Targets

Targets represent aspirational coverage goals. Unlike thresholds, falling
below a target does not produce a "red" failure -- it produces a "yellow"
hint showing room for improvement.

```typescript
AgentPlugin({
  reporter: {
    coverageThresholds: { lines: 70 },   // hard floor
    coverageTargets: { lines: 90 },      // aspirational goal
  },
});
```

The format is identical to `coverageThresholds` -- per-metric values and
per-glob patterns are supported.

### Auto-Ratcheting Baselines

When `coverageTargets` is set, the reporter automatically tracks a
high-water mark (baseline) for each metric. When coverage improves, the
baseline ratchets up so it never regresses. Baselines are stored in
`{cacheDir}/baselines.json`.

Set `autoUpdate: false` to disable auto-ratcheting:

```typescript
AgentPlugin({
  reporter: {
    coverageTargets: { lines: 90 },
    autoUpdate: false,
  },
});
```

## Coverage Trends

The reporter records a coverage trend entry on each full test run. Trends
are stored per project at `{cacheDir}/trends/{project}.trends.json` with a
50-entry sliding window.

Console output uses a three-tier system based on coverage state:

| Tier | Condition | Console behavior |
| --- | --- | --- |
| Green | All tests pass, all targets met | Single success line with trend direction |
| Yellow | All tests pass, some files below targets | "Room for improvement" section with target gaps |
| Red | Test failures or files below thresholds | Standard failure output with coverage gaps |

Use the CLI `trends` command for detailed trend analysis:

```bash
npx vitest-agent-reporter trends
```

## Console Output Modes

The `consoleOutput` option controls what the reporter prints to stdout.

### `"failures"` (default)

Shows only failed tests with error messages, diffs, and re-run commands.
Coverage gaps are shown if any files are below threshold. When all tests
pass, a single success line is printed.

### `"full"`

Same as `"failures"` but also includes passing test counts and full module
listings.

### `"silent"`

No console output. JSON cache files and manifest are still written. GFM
output is still produced when in GitHub Actions.

This is the mode used automatically when the plugin detects a human
developer or CI environment.

## Environment Detection Override

The `mode` option on `AgentPlugin` overrides automatic detection:

```typescript
// Always act as if an agent is running
AgentPlugin({ mode: "agent" })

// Always suppress console output
AgentPlugin({ mode: "silent" })
```

This is useful for:

- **Testing the reporter** -- force agent mode to see markdown output
- **CI pipelines** -- force silent mode when you only want JSON cache
- **Custom tooling** -- agents not yet in the detection list

## Agent Detection

When `mode` is `"auto"`, the plugin uses
[std-env](https://github.com/nicolo-ribaudo/std-env) for agent detection.
The following environment variables are checked (list maintained by
`std-env` and may expand as new agents are added):

| Variable | Value | Agent |
| --- | --- | --- |
| `AI_AGENT` | any truthy | Cross-tool standard |
| `AUGMENT_AGENT` | `"1"` | Augment Code |
| `CLAUDECODE` | `"1"` | Claude Code |
| `CLINE_ACTIVE` | `"true"` | Cline (VS Code extension) |
| `CODEX_SANDBOX` | any value | OpenAI Codex CLI |
| `CURSOR_TRACE_ID` | any value | Cursor IDE |
| `CURSOR_AGENT` | `"1"` | Cursor CLI agent |
| `GEMINI_CLI` | `"1"` | Gemini CLI / Gemini Code Assist |
| `AGENT` | any truthy | Goose, Amp, generic agents |

If no agent variables match, CI detection runs:

| Variable | Value | Result |
| --- | --- | --- |
| `GITHUB_ACTIONS` | `"true"` or `"1"` | CI mode |
| `CI` | `"true"` | CI mode |

If nothing matches, the environment is classified as `"human"`.
