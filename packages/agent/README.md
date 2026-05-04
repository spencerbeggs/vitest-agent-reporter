# vitest-agent

Vitest plugin for the `vitest-agent` ecosystem. Owns persistence, history
classification, baselines, trend tracking, failure-signature computation,
and Vitest reporter-chain wiring. Dispatches the rendering stage to a
configurable reporter.

> **Status: scaffold.** This package is being migrated from the existing
> `vitest-agent-reporter` package (which historically contained both the
> plugin and the default reporter). See the design docs under
> `.claude/design/vitest-agent/` for the migration plan.

## Install

```bash
pnpm add -D vitest-agent vitest-agent-reporter
```

`vitest-agent-reporter` ships the default rendering implementation and is
declared as a required peer dependency. Substitute a custom reporter by
passing `agentPlugin({ reporter: () => myReporter })` once the plugin is
fully migrated.

## License

MIT
