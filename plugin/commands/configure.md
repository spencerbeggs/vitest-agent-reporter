---
description: View or modify vitest-agent-reporter settings
disable-model-invocation: true
argument-hint: "[setting] [value]"
---

# Configure vitest-agent-reporter

View or modify the reporter configuration.

## Without arguments

Show the current configuration by:

1. Reading the vitest config file (vitest.config.ts or similar)
2. Looking for `AgentPlugin` options
3. Displaying current settings in a table

## With arguments

Modify a specific setting. Supported settings:

- `format <markdown|json|vitest-bypass|silent>` -- output format
- `mode <auto|agent|silent>` -- executor detection mode
- `threshold <metric> <value>` -- set coverage threshold
  (e.g., `threshold lines 80`)
- `target <metric> <value>` -- set coverage target
- `autoUpdate <true|false>` -- toggle baseline auto-ratcheting

To modify settings, edit the `AgentPlugin()` call in the vitest
config file. Use the Read tool to check current values, then
Edit to update them.

$ARGUMENTS
