# vitest-agent-sdk

The no-internal-deps base package. Owns the data layer, schemas, errors,
migrations, services, layers, formatters, the XDG path-resolution stack,
and the process-level migration coordinator. The reporter, CLI, and MCP
packages all depend on this package; changes to its public exports
ripple to all three runtimes.

## Layout

```text
src/
  index.ts            -- public re-exports (only entry point)
  services/           -- 10 Effect Context.Tag definitions
  layers/             -- live + test layers, OutputPipelineLive,
                         ConfigLive, PathResolutionLive, LoggerLive
  schemas/            -- Effect Schema definitions (Common, AgentReport,
                         Coverage, Thresholds, Baselines, Trends,
                         History, Options, Config, CacheManifest)
    turns/            -- discriminated TurnPayload union over
                         seven payload Schema.Structs (UserPrompt,
                         ToolCall, ToolResult, FileEdit, HookFire,
                         Note, Hypothesis)
  errors/             -- DataStoreError, DiscoveryError, PathResolutionError
  formatters/         -- markdown, gfm, json, silent + types
  migrations/         -- 0001_initial.ts (1.x 25-table schema),
                         0002_comprehensive.ts (drop-and-recreate
                         -- 40 tables + corrected notes_fts
                         BEFORE/AFTER UPDATE triggers; the LAST
                         drop-and-recreate per Decision D9)
  sql/                -- rows.ts (row types), assemblers.ts (DB -> domain)
  utils/              -- pure utilities: resolve-data-path,
                         resolve-workspace-key, normalize-workspace-key,
                         ensure-migrated, classify-test, compute-trend,
                         build-report, detect-pm, split-project, etc.
                         also: function-boundary (acorn AST walk),
                         failure-signature (sha256 hash for stable
                         failure identity), validate-phase-transition
                         (TDD D2 evidence-binding rules)
```

## Key files

| File | Purpose |
| ---- | ------- |
| `services/DataStore.ts` + `layers/DataStoreLive.ts` | All SQLite writes; defines `SettingsInput`, `SessionInput`, `TurnInput`, and other write input types. Includes `backfillTestCaseTurns(ccSessionId) → Effect<number, DataStoreError>` (suffix-match UPDATE to populate `test_cases.created_turn_id` for a session) |
| `services/DataReader.ts` + `layers/DataReaderLive.ts` | All SQLite reads; assembles domain types via `sql/assemblers.ts`. Provides `getSessionById`, `searchTurns`, `computeAcceptanceMetrics`. Includes `getLatestTestCaseForSession(ccSessionId) → Effect<Option<number>, DataStoreError>` (returns the most-recent `test_cases.id` linked to the session, or `Option.none()`) |
| `utils/resolve-data-path.ts` | Deterministic XDG-derived `dbPath` orchestrator (closes issue #39) |
| `utils/ensure-migrated.ts` | Process-level migration coordinator using a `globalThis`-keyed promise cache (Decision 28). Registers both `0001_initial` and `0002_comprehensive` (run in order) |
| `layers/PathResolutionLive.ts` | Composite: `XdgLive` + `ConfigLive` + `WorkspacesLive`; supplies `AppDirs`, `VitestAgentReporterConfigFile`, `WorkspaceDiscovery`, `WorkspaceRoot` |
| `migrations/0002_comprehensive.ts` | Drop-and-recreate migration. 40 tables: 25 1.x tables (recreated, with `signature_hash` added to `test_errors` and source-map columns added to `stack_frames`) plus 15 new tables (`sessions`, `turns`, `tool_invocations`, `file_edits`, `hypotheses`, `commits`, `run_changed_files`, `run_triggers`, `build_artifacts`, `tdd_sessions`, `tdd_session_behaviors`, `tdd_phases`, `tdd_artifacts`, `failure_signatures`, `hook_executions`). Per Decision D9, this is the **last** drop-and-recreate; future migrations are ALTER-only |
| `utils/function-boundary.ts` | `findFunctionBoundary(source, line)` parses via `acorn` and returns the smallest enclosing function's start line + name |
| `utils/failure-signature.ts` | `computeFailureSignature` produces a 16-char sha256 from `error_name`, normalized assertion shape, top-frame function name, and function-boundary line. See Decision D10 |
| `utils/validate-phase-transition.ts` | Pure validator for TDD phase transitions; returns acceptance or a typed `DenialReason` + remediation. See Decision D11 |

## Conventions

- **No internal deps.** Never import from `vitest-agent-reporter`,
  `vitest-agent-cli`, or `vitest-agent-mcp`. Keeps
  the dependency graph acyclic by construction.
- **Public-API-by-default.** Anything exported from `index.ts` is part
  of the contract used by all three runtime packages. Adding or
  removing exports needs to be considered against all three consumers.
- **Three external Effect-ecosystem deps unique to this package:**
  `xdg-effect`, `config-file-effect`, `workspaces-effect`. Don't add
  these to the runtime packages; consume the resolved layers/services
  from here instead. Also unique to shared: `acorn ^8.16.0` (with
  `@types/acorn ^6.0.4` devDep) for `function-boundary.ts`'s AST walk.
- **Effect Schema is the source of truth** for data structures. Zod
  belongs only in the MCP package (for tRPC tool input validation).
- **Errors use `Data.TaggedError`** with derived `[operation
  table-or-path] reason` messages set via `Object.defineProperty`,
  and use `extractSqlReason(e)` from `errors/DataStoreError.ts` for
  the `reason` field on every SQL `mapError`.
- **Test layers live next to live layers** (`*Live.ts` /
  `*Test.ts`) so consumers can import either side via the same
  package entry.

## When working in this package

- Adding a new `DataStore`/`DataReader` method: update both the service
  tag and the live layer, add `Effect.logDebug`, use
  `extractSqlReason(e)` in `mapError`, and consider whether MCP/CLI
  consumers will want it.
- Touching `resolveDataPath`/`PathResolutionLive`: callers still need
  `NodeContext.layer` (or `NodeFileSystem.layer`); don't bake it into
  `PathResolutionLive` itself.
- Touching `ensureMigrated`: the `globalThis`-keyed cache is intentional
  (Vite can load this module twice in one process for multi-project
  Vitest configs). Don't switch to a module-local Map. See Decision 28
  and Decision 32 for why we don't adopt `xdg-effect`'s
  `SqliteState.Live`.
- Adding/changing migrations: SQLite uses WAL + `busy_timeout`;
  multi-project test runs share one DB. Verify against
  `ensureMigrated.test.ts`.
- Renaming a public export: search both runtime packages
  (`packages/reporter`, `packages/cli`, `packages/mcp`) before
  committing.
- Adding a new turn payload type: add the `Schema.Struct` to
  `schemas/turns/`, extend the `TurnPayload` discriminated union in
  `schemas/turns/index.ts`, AND add the new `type` literal to the
  `turns.type` CHECK constraint via a new ALTER-only migration
  (`0002_comprehensive` is the last drop-and-recreate per Decision D9).
- Touching `failure-signature.ts` or `function-boundary.ts`: signature
  stability is the contract -- changing the hash inputs invalidates
  every existing `failure_signatures` row. Treat the format as
  versioned. See Decision D10.
- Touching `validate-phase-transition.ts`: keep it pure (no I/O, no
  Effect). Adding a binding rule means a new branch and a new
  `DenialReason` literal; the orchestrator will switch on it. See
  Decision D11.

## Design references

@../../.claude/design/vitest-agent/components.md
@../../.claude/design/vitest-agent/data-structures.md
@../../.claude/design/vitest-agent/decisions.md
