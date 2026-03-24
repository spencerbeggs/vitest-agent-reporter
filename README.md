# vitest-agent-reporter

Monorepo for developing vitest-agent-reporter -- a Vitest reporter and
agent platform for LLM coding agents. Produces structured test output,
persists data in SQLite, and exposes test intelligence via CLI, MCP
server, and Claude Code plugin.

## Workspaces

| Workspace | Path | Description |
| --- | --- | --- |
| `vitest-agent-reporter` | `package/` | Vitest reporter, CLI, MCP server, Effect services, schemas |
| `example-basic` | `examples/basic/` | Minimal test project for CLI testing |

## Plugin

| Component | Path | Description |
| --- | --- | --- |
| Claude Code plugin | `plugin/` | Hooks, skills, commands, MCP auto-registration |

The plugin is not a pnpm workspace -- it's a directory of markdown,
JSON, and bash files consumed by the Claude Code plugin system. See
[plugin/README.md](plugin/README.md).

## Architecture

The package has three entry points:

| Entry | Binary | Purpose |
| --- | --- | --- |
| Reporter/Plugin | (library import) | Vitest reporter producing SQLite-persisted test data |
| CLI | `vitest-agent-reporter` | Query test status, coverage, history, trends from the terminal |
| MCP Server | `vitest-agent-reporter-mcp` | 16 tools over stdio for LLM agent integration |

All three share the same Effect service architecture (`DataReader`,
`DataStore`, `OutputRenderer`) and SQLite database.

## Development

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
pnpm run typecheck
```

## Testing the CLI Locally

Run tests to generate cache:

```bash
pnpm run test
```

Query cached data:

```bash
pnpm vitest-agent-reporter status
pnpm vitest-agent-reporter history
pnpm vitest-agent-reporter trends
pnpm vitest-agent-reporter doctor
```

## Testing the Plugin Locally

```bash
claude --plugin-dir ./plugin
```

## Package Documentation

See [package/README.md](package/README.md) for full package
documentation including installation, configuration, MCP tools, and
Claude Code plugin setup.

## License

MIT
