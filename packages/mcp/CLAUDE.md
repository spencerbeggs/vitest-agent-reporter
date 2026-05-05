# vitest-agent-mcp

The Model Context Protocol server (`vitest-agent-mcp` bin)
exposing 50 tools to LLM agents over stdio via `@modelcontextprotocol/sdk`.
Routes tool calls through a tRPC router; runs as a long-lived process with
a `ManagedRuntime`. Also surfaces four MCP resources under two URI schemes
(vendored Vitest docs + curated patterns) and six framing-only prompts
registered directly with the MCP SDK alongside the tRPC tool router.
Required as a peerDependency by the plugin package.

## Layout

```text
src/
  bin.ts              -- bin entry: resolves projectDir, dbPath, builds
                         ManagedRuntime.make(McpLive(dbPath, ...)),
                         calls startMcpServer({ runtime, cwd: projectDir })
  index.ts            -- programmatic entry
  context.ts          -- tRPC McpContext: { runtime, cwd }
  router.ts           -- tRPC router aggregating all 50 procedures
  server.ts           -- startMcpServer(): registers all tools, then
                         calls registerAllResources(server) and
                         registerAllPrompts(server) BEFORE constructing
                         StdioServerTransport
  tools/              -- 50 tool implementations (see design docs for the
                         full inventory); plus the private
                         _tdd-error-envelope.ts helper. The 1.x
                         decompose-goal-into-behaviors tool was removed
                         in 2.0
  resources/          -- four MCP resources surfaced under two URI schemes:
    index.ts          -- registerAllResources(server); resolves vendorRoot
                         and patternsRoot from import.meta.url so the
                         same code works in dev (sources at
                         packages/mcp/<vendor|patterns>/) and post-build
                         (mirrored to dist/<env>/<vendor|patterns>/)
    paths.ts          -- resolveResourcePath: rejects null bytes,
                         absolute paths, and any resolved path that
                         escapes <root>. The security boundary -- ALWAYS
                         call this before any readFile in the readers
    upstream-docs.ts  -- vitest://docs/{+path} reader (vendored snapshot)
    patterns.ts       -- vitest-agent://patterns/{slug} reader
    indexes.ts        -- renderUpstreamIndex / renderPatternsIndex for
                         the two static index URIs (vitest://docs/
                         and vitest-agent://patterns/)
  prompts/            -- six framing-only prompts (no server-side tool
                         data fetching; each prompt emits templated user
                         messages that orient the agent toward the right
                         tool composition):
    index.ts          -- registerAllPrompts(server); wires zod arg
                         schemas + factory functions + a toMessages
                         adapter that narrows user-only message shape
                         to SDK-permitted role: "user" | "assistant"
    triage.ts, why-flaky.ts, regression-since-pass.ts,
    explain-failure.ts, tdd-resume.ts, wrapup.ts -- one file per prompt
  middleware/
    idempotency.ts    -- idempotentProcedure drop-in + idempotencyKeys
                         registry (6 entries in 2.0)
  layers/
    McpLive.ts        -- (dbPath, logLevel?, logFile?) composition:
                         DataReader + DataStore + ProjectDiscovery +
                         OutputPipeline + SqliteClient + Migrator +
                         NodeContext + NodeFileSystem + Logger

vendor/
  vitest-docs/        -- vendored upstream Vitest docs snapshot
                         (markdown files mirroring vitest-dev/vitest's
                         docs/ tree, plus manifest.json (tag, commitSha,
                         capturedAt, source) and ATTRIBUTION.md). Pinned
                         at a specific upstream tag; refreshed via
                         scripts/update-vitest-snapshot.mjs

patterns/             -- curated testing patterns library (_meta.json
                         index + per-pattern markdown). Three launch
                         patterns ship in 2.0

scripts/              -- zero-deps Node maintenance scripts:
  update-vitest-snapshot.mjs  -- sparse-clones vitest-dev/vitest at a
                                 tag, rewrites vendor/vitest-docs/.
                                 Uses execFileSync with array args
                                 ONLY -- never execSync with a
                                 shell-interpolated string. Run via
                                 `pnpm run update-vitest-snapshot --tag
                                 <vN.M.K>` (or the
                                 update-vitest-snapshot Claude Code skill)
  copy-vendor-to-dist.mjs     -- postbuild copier chained from
                                 build:dev / build:prod via &&. Mirrors
                                 vendor/ + patterns/ into dist/dev/ and
                                 dist/npm/ so resources/index.ts's
                                 runtime path resolution works post-build
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
- **Resources and prompts use the SDK's native APIs, not tRPC.**
  tRPC owns the tool surface; resources go through
  `server.registerResource` (with `ResourceTemplate` + `{ list:
  undefined }` for the page templates so the SDK doesn't enumerate
  every page on `resources/list` — the index URIs serve that role)
  and prompts go through `server.registerPrompt`. Both surfaces
  share the same `McpServer` instance, the same stdio transport,
  and the same process. Don't try to bridge resources/prompts
  through the tRPC router.
- **Two URI schemes for resources.** `vitest://` is vendored
  upstream content (provenance: vitest-dev/vitest at a pinned tag,
  MIT-licensed via `ATTRIBUTION.md`); `vitest-agent://` is content
  authored for this project. Splitting the schemes is load-bearing
  for licensing/provenance clarity — don't conflate them.
- **Prompts are framing-only.** Each prompt's factory returns
  templated user messages that orient the agent toward the right
  tools. The factories MUST NOT call into `DataReader` /
  `DataStore` to pre-fetch tool data on the server — selection
  cost is zero tool roundtrips by design, and the agent fetches
  data via tools after the prompt orients it.
- **Vendor snapshot is checked in.** The `vendor/vitest-docs/` tree
  ships in git. Don't fetch on demand at runtime — the MCP server
  often runs without network egress. The snapshot is refreshed
  through an explicit human action (the
  `update-vitest-snapshot` script + skill), not silently between
  server starts.
- **`update-vitest-snapshot.mjs` uses `execFileSync` only.** The
  fetcher takes a tag argument and passes it to `git`. Building a
  shell command with `execSync` and string interpolation opens a
  shell-injection hole; the array-args form treats the tag verbatim
  as one argv element. Don't regress this when editing the script.
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
- Adding a resource: drop the markdown into `vendor/vitest-docs/`
  (vendored upstream — the snapshot fetcher manages this) or
  `patterns/` (curated content — author directly + update
  `_meta.json`). The existing template URIs (`vitest://docs/{+path}`,
  `vitest-agent://patterns/{slug}`) automatically address it; no
  registrar change unless adding a new URI scheme. If adding a new
  scheme, register it in `resources/index.ts` and add a reader file
  - path-traversal-safe root resolution.
- Adding a prompt: create `prompts/<slug>.ts` exporting a factory
  that returns one or more user-role messages. Add a zod arg schema
  and register the prompt in `prompts/index.ts`. Keep the factory
  pure — no `DataReader` / `DataStore` calls. If the prompt has a
  closed enum argument, mirror the pattern in `wrapup.ts` where the
  `WrapupKind` union is re-exported and the registrar coerces
  `args.kind` through it.
- Refreshing the vendored Vitest docs: run `pnpm run
  update-vitest-snapshot --tag <vN.M.K>` from this package
  directory, or invoke the `update-vitest-snapshot` Claude Code
  skill. The script rewrites `vendor/vitest-docs/` and updates
  `manifest.json` (`tag`, `commitSha`, `capturedAt`). Commit the
  whole `vendor/vitest-docs/` tree as a single change.
- Adding to the build pipeline: both `build:dev` and `build:prod`
  chain `&& node scripts/copy-vendor-to-dist.mjs` so the postbuild
  copy is atomic per command. Don't add steps that run between
  `rslib build` and the copier — keep the chain tight so a failed
  build halts before producing inconsistent dist output.
- Adding a new content tree (e.g., `vitest-agent://decisions/`):
  add the source directory as a sibling of `vendor/` and `patterns/`,
  extend `copy-vendor-to-dist.mjs` to mirror it into `dist/<env>/`,
  and resolve the new root from `import.meta.url` in
  `resources/index.ts` using the same dev/post-build dual-path
  pattern.

## Design references

@../../.claude/design/vitest-agent/components.md
@../../.claude/design/vitest-agent/decisions.md
@../../.claude/design/vitest-agent/data-structures.md
