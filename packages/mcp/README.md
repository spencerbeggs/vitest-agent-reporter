# vitest-agent-reporter-mcp

MCP server bin for
[vitest-agent-reporter](https://github.com/spencerbeggs/vitest-agent-reporter).
Exposes 24 tools over stdio (via tRPC) that give LLM agents structured
access to test data, coverage, history, trends, errors, per-file
coverage, individual test details, run-tests, cache health, settings,
and a notes CRUD/search system.

This package is a required peer dependency of `vitest-agent-reporter`,
so you usually don't install it directly — modern pnpm and npm pull it
in automatically when you install the reporter. The Claude Code plugin
shipped with `vitest-agent-reporter` registers this server
automatically.

## Install

```bash
npm install --save-dev vitest-agent-reporter
# vitest-agent-reporter-mcp auto-installed via peerDependency
```

If your package manager skips peers, install it explicitly:

```bash
pnpm add -D vitest-agent-reporter-mcp
```

## Usage

The MCP server runs over stdio and is typically started by an MCP
client (e.g. Claude Code via the bundled plugin). To start it
manually:

```bash
npx vitest-agent-reporter-mcp
```

The server reads the SQLite database written by `AgentReporter` from
the same XDG-derived path the reporter uses, so a single test run
populates data for both the CLI and MCP tools.

## Tool overview

`help` returns the full tool catalog with parameter signatures. The
24 tools cover read-only queries (`test_status`, `test_overview`,
`test_coverage`, `test_history`, `test_trends`, `test_errors`,
`test_for_file`, `test_get`, `file_coverage`, `cache_health`,
`configure`), discovery (`project_list`, `test_list`, `module_list`,
`suite_list`, `settings_list`), execution (`run_tests`), and notes
(`note_create`, `note_list`, `note_get`, `note_update`, `note_delete`,
`note_search`).

## Documentation

See the
[main README](https://github.com/spencerbeggs/vitest-agent-reporter#readme)
and the
[MCP reference](https://github.com/spencerbeggs/vitest-agent-reporter/blob/main/docs/mcp.md).

## License

[MIT](./LICENSE)
