# vitest-agent-reporter-shared

Shared library for the
[vitest-agent-reporter](https://github.com/spencerbeggs/vitest-agent-reporter)
package family. Carries everything `vitest-agent-reporter`,
`vitest-agent-reporter-cli`, and `vitest-agent-reporter-mcp` need:

- Effect schemas, error types, SQLite migrations
- `DataStore` and `DataReader` services with their live + test layers
- Output pipeline (`OutputRenderer`, `FormatSelector`, `DetailResolver`,
  `ExecutorResolver`, `EnvironmentDetector`)
- Formatters (markdown, gfm, json, silent)
- `HistoryTracker`, `ProjectDiscovery`, classification utilities
- XDG-based path resolution (`resolveDataPath`, `PathResolutionLive`,
  `ConfigLive`)
- `LoggerLive`, `ensureMigrated`, and shared utilities
- `TurnPayload` Effect Schema union for Claude Code session/turn logging
- `computeFailureSignature` and `findFunctionBoundary` for stable failure
  identity hashing across line drift
- `validatePhaseTransition` pure validator for TDD phase-transition
  evidence binding

You almost certainly don't install this directly — install
`vitest-agent-reporter` and the runtime packages get pulled in via
peer dependencies.

## Install

```bash
npm install vitest-agent-reporter-shared
```

## Documentation

See the [main README](https://github.com/spencerbeggs/vitest-agent-reporter#readme)
for usage and the architecture overview.

## License

[MIT](./LICENSE)
