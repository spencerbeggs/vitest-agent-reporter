---
name: configuration
description: Guide vitest-agent-plugin configuration including thresholds, targets, output format, and plugin options. Use when setting up or modifying the plugin configuration.
disable-model-invocation: true
---

# Vitest Agent Plugin Configuration

## Plugin Options (vitest.config.ts)

The plugin is configured via `AgentPlugin` in your Vitest config:

```typescript
import { AgentPlugin } from "vitest-agent-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    AgentPlugin({
      // Output format: "markdown" | "json" | "vitest-bypass" | "silent"
      format: "markdown",

      // Mode: "auto" | "agent" | "silent"
      mode: "auto",

      reporter: {
        // Coverage thresholds (Vitest-native format)
        coverageThresholds: {
          lines: 80,
          branches: 80,
          functions: 80,
          statements: 80,
        },

        // Aspirational goals (informational, not enforced)
        coverageTargets: {
          lines: 95,
          branches: 90,
        },

        // Auto-ratchet baselines toward targets
        autoUpdate: true,

        // Max low-coverage files shown in console
        coverageConsoleLimit: 10,
      },
    }),
  ],
});
```

## Key Options

| Option | Default | Description |
| ------ | ------- | ----------- |
| `format` | `"markdown"` | Output format for console |
| `mode` | `"auto"` | Executor detection mode |
| `coverageThresholds` | `{}` | Enforced minimums (fail build) |
| `coverageTargets` | none | Aspirational goals (informational) |
| `autoUpdate` | `true` | Auto-ratchet baselines |

## Checking Current Configuration

Use the `configure` MCP tool to view current settings from the
database. Settings are captured on each test run.

## Common Configurations

### Strict CI mode

```typescript
AgentPlugin({
  format: "markdown",
  mode: "agent",
  reporter: {
    coverageThresholds: { lines: 90, branches: 85 },
  },
})
```

### Development mode (quiet)

```typescript
AgentPlugin({
  format: "vitest-bypass",
  mode: "auto",
})
```
