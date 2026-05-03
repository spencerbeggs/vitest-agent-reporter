# vitest-agent-reporter

Monorepo for developing the `vitest-agent-reporter` package family — a
Vitest reporter and agent platform for LLM coding agents. Produces
structured test output, persists data in SQLite at an XDG-derived path,
and exposes test intelligence via CLI, MCP server, and Claude Code
plugin.

## Workspaces

| Workspace | Path | Description |
| --- | --- | --- |
| `vitest-agent-reporter` | `packages/reporter/` | Vitest reporter + plugin |
| `vitest-agent-reporter-shared` | `packages/shared/` | Shared schemas, data layer, services, formatters, utilities |
| `vitest-agent-reporter-cli` | `packages/cli/` | `vitest-agent-reporter` CLI bin |
| `vitest-agent-reporter-mcp` | `packages/mcp/` | `vitest-agent-reporter-mcp` MCP server bin |
| `example-basic` | `examples/basic/` | Minimal test project for CLI testing |

`vitest-agent-reporter-shared` has no internal dependencies. The other
three runtime packages each depend on it. The reporter package declares
the CLI and MCP packages as required peer dependencies, so a single
`npm install vitest-agent-reporter` pulls all three on modern pnpm and
npm.

## Plugin

| Component | Path | Description |
| --- | --- | --- |
| Claude Code plugin | `plugin/` | Hooks, skills, commands, MCP auto-registration |

The plugin is not a pnpm workspace — it's a directory of markdown, JSON,
shell, and a zero-deps Node loader (`bin/mcp-server.mjs`) consumed by
the Claude Code plugin system. See [plugin/README.md](plugin/README.md).

## Architecture

The package family has three entry points:

| Entry | Bin | Package | Purpose |
| --- | --- | --- | --- |
| Reporter/Plugin | (library import) | `vitest-agent-reporter` | Vitest reporter producing SQLite-persisted test data |
| CLI | `vitest-agent-reporter` | `vitest-agent-reporter-cli` | Query test status, coverage, history, trends from the terminal |
| MCP Server | `vitest-agent-reporter-mcp` | `vitest-agent-reporter-mcp` | 41 tools over stdio for LLM agent integration |

All three share the Effect service architecture and the same SQLite
database in `vitest-agent-reporter-shared` (`DataReader`, `DataStore`,
`OutputRenderer`, output pipeline, formatters, etc.). The database
location is derived from your root workspace's `package.json` `name`
under `$XDG_DATA_HOME/vitest-agent-reporter/`.

## Development

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
pnpm run typecheck
```

## Testing the CLI locally

Run tests to populate the database:

```bash
pnpm run test
```

Query cached data via the CLI bin (resolved from
`packages/cli/node_modules/.bin`):

```bash
pnpm exec vitest-agent-reporter status
pnpm exec vitest-agent-reporter history
pnpm exec vitest-agent-reporter trends
pnpm exec vitest-agent-reporter doctor
```

## Testing the plugin locally

```bash
claude --plugin-dir ./plugin
```

## Package documentation

See [packages/reporter/README.md](packages/reporter/README.md) for the
main user-facing documentation, including installation, configuration,
MCP tools, and Claude Code plugin setup.

## License

MIT
