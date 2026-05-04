---
"vitest-agent-plugin": major
"vitest-agent-reporter": major
"vitest-agent-sdk": major
"vitest-agent-cli": major
"vitest-agent-mcp": major
---

## Breaking Changes

### Package and directory renames

- `vitest-agent` (Vitest plugin) renamed to `vitest-agent-plugin`; update your `package.json` dependency and `vitest.config.ts` import accordingly
- `packages/agent/` moved to `packages/plugin/`; `packages/shared/` moved to `packages/sdk/`

### App namespace

- Config file renamed from `vitest-agent-reporter.config.toml` to `vitest-agent.config.toml`
- XDG data directory changed from `~/.local/share/vitest-agent-reporter/` to `~/.local/share/vitest-agent/`; existing databases are not migrated automatically
- `VitestAgentReporterConfig` renamed to `VitestAgentConfig`; `VitestAgentReporterConfigFile` renamed to `VitestAgentConfigFile`
- Effect `Context.Tag` keys updated from `"vitest-agent-reporter/*"` to `"vitest-agent/*"`

### CLI bin

- Binary renamed from `vitest-agent-reporter` to `vitest-agent`; update any scripts or CI steps that invoke it

### Claude Code plugin

- Plugin name changed from `"vitest-agent-reporter"` to `"vitest-agent"`; reinstall the plugin to pick up the new manifest
- MCP server key changed from `"vitest-reporter"` to `"mcp"`

### AgentPlugin options

- The `reporter` field in `AgentPlugin({})` is now typed as a factory function only; pass coverage thresholds and other config bag options under `reporterOptions` instead

## Features

### Playground sandbox

- Added `playground/` workspace with intentionally imperfect source (`math`, `strings`, `cache`, `Notebook`) as a live dogfooding target for the TDD orchestrator and MCP tools
