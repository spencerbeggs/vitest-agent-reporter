# vitest-agent-reporter

Monorepo for developing vitest-agent-reporter -- a Vitest reporter for LLM coding agents.

## Workspaces

| Workspace | Path | Description |
| --- | --- | --- |
| `vitest-agent-reporter` | `package/` | Publishable Vitest reporter and CLI |
| `example-basic` | `examples/basic/` | Minimal test project for CLI testing |

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

## Package Documentation

See [package/README.md](package/README.md) for full package documentation.

## License

MIT
