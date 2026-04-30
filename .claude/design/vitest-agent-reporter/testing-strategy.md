---
status: current
module: vitest-agent-reporter
category: testing
created: 2026-04-29
updated: 2026-04-30
last-synced: 2026-04-30
post-final-sync: 2026-04-30
completeness: 90
related:
  - vitest-agent-reporter/architecture.md
  - vitest-agent-reporter/components.md
  - vitest-agent-reporter/phase-history.md
dependencies: []
---

# Testing Strategy -- vitest-agent-reporter

Current testing approach, patterns, and coverage targets.

**Parent document:** [architecture.md](./architecture.md)

For chronological context on when each testing pattern landed, see
[phase-history.md](./phase-history.md).

---

## Test Layout

Tests are co-located with their sources under
`packages/<name>/src/**/*.test.ts`. The root `vitest.config.ts`
declares one named project per package plus `example-basic`, with
explicit `include` globs per project.

| Project | Tests |
| --- | --- |
| `vitest-agent-reporter-shared` | 544 |
| `vitest-agent-reporter` | 103 |
| `vitest-agent-reporter-cli` | 54 |
| `vitest-agent-reporter-mcp` | 64 |
| `example-basic` | 8 |
| **Total** | **773** |

The shared count grew by 59 on the 2.0.0-α schema branch:
`0002_comprehensive` migration verification, the seven turn
payload Schema.Struct round-trips + the `TurnPayload` union,
`function-boundary` AST walks, `failure-signature` hashing and
shape normalization, `validate-phase-transition` D2 binding rules,
and the new DataStore / DataReader methods
(`writeSession`/`writeTurn`, `getSessionById`/`searchTurns`/
`computeAcceptanceMetrics`).

The β substrate-wiring branch added 20 more tests across packages:

- shared (+10): `writeFailureSignature` upsert + occurrence-count
  increment, `endSession` updates, `writeTurn` auto-`turn_no`,
  `getSessionByCcId`, `listSessions`,
  `getFailureSignatureByHash`, `getTddSessionById`,
  `listHypotheses`, plus the `acorn-typescript` plugin keeping
  `findFunctionBoundary` parsing TS sources without throwing
- reporter (+1): `processFailure` round-trip (stack-frame walk,
  source-map, function-boundary, signature hash)
- cli (+9): `parseAndValidateTurnPayload` against each
  `TurnPayload` variant, `recordTurnEffect` against an in-memory
  DataStore, `recordSessionStart` and `recordSessionEnd`
  round-trips
- mcp (+0): existing test patterns continue to cover the seven
  new tools via `createCallerFactory` (Pattern 2). No new test
  file added on this branch -- the tools are exercised through
  the same test layers as the existing 24

The Task 30 e2e test (spawnSync against the built bin) was
deferred per Decision β-N2.

The RC substrate-integration branch adds tests across packages
for the new surfaces. The exact counts vary by sub-package, but
the additions are:

- shared: `0003_idempotent_responses` migration round-trip,
  `recordIdempotentResponse` ON CONFLICT DO NOTHING semantics,
  `findIdempotentResponse` returning `Option.none()` vs cached
  `result_json`, `writeHypothesis` + `validateHypothesis`
  (including the unknown-id `DataStoreError` path),
  `pruneSessions` cutoff math + FK CASCADE behavior, plus the
  `format-triage` and `format-wrapup` lib generators against
  in-memory SqliteClient fixtures
- cli: `triage` and `wrapup` subcommand wiring against test
  layers, `cache prune --keep-recent` round-trip
- mcp: the four new tools (`triage_brief`, `wrapup_prompt`,
  `hypothesis_record`, `hypothesis_validate`) via the existing
  `createCallerFactory` pattern (Pattern 2), plus a focused
  test for the idempotency middleware that drives
  `idempotentProcedure` with both cache-miss and cache-hit
  paths and verifies the swallow-on-persist-failure behavior

The 2.0.0 final / TDD-orchestrator branch adds **76 more
tests** across packages, bringing the total from 697 to **773**.
The new tests follow the same patterns as α/β/RC; no new
pattern names to document.

- shared (+46): `0004_test_cases_created_turn_id` migration
  round-trip, the 7 new DataStore methods (`writeTddSession`,
  `endTddSession`, `writeTddSessionBehaviors`, `writeTddPhase`
  -- including the same-transaction prior-phase-close
  semantics, `writeTddArtifact`, `writeCommit` idempotency on
  `sha`, `writeRunChangedFiles`), the 4 new DataReader
  methods (`getCurrentTddPhase`,
  `getTddArtifactWithContext` D2-context join,
  `getCommitChanges` with-and-without sha,
  `listTddSessionsForSession`), and the new `ci-annotations`
  formatter's GitHub Actions escape rules + the `osc8`
  utility's gating behavior
- mcp (+24): the 6 new tools (`tdd_session_start`,
  `tdd_session_end`, `tdd_session_resume`,
  `decompose_goal_into_behaviors`,
  `tdd_phase_transition_request`, `commit_changes`) via the
  existing `createCallerFactory` pattern (Pattern 2), plus
  expanded coverage of the 4-of-5 mutations registered for
  idempotency replay versus the deliberately-non-replayed
  `tdd_phase_transition_request`
- cli (+6): `record tdd-artifact` and
  `record run-workspace-changes` lib functions, including the
  Effect Schema decode of the `RunChangedFile[]` JSON
  argument
- reporter (+0): no reporter changes on this branch
- example-basic (+0): no example changes on this branch

All four coverage metrics (statements, branches, functions, lines)
are above 80%. The root `vitest.config.ts` `coverage.exclude` list
uses `packages/`-prefixed globs to skip bin entries, command glue,
layer composition factories, and types-only modules that are not
separately testable.

---

## Test Patterns

### Pattern 1: Effect Test Layer Composition

Each Effect service test follows the state-container pattern. Live
layers swap `@effect/platform` `FileSystem` and
`@effect/sql-sqlite-node` `SqlClient` for in-memory mocks; the test
program runs against the test layer instead of the live layer.

```typescript
const writeState = { runs: [], modules: [], testCases: [] };

const TestReporterLive = Layer.mergeAll(
  DataStoreTest.layer(writeState),
  CoverageAnalyzerTest.layer(),
  HistoryTrackerTest.layer(),
);

const run = <A, E>(effect: Effect.Effect<A, E, DataStore>) =>
  Effect.runPromise(Effect.provide(effect, TestReporterLive));

const writeRun = (input: TestRunInput) =>
  Effect.flatMap(DataStore, (svc) => svc.writeRun(input));
```

Test layers exist for:

- `DataStoreTest` -- accumulates writes into a mutable state container
- `EnvironmentDetectorTest` -- accepts a fixed environment value
- `CoverageAnalyzerTest` -- returns canned coverage data
- `ProjectDiscoveryTest` -- returns canned discovery results
- `HistoryTrackerTest` -- returns canned classifications

`DataReaderLive` and `DataStoreLive` are also exercised against a
real in-memory SQLite database (`@effect/sql-sqlite-node` with
`:memory:`) for assembler integration tests.

### Pattern 2: tRPC Caller Factory for MCP Tools

MCP tools are tested without starting the MCP server. The tRPC
router exposes `createCallerFactory`, which lets tests build a
caller bound to a mock context (carrying a test `ManagedRuntime`).

```typescript
import { createCallerFactory } from "@trpc/server";
import { appRouter } from "./router";

const factory = createCallerFactory(appRouter);
const mockCtx: McpContext = {
  runtime: ManagedRuntime.make(TestMcpLive),
  cwd: "/test/project",
};
const caller = factory(mockCtx);

const result = await caller.test_status({ project: "my-app" });
```

This avoids stdio transport, MCP SDK initialization, and process
boundaries -- procedures are tested as plain async functions.

### Pattern 3: Duck-Typed Vitest Fixtures

`buildAgentReport()` and reporter integration tests use duck-typed
`VitestTestModule` / `VitestTestCase` interfaces (defined in
`packages/shared/src/utils/build-report.ts`). Tests construct
plain object literals matching those interfaces rather than
mocking the Vitest runtime.

```typescript
const fakeModule: VitestTestModule = {
  moduleId: "/abs/path/to/file.test.ts",
  state: () => "passed",
  diagnostic: () => ({ duration: 42 }),
  errors: () => [],
  children: { allTests: () => fakeTests },
  project: { name: "unit" },
};
```

### Pattern 4: Process-Level Coordination Tests

`ensureMigrated` is tested with `_resetMigrationCacheForTesting`
between cases (the cache lives on `globalThis` via
`Symbol.for("vitest-agent-reporter/migration-promises")`). The
suite covers four scenarios:

1. Fresh DB migrates without error
2. Concurrent calls with the same `dbPath` share the same promise
3. Distinct `dbPath`s yield independent promises
4. Three concurrent callers serialize without `SQLITE_BUSY`

### Pattern 5: Pure Function Tests for CLI Lib

CLI commands are not tested directly -- they are thin wrappers
around `@effect/cli` `Command` definitions. The testable formatting
logic lives in `packages/cli/src/lib/format-*.ts` and is exercised
as plain pure functions taking domain inputs (e.g. `AgentReport`,
`CoverageReport`) and returning rendered strings.

---

## Coverage Targets

The root `vitest.config.ts` enforces these coverage thresholds via
the v8 provider:

| Metric | Target |
| --- | --- |
| Statements | 80% |
| Branches | 80% |
| Functions | 80% |
| Lines | 80% |

The `coverage.exclude` list rewrites target the `packages/`-prefixed
layout. Excluded paths:

- Bin entries (`packages/{cli,mcp}/src/bin.ts`)
- Command glue (thin wrappers over lib functions)
- Layer composition factories that only merge other layers
- Types-only modules with no runtime behavior

`pool` is `forks` (not threads) for broader compatibility with
`better-sqlite3`'s native bindings. CI sets `CI=true` and enables
the v8 coverage provider via `pnpm run ci:test`.

---

## Integration Test Targets

Integration tests verify behavior that unit tests can't reach:

- **End-to-end reporter behavior** -- run actual Vitest test runs
  through `AgentReporter` and assert on the resulting `data.db`
  contents and console output. The `examples/basic` package is
  the canonical integration target
- **Multi-project DB writes** -- a Vitest config with multiple
  projects sharing one `data.db` and assertions that
  `(project, subProject)` columns are populated correctly
- **GFM output** -- mock `GITHUB_STEP_SUMMARY` to a temp file and
  assert the reporter's appended content
- **Reporter injection via `AgentPlugin`** -- exercise
  `configureVitest` with a fake Vitest plugin context and assert
  on the final reporters array
- **CLI bin invocation** -- spawn the bin against a populated
  `data.db` and assert on stdout
- **MCP tool invocations** -- via tRPC caller factory against a
  populated test runtime (Pattern 2)

---

## Test File Discovery

Test discovery globs are scoped per Vitest project to keep
unrelated tests from running. Each project's `include` pattern is
roughly:

```text
packages/<name>/src/**/*.test.ts
```

`example-basic` uses `examples/basic/src/**/*.test.ts`.

Tests that need real SQLite databases use `:memory:` rather than
disk-backed DBs to avoid concurrent-test isolation issues.

---

**Document Status:** Current. Reflects the post-2.0.0 final /
TDD-orchestrator four-package test layout. For when each pattern
was introduced, see [phase-history.md](./phase-history.md).
