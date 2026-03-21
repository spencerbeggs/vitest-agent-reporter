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
        coverageThreshold: 80,
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
| `coverageThreshold` | `number` | `0` | Flag files below this coverage percentage |
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
        coverageThreshold: 80,
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
| `coverageThreshold` | `number` | `0` | Flag files below this coverage percentage |
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

## Coverage Threshold Behavior

The `coverageThreshold` option controls which files appear in the coverage
gaps section of console output and JSON reports.

When using `AgentPlugin`, the threshold is resolved in this order:

1. **Explicit option** -- `reporter.coverageThreshold` in plugin options
2. **Vitest config** -- minimum of `coverage.thresholds.lines`,
   `.statements`, `.branches`, `.functions` from your Vitest config
3. **Default** -- `0` (no files flagged)

Setting `coverageThreshold: 80` means any file with any coverage metric
below 80% will appear in the low-coverage list, sorted worst-first by
line coverage.

**Bare-zero files** (all four metrics at 0%) are excluded by default. These
are typically generated files, re-exports, or index files with no executable
code. Set `includeBareZero: true` to include them.

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
