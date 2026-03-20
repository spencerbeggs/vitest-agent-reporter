# Documentation

## Installation

```bash
npm install vitest-agent-reporter
# or
pnpm add vitest-agent-reporter
# or
yarn add vitest-agent-reporter
```

**Requirements:** Vitest >= 3.2.0 | Node.js >= 18

## Setup

Add `AgentPlugin` to your Vitest config:

```typescript
import { AgentPlugin } from "vitest-agent-reporter";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [AgentPlugin()],
});
```

The plugin auto-detects the environment:

| Environment | Detection | Behavior |
| --- | --- | --- |
| Agent | `CLAUDECODE`, `CURSOR_TRACE_ID`, `AI_AGENT`, etc. | Suppresses console reporters, shows structured markdown |
| CI | `GITHUB_ACTIONS`, `CI=true` | Keeps existing reporters, adds GFM to `GITHUB_STEP_SUMMARY` |
| Human | No agent/CI vars | Keeps existing reporters, runs silently |

JSON cache is always written regardless of environment.

## Guides

| Guide | Description |
| --- | --- |
| [Configuration](configuration.md) | All plugin and reporter options, cache directory resolution, coverage thresholds, environment detection override |
| [Direct Reporter Usage](reporter.md) | Using `AgentReporter` without the plugin, lifecycle hooks, advanced configuration |
| [Schemas & Codecs](schemas.md) | Working with Zod schemas, reading cache files, type inference, programmatic validation |
