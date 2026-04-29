# vitest-agent-reporter-cli

CLI bin for
[vitest-agent-reporter](https://github.com/spencerbeggs/vitest-agent-reporter).
Reads the SQLite database written by `AgentReporter` and reports test
status, overview, coverage, history, trends, and cache health on
demand.

This package is a required peer dependency of `vitest-agent-reporter`,
so you usually don't install it directly — modern pnpm and npm pull it
in automatically when you install the reporter.

## Install

```bash
npm install --save-dev vitest-agent-reporter
# vitest-agent-reporter-cli auto-installed via peerDependency
```

If your package manager skips peers, install it explicitly:

```bash
pnpm add -D vitest-agent-reporter-cli
```

## Usage

All commands accept `--format markdown` (default) or `--format json`.

```bash
npx vitest-agent-reporter status      # Per-project pass/fail state
npx vitest-agent-reporter overview    # Test landscape summary
npx vitest-agent-reporter coverage    # Coverage gap analysis
npx vitest-agent-reporter history     # Flaky/persistent failure trends
npx vitest-agent-reporter trends      # Coverage trajectory over time
npx vitest-agent-reporter doctor      # Database health diagnostic
npx vitest-agent-reporter cache path  # Print the database file path
npx vitest-agent-reporter cache clean # Delete the database
```

## Documentation

See the
[main README](https://github.com/spencerbeggs/vitest-agent-reporter#readme)
and the
[CLI reference](https://github.com/spencerbeggs/vitest-agent-reporter/blob/main/docs/cli.md).

## License

[MIT](./LICENSE)
