# vitest-agent-reporter-mcp

The Model Context Protocol server (`vitest-agent-reporter-mcp` bin)
exposing 24 tools to LLM agents over stdio via `@modelcontextprotocol/sdk`.
Routes tool calls through a tRPC router; runs as a long-lived process with
a `ManagedRuntime`. Required as a peerDependency by the reporter package.

## Layout

```text
src/
  bin.ts              -- bin entry: resolves projectDir, dbPath, builds
                         ManagedRuntime.make(McpLive(dbPath, ...)),
                         calls startMcpServer({ runtime, cwd: projectDir })
  index.ts            -- programmatic entry
  context.ts          -- tRPC McpContext: { runtime, cwd }
  router.ts           -- tRPC router aggregating all 24 procedures
  server.ts           -- startMcpServer() registers tools with MCP SDK
                         (StdioServerTransport)
  tools/              -- 24 tool implementations (one file per tool)
    help.ts status.ts overview.ts coverage.ts history.ts trends.ts
    errors.ts test-for-file.ts test-get.ts test-list.ts file-coverage.ts
    run-tests.ts cache-health.ts configure.ts notes.ts
    project-list.ts module-list.ts suite-list.ts settings-list.ts
  layers/
    McpLive.ts        -- (dbPath, logLevel?, logFile?) composition:
                         DataReader + DataStore + ProjectDiscovery +
                         OutputPipeline + SqliteClient + Migrator +
                         NodeContext + NodeFileSystem + Logger
```

## Key files

| File | Purpose |
| ---- | ------- |
| `bin.ts` | `resolveProjectDir()` precedence: `VITEST_AGENT_REPORTER_PROJECT_DIR` -> `CLAUDE_PROJECT_DIR` -> `process.cwd()`. Resolves `dbPath` via `resolveDataPath(projectDir)` then constructs the `ManagedRuntime` |
| `context.ts` | tRPC `McpContext` carrying the `ManagedRuntime` so procedures call `ctx.runtime.runPromise(effect)` |
| `router.ts` | Aggregates all 24 tool procedures; testable via `createCallerFactory(appRouter)` without starting the MCP server |
| `tools/run-tests.ts` | `spawnSync("vitest run", ...)` with configurable timeout (default 120s) -- the only mutation tool besides note CRUD |
| `tools/notes.ts` | All 6 note CRUD tools (`note_create`/`list`/`get`/`update`/`delete`/`search`); the only DataStore writes from the MCP server |

## Conventions

- **`ManagedRuntime`, not per-call `Effect.runPromise`.** The MCP
  server is long-lived; per-call layer construction would re-open
  SQLite on every tool invocation. tRPC procedures call
  `ctx.runtime.runPromise(effect)` against the shared runtime.
- **Three external runtime deps unique here:**
  `@modelcontextprotocol/sdk`, `@trpc/server`, `zod`. zod is for
  tRPC tool input schemas only -- domain data structures still use
  Effect Schema (from `-shared`). Don't conflate the two.
- **Tool output conventions:**
  - Meta + read-only + discovery tools: return markdown via
    `OutputRenderer`.
  - `run_tests`: returns text (raw vitest output).
  - Notes: list/search return markdown; create/get/update/delete
    return JSON.
- **24 tools, 1 router.** New tools register in `server.ts` AND
  `router.ts`. The Claude Code plugin's allowlist
  (`plugin/hooks/lib/safe-mcp-vitest-agent-reporter-ops.txt`) must
  also be updated for auto-allow to work without a permission prompt.
- **`run_tests` uses `spawnSync` deliberately.** The MCP server
  cannot process other tool requests during a test run; this is
  acceptable because agents wait for results before proceeding.
  See Decision 21.

## When working in this package

- `projectDir` resolution: the plugin loader sets
  `VITEST_AGENT_REPORTER_PROJECT_DIR` because Claude Code does not
  reliably propagate `CLAUDE_PROJECT_DIR` to MCP subprocesses. Don't
  drop the env var fallback.
- Adding a tool: define a tRPC procedure in `tools/<name>.ts`, add
  to `router.ts`, register the SDK handler in `server.ts`, update
  `tools/help.ts`'s tool list, and add the suffix to the plugin's
  `safe-mcp-vitest-agent-reporter-ops.txt` allowlist.
- Testing tools: use `createCallerFactory(appRouter)` with a mock
  context. See `router.test.ts` and `tools/run-tests.test.ts` for
  the pattern -- don't start the MCP server in tests.
- Tool input validation uses zod (tRPC requirement). Keep zod
  schemas minimal -- they're just for argument shape, not domain
  validation. Domain validation happens in the underlying
  `DataReader`/`DataStore` calls.
- `DataReader` discovery tools (`project_list`, `module_list`,
  `suite_list`, `test_list`) enumerate every project from
  `getRunsByProject()` when `project` is unspecified. Don't default
  to a literal `"default"` (post-2.0 bug fix).
- The MCP server's runtime is constructed once at startup. If
  `dbPath` resolution fails at boot, the server should not start --
  surface the error via stderr and exit non-zero so the loader can
  print install instructions.

## Design references

@../../.claude/design/vitest-agent-reporter/components.md
@../../.claude/design/vitest-agent-reporter/decisions.md
@../../.claude/design/vitest-agent-reporter/data-structures.md
