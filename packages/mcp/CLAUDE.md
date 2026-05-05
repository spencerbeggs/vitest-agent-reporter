# vitest-agent-mcp

The Model Context Protocol server (`vitest-agent-mcp` bin)
exposing 50 tools to LLM agents over stdio via `@modelcontextprotocol/sdk`.
Routes tool calls through a tRPC router; runs as a long-lived process with
a `ManagedRuntime`. Required as a peerDependency by the plugin package.

## Layout

```text
src/
  bin.ts              -- bin entry: resolves projectDir, dbPath, builds
                         ManagedRuntime.make(McpLive(dbPath, ...)),
                         calls startMcpServer({ runtime, cwd: projectDir })
  index.ts            -- programmatic entry
  context.ts          -- tRPC McpContext: { runtime, cwd }
  router.ts           -- tRPC router aggregating all 50 procedures
  server.ts           -- startMcpServer() registers tools with MCP SDK
                         (StdioServerTransport)
  tools/              -- 50 tool implementations (one file per tool):
                         meta + read-only queries (help, status,
                         overview, coverage, history, trends, errors,
                         test-for-file, test-get, file-coverage,
                         cache-health, configure); discovery
                         (project-list, test-list, module-list,
                         suite-list, settings-list); mutation
                         (run-tests); note CRUD (notes.ts);
                         sessions/turns/TDD reads (session-list,
                         session-get, turn-search,
                         failure-signature-get, tdd-session-get,
                         hypothesis-list, acceptance-metrics);
                         triage/wrapup (triage-brief, wrapup-prompt);
                         hypothesis writes (hypothesis-record,
                         hypothesis-validate); TDD session lifecycle
                         (tdd-session-start, tdd-session-end,
                         tdd-session-resume,
                         tdd-phase-transition-request);
                         TDD goal CRUD (2.0: tdd-goal-create / -get /
                         -update / -delete / -list); TDD behavior CRUD
                         (2.0: tdd-behavior-create / -get / -update /
                         -delete / -list); workspace history
                         (commit-changes); plus the private
                         _tdd-error-envelope.ts helper.
                         The 1.x decompose-goal-into-behaviors tool
                         was removed in 2.0.
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
| `router.ts` | Aggregates all 50 tool procedures; testable via `createCallerFactory(appRouter)` without starting the MCP server |
| `tools/run-tests.ts` | `spawnSync("vitest run", ...)` with configurable timeout (default 120s) |
| `tools/notes.ts` | All 6 note CRUD tools (`note_create`/`list`/`get`/`update`/`delete`/`search`) |
| `tools/tdd-session-get.ts` | Returns a markdown digest of a TDD session: phases, artifacts, and (when present) a `## Goals and Behaviors` section rendering each goal with its nested behavior statuses |
| `tools/tdd-{goal,behavior}-*.ts` | 10 new CRUD tools (2.0) for the Objective→Goal→Behavior hierarchy. `tdd_goal_create` is idempotent on `(sessionId, goal)`; `tdd_behavior_create` is idempotent on `(goalId, behavior)`. The two `*_delete` tools are denied to the orchestrator at the plugin's `pre-tool-use-tdd-restricted.sh` hook and intentionally omitted from `safe-mcp-vitest-agent-ops.txt` so main-agent calls fall through to the standard permission prompt |
| `tools/_tdd-error-envelope.ts` | Private 2.0 helper that catches the five tagged TDD errors (`GoalNotFoundError`, `BehaviorNotFoundError`, `TddSessionNotFoundError`, `TddSessionAlreadyEndedError`, `IllegalStatusTransitionError`) and surfaces them as success-shape `{ ok: false, error: { _tag, ..., remediation } }` responses |
| `tools/tdd-phase-transition-request.ts` | 2.0: `goalId` is now required; the tool pre-checks goal status and behavior membership before running the D2 binding-rule validator. On accept with a `behaviorId`, auto-promotes the behavior `pending → in_progress` in the same SQL transaction as `writeTddPhase`. The validator also rejects `spike→green` and `refactor→green` with `wrong_source_phase` — the red phase must be entered explicitly first |

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
- **50 tools, 1 router.** New tools register in `server.ts` AND
  `router.ts`. The Claude Code plugin's allowlist
  (`plugin/hooks/lib/safe-mcp-vitest-agent-ops.txt`) must
  also be updated for auto-allow to work without a permission prompt.
  Destructive tools (`tdd_goal_delete`, `tdd_behavior_delete`) are
  intentionally omitted from the allowlist so they prompt for user
  confirmation; the orchestrator subagent is also blocked from
  calling them at the runtime hook layer
  (`pre-tool-use-tdd-restricted.sh`).
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
  `safe-mcp-vitest-agent-ops.txt` allowlist (omit destructive tools
  intentionally so they prompt; consider whether the new tool also
  needs a denial in `pre-tool-use-tdd-restricted.sh` if it should
  not be callable by the TDD orchestrator). For tools surfacing the
  five TDD tagged errors, use the `_tdd-error-envelope.ts` helper
  to wrap the catch.
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

@../../.claude/design/vitest-agent/components.md
@../../.claude/design/vitest-agent/decisions.md
@../../.claude/design/vitest-agent/data-structures.md
