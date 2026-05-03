---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-05-03
last-synced: 2026-05-03
completeness: 100
related:
  - vitest-agent-reporter/architecture.md
  - vitest-agent-reporter/components.md
dependencies: []
---

# Decisions -- vitest-agent-reporter

Architectural decisions, design patterns, and trade-offs that shaped the
system. Reference this when understanding "why" something was built a
certain way.

**Parent document:** [architecture.md](./architecture.md)

---

## Architectural Decisions

### Decision 1: Dual Output Strategy (Markdown + JSON)

**Context:** LLM agents need both human-readable context (for reasoning)
and machine-parseable data (for programmatic analysis of failures).

**Options considered:**

1. **Dual output (Chosen):**
   - Pros: Markdown is natural for LLM reasoning; JSON enables
     programmatic access, persistence across runs, manifest-first reading
   - Cons: Two output paths to maintain
   - Why chosen: Each format serves a distinct purpose the other can't

2. **JSON only:**
   - Pros: Single format, simpler
   - Cons: LLMs reason better with natural language
   - Why rejected: Console output is the primary feedback loop for agents

3. **Markdown only:**
   - Pros: Single format, great readability
   - Cons: No persistence across runs
   - Why rejected: Manifest-first pattern requires structured data on disk

### Decision 2: Reporter-Native Project Grouping

**Context:** Monorepo users need per-project test output. Original design
proposed creating `:ai` mirror projects via a Vite plugin.

**Original approach (rejected):** Vite plugin with `:ai` mirror projects.
Duplicated every project definition, required `VITEST_AI=1` env-var gate,
and was unnecessary since the Reporter API provides project info natively.

**Chosen approach:** Reporter-native grouping via `TestProject` API. Zero
configuration; works in monorepos and single repos; no mirror projects;
single reporter instance. Uses `testModule.project.name` for grouping.
`splitProject()` separates `"project:subProject"` for normalized database
storage.

### Decision 3: Four-Environment Detection

**Context:** The reporter needs to behave differently depending on who is
running tests and in what context.

**Chosen approach:** EnvironmentDetector service with four granular
environments: `agent-shell` (LLM agent in a shell), `terminal` (human in
terminal), `ci-github` (GitHub Actions specifically), `ci-generic` (other
CI systems). The ExecutorResolver then maps these to three executor roles
(`human`, `agent`, `ci`) for output behavior.

**Why chosen:** The CI split (`ci-github` vs `ci-generic`) enables
GFM-specific behavior without conflating all CI environments. The
`agent-shell` vs `terminal` distinction supports finer-grained output
format selection. The two-stage pipeline (environment detection -> executor
resolution) separates fact-finding from behavior decisions.

### Decision 4: Duck-typed Istanbul Interface

**Context:** Coverage integration needs to work with both
`@vitest/coverage-v8` and `@vitest/coverage-istanbul`.

**Why chosen:** The `onCoverage` hook receives an istanbul `CoverageMap`
directly. Both providers normalize to the same interface. We duck-type at
runtime via `isIstanbulCoverageMap()` to avoid forcing a specific coverage
provider peer dependency. Istanbul interfaces are kept as TypeScript
interfaces, not schemas.

### Decision 5: Effect Schema Data Structures

**Context:** Report and manifest data needs to be both type-safe in
TypeScript and serializable to/from JSON files on disk.

**Chosen approach:** Effect Schema definitions split across
`packages/shared/src/schemas/` directory. TypeScript types derived via
`typeof Schema.Type`. JSON encode/decode via `Schema.decodeUnknown` /
`Schema.encodeUnknown`. Schemas are exported from the public API so
consumers can validate report files.

**Why chosen:** Effect Schema integrates naturally with the Effect service
architecture. Unified ecosystem means schemas compose with Effect services
without bridging.

**Note:** `zod` is a runtime dependency for tRPC procedure input validation
in the MCP server. This is separate from the data schema layer -- Effect
Schema remains the source of truth for data structures, while Zod is used
only for MCP tool input schemas where `@trpc/server` requires it.

### Decision 6: Effect Services over Plain Functions

**Context:** The reporter and CLI share functionality (cache reading,
coverage processing). Both need testable I/O without mocking Node APIs
directly.

**Chosen approach:** Ten Effect services: DataStore, DataReader,
EnvironmentDetector, ExecutorResolver, FormatSelector, DetailResolver,
OutputRenderer, CoverageAnalyzer, ProjectDiscovery, HistoryTracker. Live
layers use `@effect/platform` FileSystem and `@effect/sql-sqlite-node`;
test layers swap in mock implementations.

**Why chosen:** The output pipeline needed distinct stages
(detect -> resolve -> select -> resolve detail -> render) to be
individually testable. The data layer split (DataStore write vs DataReader
read) enables different composition in different contexts (reporter writes,
CLI/MCP reads).

### Decision 7: Scoped Effect.runPromise in Reporter

**Context:** Vitest instantiates the reporter class -- we don't control
construction. We need to use Effect services inside class methods.

**Chosen approach:** Each lifecycle hook (`onTestRunEnd`) builds a scoped
effect and runs it with `Effect.runPromise`, providing the
`ReporterLive(dbPath)` layer inline. No `ManagedRuntime` needed for the
reporter.

**Why chosen:** The layer is lightweight (SQLite + pure services), so
per-call construction is acceptable. Avoids `ManagedRuntime` lifecycle
concerns (no resource leak, no disposal needed). For the plugin,
`configureVitest` is async (Vitest awaits plugin hooks), so
`Effect.runPromise` is also safe there.

**Note:** The MCP server does use `ManagedRuntime` because it is a
long-running process where per-call construction would be wasteful.

### Decision 8: CLI-First Overview

**Context:** Overview/status data could be generated on every test run
(in the reporter's `onInit` hook) or on-demand by a separate tool.

**Chosen approach:** The CLI generates overview/status on-demand. The
reporter writes test results to the database; the CLI reads them plus does
its own project discovery when asked.

**Why chosen:** Keeps the reporter lean. Overview generation requires
filesystem discovery (globbing for test files, reading source files) that
would slow down every test run. On-demand generation is more appropriate
for discovery data that changes infrequently.

### Decision 9: Hybrid Console Strategy

**Context:** Vitest 4.1 added a built-in `agent` reporter. Our plugin
originally stripped all console reporters and took over output entirely.

**Chosen approach:** New `strategy` option (originally `consoleStrategy`,
see Decision 27 for the rename):

- `"complement"` (default) -- layers on top of Vitest's built-in agent
  reporter. Does not strip reporters. Writes to database only.
  Warns if `agent` reporter missing from chain
- `"own"` -- strips built-in console reporters, uses our formatter, writes
  our own GFM

**Why chosen:** Users who already have Vitest's built-in agent reporter
configured should not have it ripped out by our plugin. The complement
mode is additive. Users who need our specific output format can opt into
`"own"` mode.

### Decision 10: GFM Output for GitHub Actions

**Context:** Cloud-based agents and humans reviewing CI results need
structured test output in check run summaries.

**Chosen approach:** Auto-detect `process.env.GITHUB_ACTIONS`, append GFM
to `process.env.GITHUB_STEP_SUMMARY`. Allow override via options. Same
data structures serve both local and CI output -- conditional formatting
is simpler than a separate reporter class. In complement mode, GFM is
left to Vitest's built-in reporter.

### Decision 11: Cache Directory Resolution

> **Superseded by Decision 31 in 2.0.** The 1.x three-priority
> resolution described below -- including the
> `vite.cacheDir + "/vitest-agent-reporter"` fallback -- was replaced
> by deterministic XDG-based resolution. See Decision 31 for the
> current behavior.

**Context:** The cache directory needs to work in multiple contexts:
standalone reporter, plugin with Vite, CLI reading cached data, MCP
server, and consumer-specified paths.

**Chosen approach:** Three-priority resolution in `AgentPlugin`:

1. Explicit `reporter.cacheDir` option (user override)
2. `outputFile['vitest-agent-reporter']` from Vitest config (native pattern)
3. `vite.cacheDir + "/vitest-agent-reporter"` (default, typically
   `node_modules/.vite/.../vitest-agent-reporter/`)

CLI and MCP cache dir resolution check common locations. The database
file is `data.db` within the resolved cache directory.

When using `AgentReporter` standalone (without the plugin), the default is
`.vitest-agent-reporter` in the project root.

### Decision 12: Compact Console Output

**Context:** LLM agents have limited context windows. Console output
should maximize signal-to-noise ratio.

**Chosen approach:**

- Single-line header with pass/fail counts and duration
- No summary tables (counts are in the header)
- No coverage totals table (only files below threshold with uncovered lines)
- "Next steps" section with specific re-run commands (or MCP tools when
  `mcp: true`)
- Relative file paths throughout
- No redundant "All tests passed" line (header already conveys this)
- No cache file pointer line (not useful to agents)

### Decision 13: History Always-On

**Context:** Failure history could be an opt-in feature (toggle in
`AgentReporterOptions`) or always enabled alongside the existing report
cache.

**Options considered:**

1. **Always-on (Chosen):**
   - Pros: Zero configuration; agents always have classification data;
     consistent behavior across all consumer setups; simpler code paths
   - Cons: Writes additional rows per test on every run
   - Why chosen: History rows are small. The write cost is negligible.
     An opt-in toggle adds API surface without meaningful benefit

2. **Opt-in toggle:**
   - Why rejected: The opt-in overhead outweighs the marginal write savings

**Implementation:** `DataStore.writeHistory` is called unconditionally
for each test case in `onTestRunEnd`.

### Decision 14: Vitest-Native Threshold Format

**Context:** Vitest supports a rich format for coverage thresholds with
per-metric thresholds, per-glob patterns, negative numbers (relative
thresholds), `100` shorthand, and `perFile` mode.

**Chosen approach:** `coverageThresholds` accepts the full Vitest
thresholds format (`Record<string, unknown>`). Parsed by
`resolveThresholds()` into a typed `ResolvedThresholds` structure.

### Decision 15: Three-Level Coverage Model

**Context:** Users need both hard enforcement (fail the build) and
aspirational goals (track progress toward 100%). A single threshold
serves one purpose but not both.

**Chosen approach:** Three levels:

1. **Thresholds** (`coverageThresholds`) -- enforced minimums
2. **Targets** (`coverageTargets`) -- aspirational goals
3. **Baselines** (stored in SQLite `coverage_baselines` table) --
   auto-ratcheting high-water marks

### Decision 16: Coverage Trend Tracking

**Context:** Point-in-time coverage data doesn't show whether coverage is
improving or degrading over time.

**Chosen approach:** Per-project trend tracking with 50-entry sliding
window stored in the SQLite `coverage_trends` table. Only recorded on
full (non-scoped) test runs. Target change detection via hash comparison
resets trend history when targets change.

### Decision 17: Tiered Console Output

**Context:** LLM agents benefit from progressive disclosure -- minimal
noise on green runs, progressively more detail as problems accumulate.

**Chosen approach:** Three tiers based on run health:

- **Green** (all pass, targets met): one-line summary
- **Yellow** (pass but below targets): improvements needed + CLI hint
- **Red** (failures/threshold violations/regressions): full detail +
  CLI hints

Tiered output is implemented in the markdown formatter
(`packages/shared/src/formatters/markdown.ts`) and controlled by the
DetailResolver service, which maps `(executor, runHealth)` to a
`DetailLevel` enum.

### Decision 18: SQLite over JSON Files

**Context:** JSON file storage creates issues with concurrent access,
atomicity, querying across projects, and file proliferation in monorepos.

**Options considered:**

1. **SQLite with normalized schema (Chosen):**
   - Pros: ACID transactions, concurrent reads (WAL mode), efficient
     queries across projects, relational integrity via foreign keys,
     single file per cache directory, FTS5 for note search, migration-
     based schema evolution
   - Cons: Binary format (not human-readable), requires SQLite dependency
   - Why chosen: The benefits of structured queries, relational integrity,
     and single-file storage dramatically simplify the data layer

2. **JSON files:**
   - Pros: Human-readable, no external dependencies
   - Cons: No cross-project queries, no atomicity, file proliferation,
     no FTS, growing number of file types creates increasing complexity
   - Why rejected: The growing number of data types (reports, history,
     trends, baselines, manifest) made per-file management unscalable

3. **Embedded key-value store (LevelDB, etc.):**
   - Pros: Simple API, single file
   - Cons: No relational queries, no SQL, custom migration story
   - Why rejected: We need relational queries for cross-project analysis

**Implementation:** 41-table normalized schema via `@effect/sql-sqlite-node`
SqliteMigrator. WAL journal mode for concurrent reads. All composition
layers (`ReporterLive`, `CliLive`, `McpLive`) are functions of `dbPath`
that construct the SqliteClient layer inline.

### Decision 19: tRPC for MCP Routing

**Context:** The MCP server needs to expose 41 tools. Each tool needs
input validation, type-safe context access, and testable procedure logic.

**Options considered:**

1. **tRPC router (Chosen):**
   - Pros: Type-safe procedures, `createCallerFactory` for testing without
     MCP transport, middleware support, input validation via Zod schemas,
     clean separation of routing from transport
   - Cons: Adds tRPC and Zod as dependencies
   - Why chosen: The `createCallerFactory` pattern enables unit testing
     of tool procedures without starting the MCP server

2. **Direct MCP SDK handlers:**
   - Pros: Fewer dependencies, simpler
   - Cons: No type-safe context, harder to test without transport
   - Why rejected: Testing would require mocking the MCP SDK, which is
     more complex than tRPC's built-in caller factory

3. **Effect-native routing:**
   - Pros: Stay in the Effect ecosystem
   - Cons: No established MCP integration pattern
   - Why rejected: Effect doesn't have an MCP SDK equivalent; bridging
     would add more complexity than tRPC

**Implementation:** tRPC context carries a `ManagedRuntime` for Effect
service access. Each procedure calls `ctx.runtime.runPromise(effect)` to
execute Effect programs. Zod is used only for MCP tool input schemas.

### Decision 20: File-Based Claude Code Plugin

**Context:** Claude Code supports file-based plugins via a `.claude-plugin/`
directory with hooks, skills, and commands. The plugin needs to integrate
the MCP server and provide test-specific workflows.

**Chosen approach:** A `plugin/` directory (NOT a pnpm workspace) containing:

- `.claude-plugin/plugin.json` manifest for plugin identity
- `.mcp.json` for automatic MCP server registration
- Shell-based hooks for session startup and post-test-run detection
- Markdown skill files for TDD, debugging, and configuration workflows
- Markdown command files for setup and configure operations

**Why file-based:** Claude Code's plugin system discovers plugins via
filesystem conventions. The hooks use shell scripts for broad compatibility.
Skills and commands are markdown files that Claude Code reads directly --
no compilation or runtime needed.

**Why NOT a workspace:** The plugin directory contains only static files
(JSON, shell scripts, markdown). It has no dependencies, no build step,
and no tests. Making it a pnpm workspace would add unnecessary
configuration overhead.

### Decision 21: spawnSync for run_tests

**Context:** The `run_tests` MCP tool needs to execute `vitest run` and
return results. The MCP server is a long-running stdio process.

**Chosen approach:** `spawnSync` with configurable timeout (default 120s)
to execute `npx vitest run` with optional file and project filters.

**Why synchronous:** MCP tool handlers are already async (tRPC procedures
return Promises). Using `spawnSync` within the handler keeps the
implementation simple -- the tool blocks until Vitest completes, then
returns the result. The timeout prevents runaway test runs from blocking
the MCP server indefinitely.

**Trade-off:** The MCP server cannot process other tool requests while
`run_tests` is executing. This is acceptable because agents typically
wait for test results before proceeding.

### Decision 22: Output Pipeline Architecture

**Context:** Formatting logic needed clear stage separation with individual
testability. The format depends on a combination of environment, executor
role, explicit overrides, and run health.

**Chosen approach:** Five chained Effect services forming a pipeline:

1. **EnvironmentDetector** -- fact-finding: what environment are we in?
2. **ExecutorResolver** -- mapping: what role does this environment imply?
3. **FormatSelector** -- selection: what output format should we use?
4. **DetailResolver** -- calibration: how much detail should we show?
5. **OutputRenderer** -- execution: render reports using selected formatter

**Why a pipeline:** Each stage has a single responsibility and is
independently testable. The pipeline can be short-circuited (e.g., explicit
`--format` flag bypasses FormatSelector's automatic selection). New
formatters can be added without modifying the pipeline services.

### Decision 23: Normalized Project Identity

**Context:** Vitest project names can include colons for sub-projects
(e.g., `"my-app:unit"`, `"my-app:e2e"`).

**Chosen approach:** `splitProject()` utility separates the project name
at the first colon into `project` and `subProject` fields. Both fields
are stored in the database and used for querying. The `ProjectIdentity`
interface (`{ project: string, subProject: string | null }`) is used
throughout the data layer.

**Why split:** Normalized project/sub-project fields enable queries like
"all sub-projects of my-app" or "all unit test results across projects"
without string parsing at query time.

### Decision 24: Effect-Based Structured Logging

**Context:** The previous `debug: boolean` option was too coarse and
produced unstructured output. Debugging data layer issues required
more granular, machine-readable logging.

**Chosen approach:** `LoggerLive` layer factory using
`Logger.structuredLogger` for NDJSON format. `logLevel` option with
5 levels (`Debug`, `Info`, `Warning`, `Error`, `None`). Optional
`logFile` for file output via `Logger.zip`. Env var fallback
(`VITEST_REPORTER_LOG_LEVEL`, `VITEST_REPORTER_LOG_FILE`).
Case-insensitive level names via `resolveLogLevel` helper.

**Why chosen:** Effect's native `Logger` integrates directly with
`Effect.logDebug` calls already used throughout the service layer.
NDJSON is parseable by log aggregation tools. The env var fallback
enables logging without config changes (useful for CI debugging).

### Decision 25: Per-Project Reporter Instances

**Context:** In multi-project Vitest configs, a single reporter
instance receives all test modules from all projects. This caused
duplicate output and duplicate coverage processing.

**Chosen approach:** Plugin passes the project name from the
`configureVitest` context as `projectFilter` on AgentReporter. Each
reporter instance filters `testModules` to only modules matching
its project. Coverage dedup: only the first project alphabetically
processes global coverage data.

**Why chosen:** Vitest calls `configureVitest` per project, giving
each project its own reporter instance. Filtering at the reporter
level is simpler than coordinating between instances. Alphabetical
coverage dedup is deterministic and requires no shared state.

### Decision 26: Native Coverage Table Suppression

**Context:** Vitest prints a large text coverage table to the console
by default. This duplicates the reporter's own compact coverage output
and wastes context window tokens for LLM agents.

**Chosen approach:** In agent/own mode, the plugin sets
`coverage.reporter = []` to suppress Vitest's built-in text table.
Our reporter produces its own compact coverage gaps section.

**Why chosen:** Setting `coverage.reporter` to empty array is the
cleanest way to suppress the table without affecting coverage data
collection. The table is redundant with our output.

### Decision 27: `consoleStrategy` Renamed to `strategy`

**Context:** The `consoleStrategy` option name was verbose and the
`console` prefix was redundant given the plugin context.

**Chosen approach:** Renamed to `strategy` on `AgentPluginOptions`.
Same values (`"own" | "complement"`, default `"complement"`).

**Why chosen:** Shorter, cleaner API. The option controls the
overall strategy for how the plugin interacts with Vitest's reporter
chain, not just console behavior.

### Decision 28: Process-Level Migration Coordination via globalThis Cache

**Context:** In multi-project Vitest configurations sharing a single
`data.db`, each `AgentReporter` instance ran SQLite migrations through
its own `SqliteClient` connection. With a fresh database, two
connections would both start deferred transactions and then attempt to
upgrade to write, producing `SQLITE_BUSY` (database is locked). SQLite's
busy handler is not invoked for write-write upgrade conflicts on
deferred transactions, so better-sqlite3's 5s `busy_timeout` did not
help.

**Options considered:**

1. **Process-level coordinator with `globalThis`-keyed promise cache (Chosen):**
   - Pros: Migration runs exactly once per `dbPath`; concurrent reporter
     instances share the same in-flight promise; works across module
     instances when Vite's multi-project pipeline loads our plugin
     module twice in the same Node process; no inter-process locking
     required; subsequent reads/writes work normally under WAL +
     `busy_timeout` once migration completes
   - Cons: Adds a hidden `Symbol.for(...)` global; couples coordination
     to process lifetime
   - Why chosen: Solves the actual race condition without serializing
     anything but the migration step itself

2. **Module-local `Map` cache:**
   - Pros: Simpler, avoids `globalThis` pollution
   - Cons: Vite's multi-project pipeline can load our module under
     separate module instances (one per project) within the same
     process. A module-local Map results in independent caches per
     project, defeating coordination
   - Why rejected: Breaks for the very scenario it's meant to fix

3. **File-based lock or busier `BEGIN IMMEDIATE` retries:**
   - Pros: No globals
   - Cons: File locks are platform-fraught; `BEGIN IMMEDIATE` would
     require rewriting the migrator's transaction boundaries, which we
     don't own
   - Why rejected: Migrating the migrator is out of scope; the fix
     should live at the call site

**Implementation:** New utility
`packages/shared/src/utils/ensure-migrated.ts` exports `ensureMigrated(dbPath,
logLevel?, logFile?)`. The promise cache lives at
`Symbol.for("vitest-agent-reporter/migration-promises")` on
`globalThis`. `AgentReporter.onTestRunEnd` awaits `ensureMigrated`
before the main `Effect.runPromise`; on rejection, it prints
`formatFatalError(err)` to stderr and returns. The function is also
referenced from a new test file with a `_resetMigrationCacheForTesting`
internal helper.

### Decision 29: Plugin MCP Server Loader (RETIRED)

> Retired. Superseded by Decision 30 (PM-detect + spawn loader). The
> previous `file://` dynamic-import + `node_modules` walk is gone --
> `vitest-agent-reporter-mcp` is now its own package with its own bin,
> so the user's package manager can resolve and execute it directly.
> Original rationale preserved in git history at commit 813eef2.

### Decision 30: Plugin MCP Loader as PM-Detect + Spawn

**Context:** A `file://` dynamic-import + `node_modules` walk approach
was fragile: it depended on an exact `./mcp` subpath export, duplicated
Node's resolution algorithm (breaking under yarn berry PnP and custom
store directories), and surfaced errors as "couldn't find ./mcp export"
rather than "the package isn't installed". The four-package split retired
the `./mcp` subpath export -- the MCP server is now its own package with
its own bin.

**Chosen approach:** rewrite `plugin/bin/mcp-server.mjs` body as a
zero-deps PM-detect + spawn script:

1. Resolve `projectDir` from `process.env.CLAUDE_PROJECT_DIR ||
   process.cwd()`
2. Detect the user's package manager:
   - First, check `packageManager` field in `<projectDir>/package.json`
     (e.g. `"pnpm@10.32.1"`)
   - Then, check lockfile presence in `projectDir`:
     `pnpm-lock.yaml` -> `pnpm`, `bun.lock` or `bun.lockb` -> `bun`,
     `yarn.lock` -> `yarn`, `package-lock.json` -> `npm`
   - Default to `npm`
3. Spawn `<pm-exec> vitest-agent-reporter-mcp` with `stdio:
   "inherit"`, `cwd: projectDir`, and `env: { ...process.env,
   VITEST_AGENT_REPORTER_PROJECT_DIR: projectDir }`. The PM commands
   are: `pnpm exec`, `npx --no-install`, `yarn run`, `bun x`
4. On `child.error` (e.g. PM not on PATH): print PM-specific install
   instructions and the underlying error, exit `1`
5. On `child.exit(code, signal)`: if code is 0, exit 0. If a signal
   was received, re-raise it via `process.kill(process.pid, signal)`
   so the parent sees the right termination cause. Otherwise print
   PM-specific install instructions for the missing peer dep and
   forward the exit code

The script imports only `node:child_process`, `node:fs`, and
`node:path` -- it must run before the user has installed anything.

**`VITEST_AGENT_REPORTER_PROJECT_DIR` env passthrough:** the spawned
MCP subprocess uses this env var as the highest-precedence source
for `projectDir` (see Component 22 / `packages/mcp/src/bin.ts`'s
`resolveProjectDir`). Claude Code sets `CLAUDE_PROJECT_DIR` for hook
scripts but does not reliably propagate it to MCP server
subprocesses; this passthrough ensures the MCP server sees the same
project root the loader resolved.

**Why chosen:**

- The MCP server is its own package with its own bin in 2.0. The
  user's PM already knows how to find and execute project bins
  (`node_modules/.bin` resolution, hoisting rules, monorepo
  awareness, etc.). Re-implementing that resolution in the loader
  was the wrong layer
- A missing peer dep now surfaces as a PM-level error with PM-native
  install instructions ("run `pnpm add -D vitest-agent-reporter`"),
  not "couldn't find ./mcp export"
- The loader doesn't need to understand Effect, exports maps,
  better-sqlite3 native bindings, or the package's internal layout
- `npx --no-install` (instead of plain `npx`) eliminates the
  Decision-29-era hazard of npx silently downloading from the
  registry and exceeding Claude Code's MCP startup window

**Trade-offs:**

- The loader still has to know about four PMs and their `exec`
  syntaxes. Keeping that table in sync with new PM versions is a
  small maintenance burden
- PM-specific peer-dep enforcement varies (npm warns, pnpm errors,
  yarn berry strict, bun varies). The README documents this so
  install UX surprises are mitigated

### Decision 31: Deterministic XDG Path Resolution

**Context:** The prior `resolveDbPath` was an artifact-probing resolver
that walked `node_modules/.vite/vitest/<hash>/.../data.db` to find an
existing database. On a fresh project the resolver fell back to a literal
path that disagreed with where data was actually written, causing the MCP
server to error on every query tool until the user reconnected. The root
bug was treating the path as a function of the filesystem (does this
artifact exist?) rather than a function of identity (which workspace is
this?).

**Chosen approach:** the data path is now a deterministic function
of the workspace's identity, derived from XDG env vars and the
workspace's `package.json` `name`:

`$XDG_DATA_HOME/vitest-agent-reporter/<workspaceKey>/data.db`

where `<workspaceKey>` is the root `package.json` `name` normalized
via `normalizeWorkspaceKey` (`@org/pkg` -> `@org__pkg`). On systems
without `XDG_DATA_HOME` it falls back to
`~/.local/share/vitest-agent-reporter/<workspaceKey>/data.db` per
`xdg-effect`'s `AppDirs` semantics. An optional
`vitest-agent-reporter.config.toml` lets users override the
`<workspaceKey>` segment (`projectKey` field) or the entire data
directory (`cacheDir` field). The plugin's programmatic
`reporter.cacheDir` option is highest precedence. See Component 30
for the full precedence table.

**Why XDG:**

- The XDG Base Directory Specification is the closest thing to a
  cross-platform convention for "where should an app store user
  data". `xdg-effect` honors `XDG_DATA_HOME` on all platforms with a
  sensible fallback
- The DB is workspace-scoped state, not project-build-output. It
  doesn't belong under `node_modules` (gets wiped by `rm -rf
  node_modules`) and it doesn't belong in the project tree (clutters
  git status, requires gitignore management). XDG's "user data"
  category is the right semantic match

**Why workspace-name keying (vs path hash):**

- **Worktree consistency:** two checkouts of the same repo share
  history. With path hashing they would diverge
- **Disk-move resilience:** moving a project preserves the workspace
  identity, so the DB follows the project rather than its filesystem
  coordinates
- **Human-readable:** `ls ~/.local/share/vitest-agent-reporter/`
  shows package names instead of opaque hashes -- useful for manual
  inspection, the `cache clean` command, and debugging path
  resolution
- **Forks:** a fork that renames its package gets its own DB
  automatically. A fork that keeps the same `name` shares the DB --
  users opt out via `projectKey`

**Why fail-loud on missing workspace identity:**

The default config (no TOML override, no workspace `name`) raises
`WorkspaceRootNotFoundError` instead of falling back to a path hash.
Silent fallbacks make the DB location depend on filesystem layout
instead of identity. Anyone hitting this error has a one-line fix (set
`projectKey` in the config TOML or add `name` to their root
`package.json`) and gains the benefits above for free.

**Why a TOML config file (vs JSON or .json5):**

- TOML's distinction between strings and identifiers reads more
  naturally for path-like config than JSON's everything-is-a-string
- `config-file-effect`'s `TomlCodec` integrates cleanly with Effect
  Schema decoding; we get free validation
- TOML is already familiar to the Rust/Cargo ecosystem and shows up
  in Python tooling (pyproject.toml, ruff, etc.); developers won't
  be surprised

**Trade-offs:**

- Workspace name collisions: two unrelated projects sharing the same
  root `name` will resolve to the same `<workspaceKey>` and share a
  DB. Symptom: mixed history. Mitigations: (a) the `projectKey`
  config override, (b) the human-readable XDG layout makes the
  collision discoverable on inspection, (c) the README documents the
  behavior. Path-hashing avoids collisions but loses worktree
  consistency, disk-move resilience, and human readability -- we
  chose collision-with-escape-hatch over hashing
- Three external dependencies (`xdg-effect`, `config-file-effect`,
  `workspaces-effect`). All three are spencerbeggs-published
  Effect-native libraries; the alternative was inlining ~500 LOC of
  XDG + TOML + workspace-discovery logic, which was rejected as
  undermaintainable
- Users on the prior 1.x path lose history on first 2.0 run.
  Documented as a breaking change; no migration code (the new
  location is determined a priori, the old location was probed at
  runtime, so a one-time copy is not straightforward)

### Decision 32: Keep `ensureMigrated` Instead of `xdg-effect`'s `SqliteState.Live`

**Context:** `xdg-effect` ships a `SqliteState.Live` that combines an
XDG-resolved path, a SQLite client, and a migrator into a single layer.
It was evaluated as a candidate to replace the `SqliteClient` +
`SqliteMigrator` + `ensureMigrated` triplet. The investigation went the
other way.

**Decision:** keep `ensureMigrated` and our existing migrator setup.
Don't adopt `SqliteState.Live`.

**Why:**

- `SqliteState.Live` constructs migrations as part of layer
  construction, with no process-level coordination across
  independent layer instances. In multi-project Vitest configs each
  reporter instance constructs its own runtime (Decision 25 -- per-
  project reporter instances), so multiple migrations would race on
  a fresh DB and reintroduce the SQLITE_BUSY issue Decision 28 was
  written to fix
- The migration tracking tables differ: `xdg-effect` uses
  `_xdg_migrations`, `@effect/sql-sqlite-node`'s `SqliteMigrator`
  uses `effect_sql_migrations`. Switching would require a one-time
  bootstrap that reads both tables and reconciles state. For
  existing 2.0 users this is moot (history resets anyway), but it's
  a real code path we'd have to write and test
- `ensureMigrated`'s `globalThis`-keyed promise cache is
  battle-tested at this point and the surface area is small (~50
  LOC in a single file). The maintenance cost is approximately zero

**Trade-offs:**

- We don't get whatever future improvements land in
  `SqliteState.Live`. Acceptable -- our migration story is stable,
  and we can always swap later if `SqliteState.Live` grows
  process-level coordination

Decision 28 remains in force as the canonical fix for the SQLITE_BUSY
race.

### Decision 33: Four-Package Split

**Context:** The 1.x `vitest-agent-reporter` package shipped the
reporter, plugin, CLI bin, and MCP server in one npm package. Three
problems compounded: (a) any change to MCP forced a reporter version
bump (and vice versa), making coordinated releases mandatory but
making the changelog noisy; (b) users who only wanted the CLI or
only the MCP server still pulled the full transitive dependency
graph (`@modelcontextprotocol/sdk`, `@trpc/server`, `zod`,
`@effect/cli`, etc.); (c) issue #39's debugging surfaced a
"reporter pinned at 1.3.0, plugin shell at 1.3.1, MCP code that
actually ran was 1.3.0" version-skew where the package boundary made
it hard to reason about which code was running.

**Decision:** split the monolith into four pnpm workspaces under
`packages/`:

| Package | Role |
| --- | --- |
| `vitest-agent-reporter-shared` | data layer, schemas, services, formatters, utilities, XDG path stack -- no internal deps |
| `vitest-agent-reporter` | reporter + plugin + ReporterLive + CoverageAnalyzer; declares cli + mcp as required peer deps |
| `vitest-agent-reporter-cli` | `vitest-agent-reporter` bin |
| `vitest-agent-reporter-mcp` | `vitest-agent-reporter-mcp` bin |

All four release in lockstep via changesets `linked` config. The
reporter declares the CLI and MCP packages as **required**
`peerDependencies` so installing the reporter still pulls the agent
tooling along with it -- this preserves the 1.x install ergonomics
while giving us independent versioning at the npm layer.

**Why this split (and not, e.g., reporter + everything-else):**

- The shared package boundary is determined by "what does more than
  one runtime package need". The data layer (DataStore, DataReader,
  schemas, migrations, errors) is consumed by all three runtimes;
  the output pipeline by reporter and (transitively, via formatted
  output) CLI/MCP; the path-resolution stack by all three. Pulling
  these into shared makes circular-import problems impossible by
  construction
- The CLI/MCP split is justified by the dependency footprint:
  `@effect/cli` is heavy and only the CLI needs it; the MCP SDK + tRPC
  - zod stack is heavy and only MCP needs it. Co-located in one
  package, every install pays for both
- The reporter stays its own package because it has the only
  Vitest-API-aware code (`AgentReporter` class, `AgentPlugin`
  factory) and because users importing
  `from "vitest-agent-reporter"` should keep that import working

**Why required peer deps (vs optional or full deps):**

- Optional peers would let users install only the reporter without
  the CLI/MCP, but they'd silently lose the bin invocations the
  reporter's "Next steps" output suggests, and the MCP server the
  Claude Code plugin needs. The 1.x install story shipped all
  three; required peers preserve that
- Direct deps would tie the reporter's lockfile to the CLI/MCP
  versions and prevent users from upgrading them independently
- Required peers split the difference: lockstep version coordination
  without bundling the dependency graph

**Why "shared" (not "schema") for the base package name:**

The name `vitest-agent-reporter-shared` reflects the actual role:
anything depended on by more than one runtime package. The package owns
not only schemas but also services, layers, formatters, utilities,
errors, migrations, and the entire XDG path stack.

**Trade-offs:**

- Lockstep releases require all four `package.json` files to bump in
  sync. Changesets `linked` config handles this, but it's a process
  rule the team has to follow
- Three new `private: true` package.jsons to maintain (rslib-builder
  transforms each on publish)
- Users importing the schemas directly need a different import:
  `from "vitest-agent-reporter-shared"` instead of
  `from "vitest-agent-reporter"`. Documented as a breaking change

### Decision D9: Last Drop-and-Recreate Migration

**Context:** The `0002_comprehensive` schema rewrite adds 15 new tables,
augments `test_errors`/`stack_frames` with new columns, and replaces
`notes_fts` with corrected triggers. Two choices: (a) a single
drop-and-recreate that reinitializes the entire schema, or (b) a
sequence of `CREATE TABLE` / `ALTER TABLE` / `DROP TRIGGER` migrations
that preserve prior data in place.

**Decision:** ship `0002_comprehensive` as a drop-and-recreate.
After this migration, **no future migration is allowed to drop and
recreate**. 2.0.x and beyond are ALTER-only; for any breaking
schema shape that ALTER cannot express, ship a one-shot
export/import path on a major bump rather than dropping data.

**Why drop-and-recreate for `0002`:**

- Prior data was already lost when the DB location changed from
  `node_modules/.vite/.../data.db` to the XDG workspace-keyed path
  (Decision 31, intentionally no-migration). Adding a preserving
  migration would only help a small pre-release audience
- The schema diff is large. Writing per-column ALTER scripts to add
  the new shape (notably the `test_errors.signature_hash` FK requiring
  `failure_signatures` to exist first, the `stack_frames` source-map
  columns, the trigger rewrite for `notes_fts`) is a meaningful amount
  of test code for marginal value
- The drop ordering is paid once: drop children before parents, drop
  FTS triggers before `notes`/`notes_fts` so cascading triggers don't
  fire against an already-dropped virtual table. That code stays in
  `0002_comprehensive` forever; we don't pay it again

**Why ALTER-only forever after:**

- Drop-and-recreate is never a free choice once users have data in
  the schema. Every subsequent drop-and-recreate would be data
  loss for users on whatever the current minor was. Calling out
  "this is the last one" in the design contract makes the
  no-data-loss invariant enforceable in code review
- For migrations that genuinely need a new shape ALTER cannot
  express (e.g., splitting a JSON column into a relational
  subtree), the right escape hatch is the one-shot export/import
  path on a major bump -- not a silent drop. We retain the option
  without defaulting to it

**Trade-offs:**

- Pre-release users with accumulated data lose it. Acceptable given the
  upside of not maintaining a parallel ALTER path
- Future major bumps that need a non-ALTER shape change require an
  export/import script in shared; the cost is deferred until needed
- The drop section in `0002_comprehensive` is a permanent archaeological
  record. This is fine -- migrations are append-only and the drops are
  bounded in size

### Decision D10: Stable Failure Signatures via AST Function Boundary

**Context:** Failures need a stable identity that lets us
deduplicate "the same failure across different test runs," count
recurrences in `failure_signatures.occurrence_count`, and group
failures in agent-facing summaries. The naive identity (full stack
trace + assertion message) churns on every line drift in unrelated
code: any insertion above the failing assertion shifts the line
number and breaks signature continuity. The next-naivest identity
(raw line number) has the same problem, plus assertion literals
(`expect(42)` vs `expect(43)`) churn the signature for trivial
value changes.

**Decision:** the failure signature is a 16-char `sha256` hex
prefix of `(error_name | normalized assertion shape | top
non-framework function name | function-boundary line)`, computed
by `computeFailureSignature` in
`packages/shared/src/utils/failure-signature.ts`. The
function-boundary line comes from `findFunctionBoundary` in
`packages/shared/src/utils/function-boundary.ts`, which parses the
source via `acorn` and walks the AST for the smallest enclosing
function (FunctionDeclaration / FunctionExpression /
ArrowFunctionExpression) whose `loc` range contains the failing
line. The function's *start* line becomes the signature's spatial
coordinate. The assertion shape is normalized via
`normalizeAssertionShape`, which strips matcher arguments to type
tags (`<number>`, `<string>`, `<boolean>`, `<null>`,
`<undefined>`, `<object>`, `<expr>`).

**Why the function boundary (vs raw line):**

- Insertions, deletions, comment edits, formatter changes, and
  unrelated assertions inside the same function don't move the
  function's *start* line as long as the function definition
  itself doesn't move. So the signature stays stable across the
  kinds of edits that happen during normal development
- A new function inserted *before* the failing function does shift
  the boundary line, which is the correct behavior: the failure
  is now structurally located somewhere different in the file
- Tied to the parsed AST, so the boundary survives whitespace-only
  reformatting that would defeat any text-based heuristic

**Why type-tag assertion normalization:**

- `expect(42).toBe(43)` and `expect(7).toBe(8)` should produce the
  same signature -- they're the same failure shape with different
  literals. Normalizing both to `toBe(<number>)` collapses them
- Different *shapes* still produce different signatures:
  `toBe(<number>)` vs `toBe(<string>)` vs `toEqual(<object>)`. We
  collapse value churn while preserving structural intent

**Why a 10-line raw-line fallback bucket:**

When `findFunctionBoundary` returns null (parse error, top-level
code outside any function), the signature falls back to
`raw:<floor(line/10)*10>` -- a 10-line bucket on the raw line. It
loses some stability (a 9-line shift could move the failure
between buckets) but doesn't churn on every single-line edit. When
even the raw line is unknown, falls back to `raw:?`, which means
all such failures collapse to one signature -- intentional, since
we have no better discriminator.

**Why acorn:**

- Zero-deps on the parser side; acorn is `^8.16.0` and well-maintained
- Returns AST nodes with `loc` data when `locations: true` is passed,
  which is exactly the data we need
- Throws cleanly on syntax errors so we can fall through to the bucket
  fallback rather than blowing up the reporter
- Extended with `acorn-typescript` (`^1.4.13`) via
  `Parser.extend(tsPlugin())` so TypeScript sources with type
  annotations, generics, decorators, and `as` casts parse without
  throwing -- `function_boundary_line` is stable for TS projects

**Trade-offs:**

- Runtime dependencies on `acorn ^8.16.0` and
  `acorn-typescript ^1.4.13` in shared. Acceptable -- acorn is the
  canonical zero-deps JS parser and is widely audited
- Re-parsing source on every signature computation is moderately
  expensive (microseconds per parse). The reporter only hashes
  failure signatures, not every assertion, so the cost is bounded
  by the failure count. If this becomes a bottleneck we can cache
  parses by `(file, mtime)` in shared
- The boundary line shifts when the function definition itself
  moves. This is correct behavior, but it does mean a refactor
  that splits a function in half produces new signatures for the
  failures inside it. Considered acceptable -- those failures
  *are* structurally different post-refactor

### Decision D11: TDD Phase-Transition Evidence Binding

**Context:** The TDD orchestrator subagent needs to validate that an
agent's request to transition between TDD phases (e.g. `red → green`) is
backed by real evidence: a recent test failure for `red → green`, a
recent test pass for `green → refactor`, etc. Without binding rules, an
agent could cite *any* failing test from history to claim "the current
behavior is in red," skipping the actual TDD discipline of writing a new
failing test for the goal at hand.

**Decision:** evidence binding is encoded in three rules,
enforced by the pure `validatePhaseTransition` function in
`packages/shared/src/utils/validate-phase-transition.ts`. The
function takes a `PhaseTransitionContext` (current phase,
requested phase, cited artifact, requested behavior) and returns
a discriminated `PhaseTransitionResult` -- either acceptance or a
denial with a typed reason and a remediation hint.

**The three D2 binding rules:**

1. **Evidence in phase window AND session.** The cited test must
   have been authored in the current phase window
   (`test_case_created_turn_at >= phase_started_at`) AND in the
   current session (`test_case_authored_in_session === true`).
   Prevents citing a test written before the phase started or in
   another session
2. **Behavior match.** When the orchestrator requests a transition
   for a specific behavior, the cited artifact's `behavior_id`
   must equal the `requested_behavior_id`. Prevents citing the
   right kind of evidence but for the wrong behavior
3. **Test wasn't already failing.** For `red → green`
   transitions where the cited evidence is a `test_failed_run`,
   the test's `test_first_failure_run_id` must equal the cited
   `test_run_id`. Prevents citing a test that was *already*
   failing on main as proof of "I just put it in red"

Plus the artifact-kind precondition: `red → green` requires
`test_failed_run`, `green → refactor` requires `test_passed_run`,
`refactor → red` requires `test_passed_run` (refactor must end
with all tests still passing). All other transitions are
**evidence-free** and accepted unconditionally — including
`spike → red` (the entry point for every TDD cycle),
`red.triangulate → red`, `green.fake-it → refactor`, and
`extended-red → green`. The `wrong_source_phase` denial is
reserved for future enumerated invalid edges; no transitions
currently raise it.

**Why a pure function (vs Effect service):**

- The function takes a context object and returns a result. No
  I/O, no async. Effect service wrapping would be ceremony for no
  testability gain
- The orchestrator subagent will load the binding context (cited
  artifact details, session info) via `DataReader` Effect calls
  and then pass the resolved context to `validatePhaseTransition`
  as plain data. Keeping the validator pure means it composes
  cleanly into the Effect program without nested service
  requirements

**Why typed denial reasons + remediation:**

- The `DenialReason` discriminator is a closed union the
  orchestrator surfaces back to the agent in structured form, not
  a free-text "evidence rejected" message. The agent can match
  on the reason and recover programmatically
- Each denial carries a `Remediation` with a `suggestedTool`,
  `suggestedArgs`, and `humanHint` so the agent has an obvious
  next step (typically: "run the test via `run_tests` and record
  the artifact"). This converts a deny into a "do this next"
  prompt rather than a dead-end

**Trade-offs:**

- The validator only enforces binding rules; it does not verify
  the cited artifact actually exists, that the session is still
  open, or that the goal is started. Those are pre-validator
  responsibilities of the orchestrator (which already needs the
  artifact details for the context object). Keeps the validator
  small and pure
- Adding a fourth binding rule later is a typed extension to
  `DenialReason` and a new branch in the function -- no schema
  change. Easy to evolve

### Decision D12: Per-Workspace Session Pointer File

**Context:** Claude Code propagates `CLAUDE_PROJECT_DIR`,
`CLAUDE_PLUGIN_ROOT`, and `CLAUDECODE=1` into every subprocess
environment, but it does **not** surface the conversation's
`session_id` as an environment variable. Hooks receive it on stdin
inside the event envelope JSON, so hook scripts can pass
`--cc-session-id` explicitly to the CLI. Agent-invoked CLI calls
(via the Bash tool) have no envelope to read and therefore had no
way to learn their own session id -- meaning the `record turn`,
`record session-end`, `record tdd-artifact`, and `wrapup`
subcommands could only be driven by hooks, never directly by an
agent or user inside an active session.

**Decision:** write a tiny per-workspace pointer file
(`current-session-id`) alongside `data.db` that holds the active
`cc_session_id`. The SessionStart hook sets it; the SessionEnd
hook clears it. CLI subcommands that previously required
`--cc-session-id` now treat the flag as **optional** and fall
back to the pointer when omitted. Hooks continue to pass
`--cc-session-id` explicitly so explicit always beats pointer
(forward compatible -- nothing changes for the hook driver).

**Why a pointer file (vs an env var workaround or DB query):**

- **No env var exists.** `CLAUDECODE=1` tells subprocesses
  *that* they're under Claude Code; nothing tells them *which*
  conversation. There is no upstream knob to flip
- **Workspace-keyed location is already solved.**
  `<dataDir>/data.db` is the deterministic XDG-derived path
  per Decision 31. Putting `current-session-id` next to it
  reuses the same workspace-key resolution and inherits the
  same per-workspace isolation -- no second resolution path,
  no second config knob
- **One-line read at CLI startup.** A `readFileSync` of a tiny
  text file is cheaper than a SQLite query for "the most
  recent session," and it doesn't require a heuristic for
  picking among multiple recent sessions
- **Hook-driven lifecycle is precise.** SessionStart and
  SessionEnd already exist and already know the cc_session_id.
  Writing/clearing the pointer is a one-line shell append in
  each hook -- no separate daemon, no TTL, no clock skew

**Why optional flag + pointer fallback (vs replacing the flag):**

- Hooks have an authoritative envelope; they should keep
  passing the id explicitly. Explicit-beats-pointer means a
  hook firing in a stale session always wins over a stale
  pointer
- Agents and humans don't have an envelope. For them, the
  pointer is the only viable source. Making the flag optional
  and falling back to the pointer is the smallest change that
  unblocks both callers
- The resolver is wrapped in a single Effect helper
  (`resolveCcSessionId({ explicit?, projectDir? })` in the CLI
  package's `lib/`), so every command gets the same
  precedence rule and the same typed "no session id available"
  error message

**Trade-offs:**

- **Multi-window concurrency overwrites silently.** Two
  Claude Code windows open against the same workspace will
  trample each other's pointer. The last SessionStart wins
  until one of them ends. Accepted: the single-window case
  is the dominant one, and hooks are unaffected because they
  always have the envelope. Multi-window users who hit this
  pass `--cc-session-id` explicitly to disambiguate
- **Pointer can outlive its session if SessionEnd doesn't
  fire.** A crashed Claude Code process leaves a stale id.
  Mitigated by `clearSessionPointer` being idempotent
  (`rmSync({ force: true })`) and by `getSessionByCcId`
  returning `Option.none` for an unknown id, so the worst
  case is a clear typed error from the next CLI call rather
  than a silent miswrite
- The pointer is **not** a session lock. It's a best-effort
  hint. Anything that needs strict uniqueness (e.g., the
  `sessions` table itself) continues to use the DB

### Note N6: `FailureSignatureWriteInput` vs `FailureSignatureInput`

**Context:** `DataStore.writeFailureSignature` persists computed failure
signatures. The natural input name is `FailureSignatureInput`, but that
name is already taken by `packages/shared/src/utils/failure-signature.ts`
-- the **compute-time** input to `computeFailureSignature` (the un-hashed
`error_name` / `assertion_message` / `top_frame_*` fields that get hashed
*into* the signature).

**Decision:** call the new persistence-time input
`FailureSignatureWriteInput`. Keep the existing `FailureSignatureInput`
unchanged. Both types live in the shared package; only one is
exported from each module.

**Why this naming over the alternatives:**

- **Renaming the compute-time type** (e.g., to
  `FailureSignatureComputeInput`): invasive and the compute-time input
  is the older, simpler one -- the `Compute` qualifier is implicit, the
  name was fine in isolation. Changing it for namespace neatness is the
  wrong direction
- **Sharing the name** (overload `FailureSignatureInput`): would
  require a single union type covering both shapes, which makes
  every consumer pattern-match between the two cases. The shapes
  have nothing in common -- one is the inputs to a hash, the other
  is the metadata to store alongside the hash. Forced unions
  obscure intent
- **`*WriteInput` qualifier**: matches the existing DataStore input
  convention (`TestRunInput`, `ModuleInput`, `TestCaseInput`,
  `TestErrorInput`, `SessionInput`, `TurnInput`, `StackFrameInput`
  all live in DataStore.ts). The `Write` qualifier is the
  disambiguator since the persistence inputs have a write-side flavor
  the compute-time input doesn't

**Trade-off:** the asymmetry (compute side has no `Compute`
qualifier, write side has `Write`) is mild but real. We accept it
because the two inputs live in different files (`utils/` vs
`services/`), so local readers see only one at a time and the
asymmetry isn't load-bearing in any single context.

### Note N7: spawnSync E2E Test Gap

**Context:** An end-to-end test that builds the CLI bin to disk and spawns
it via `spawnSync` against a clean test database (session-start -> several
turns -> session-end -> DataReader assertions) was scoped and deferred.

**Decision:** skip the spawnSync e2e test. The unit tests for
`parseAndValidateTurnPayload`, `recordTurnEffect`, `recordSessionStart`, and
`recordSessionEnd` exercise the lib functions against an in-memory
SqliteClient. The bin's wiring is thin (`bin.ts` resolves `dbPath`, builds
`CliLive`, and hands the `Command.run` effect to the `@effect/cli` runtime).

**Why acceptable:** The build-and-spawn loop adds the rslib production
build to the critical path of `pnpm test` and brings up a fresh Node
process per test case. The hook scripts -- the CLI's actual real-world
callers -- exercise the bin via the hook driver, which is a more realistic
e2e. The `@effect/cli` command tree breaking silently is the main risk;
manual smoke testing through hook scripts catches command-tree wiring.

### Note N1: tRPC idempotency middleware persist-failure handling

The `hypothesis_record` and `hypothesis_validate` MCP mutation tools are
wrapped by the tRPC idempotency middleware. The middleware **swallows**
persist errors rather than surfacing them as tool errors.

**Why swallow:** The procedure already succeeded. Surfacing a cache-write
failure as a tool error inverts the success/failure signal: the agent sees
"error" and retries, but the underlying write already succeeded, creating a
duplicate. Worst case after a swallowed persist failure: the next call
re-runs `next()` -- mild data hygiene cost (possibly two rows), no
correctness issue. The composite PK on `mcp_idempotent_responses` is
`(procedure_path, key)` with `INSERT ... ON CONFLICT DO NOTHING`, so a
parallel insert race resolves to a no-op regardless.

**Trade-off:** a permanently broken DataStore.write path means the cache
row never lands and every call re-runs `next()`. Acceptable: the
underlying procedure absorbs the cost gracefully.

### Note N2: `tdd_phase_transition_request` is NOT in the idempotency-key registry

The five idempotency-registered mutation tools are `hypothesis_record`,
`hypothesis_validate`, `tdd_session_start`, `tdd_session_end`, and
`decompose_goal_into_behaviors`. `tdd_phase_transition_request` is
intentionally excluded.

**Why excluded:** The accept/deny is a deterministic function of
artifact-log state at the moment of the request. Identical inputs at
different times can legitimately produce different results (e.g., at T0 a
transition is denied because the test was already failing on main; at T1
the agent records a new failing test and the same transition is accepted).
Caching the T0 deny would replay it against the changed state at T1 --
which is wrong.

The validator is itself the source of idempotency: it's a pure function of
database state plus the cited artifact id. If the agent retries an
identical call before any state change, the validator produces the same
answer naturally without caching.

**Why the other three mutations get cached:**

- `tdd_session_start` (key: `${sessionId}:${goal}`) -- opening the same
  session twice is a no-op
- `tdd_session_end` (key: `${tddSessionId}:${outcome}`) -- closing the
  same session twice is a no-op
- `decompose_goal_into_behaviors` (key: `${tddSessionId}:${goal}`) --
  the heuristic is deterministic on the input string

### Note N3: D7 load-bearing constraint -- `tdd_artifact_record` is CLI-only

TDD lifecycle write tools (`tdd_session_start`, `tdd_session_end`,
`tdd_session_resume`, `decompose_goal_into_behaviors`,
`tdd_phase_transition_request`) are accessible to the orchestrator via
the MCP tool surface. Recording an artifact under a phase
(`tdd_artifacts.artifact_kind`) is **deliberately not** an MCP tool. It
is only writable through the `record tdd-artifact` CLI subcommand, driven
by hooks (`post-tool-use-tdd-artifact.sh` and
`post-tool-use-test-quality.sh`).

This is Decision D7: hooks observe what the agent did so the agent never
writes evidence about itself.

**Why load-bearing:** The anti-pattern detection scheme depends on
`tdd_artifacts(kind='test_weakened')` rows being credible. If the agent
could write its own artifacts, it could (or simply forget to) omit them --
and the metric collapses. The evidence-binding validator depends on
artifacts being timestamped at the moment the side effect happened. The
orchestrator's `tools:` array intentionally excludes any artifact-write
tool; the subagent has no Bash tool in scope and there is no MCP wrapper.

### Note N4: `writeTurn` fans out to `tool_invocations` and `file_edits`

`DataStore.writeTurn` wraps its inserts in `sql.withTransaction(...)` and
fans out for two of the seven payload discriminators:

- `file_edit` payloads -> one `file_edits` row per turn. `file_id`
  resolved via `ensureFile(payload.file_path)`; `edit_kind`,
  `lines_added`, `lines_removed`, and `diff` carried verbatim
- `tool_result` payloads -> one `tool_invocations` row per turn.
  `tool_name`, `result_summary`, `duration_ms`, and `success` carried
  verbatim. `params_hash` is intentionally **NULL** pending future
  cross-reference of the matching `tool_call` turn's `tool_input`
- `tool_call`, `user_prompt`, `hypothesis`, `hook_fire`, `note`
  payloads -> `turns` insert only

**Why `tool_invocations` is keyed on `tool_result`:** A tool_call without
a corresponding tool_result is in-flight or failed. Keying on `tool_result`
gives a "completed invocations" projection without joining two turn rows.
Consumers needing strict request/response pairing pair via
`payload.tool_use_id`.

**Why `params_hash` is NULL:** The matching `tool_call` turn was inserted
earlier and is not in scope when `writeTurn` processes the `tool_result`.
Leaving it NULL is preferable to inventing a placeholder.

### Note N5: `failure_signatures.last_seen_at` recurrence tracking

`failure_signatures` carries `first_seen_run_id`, `first_seen_at`,
`occurrence_count`, and `last_seen_at` (nullable).
`writeFailureSignature` sets `last_seen_at = firstSeenAt` on insert and
refreshes it via the `ON CONFLICT(signature_hash) DO UPDATE` clause on
recurrence alongside the `occurrence_count` increment.
`getFailureSignatureByHash` surfaces `lastSeenAt: string | null`.

**Why nullable (no backfill):** Pre-migration rows have no last-sighting
timestamp that can be legitimately assigned. Setting it to NULL is honest
and forces consumers to handle the legacy-data case explicitly. The field
becomes non-null asymptotically as signatures recur after the migration.
A backfill would need to traverse all `test_errors` rows -- more expensive
than the ALTER+index D9 anticipated, and the runtime recovers naturally.

---

## Design Patterns Used

### Pattern: Manifest-First Read

- **Where used:** DataReader (derived manifest view)
- **Why used:** Agents and CLI commands can quickly assess project states
  before fetching detailed data
- **Implementation:** `DataReader.getManifest()` assembles a
  `CacheManifest` on-the-fly from the latest test run per project in the
  `test_runs` table. The manifest is a derived view, not a primary
  on-disk data structure

### Pattern: Range Compression

- **Where used:** Coverage output (both console and JSON)
- **Why used:** Compact representation of uncovered lines for LLM
  consumption
- **Implementation:** `compressLines()` converts `[1,2,3,5,10,11,12]` to
  `"1-3,5,10-12"`

### Pattern: Project-Keyed Accumulation

- **Where used:** `AgentReporter.onTestRunEnd` result collection
- **Why used:** Group test results by `TestProject.name` during the run,
  then emit per-project outputs
- **Implementation:** `Map<string, VitestTestModule[]>` keyed by
  `testModule.project.name`, then `splitProject()` for database storage

### Pattern: Duck-Typed External APIs

- **Where used:** Istanbul CoverageMap, Vitest TestModule/TestCase
- **Why used:** Avoid hard dependencies on external types that may change
- **Implementation:** Structural interfaces checked at runtime via type
  guards; formatters use duck-typed Vitest interfaces

### Pattern: Effect Service / Layer Separation

- **Where used:** All Effect services
- **Why used:** Clean separation between service interface (Context.Tag)
  and implementation (Layer). Enables swapping live I/O for test mocks
- **Implementation:** Service tags in `packages/shared/src/services/`
  (plus `packages/reporter/src/services/CoverageAnalyzer.ts`), live and
  test layers in `packages/shared/src/layers/` (plus the
  reporter-specific `CoverageAnalyzerLive`), merged composition layers
  (`ReporterLive`, `CliLive`, `McpLive`, `OutputPipelineLive`)

### Pattern: Scoped Effect.runPromise

- **Where used:** AgentReporter lifecycle hooks, AgentPlugin configureVitest
- **Why used:** Bridge between imperative Vitest class API and Effect
  service architecture without ManagedRuntime lifecycle concerns
- **Implementation:** Each hook builds a self-contained effect, provides
  the layer inline, and runs via `Effect.runPromise`

### Pattern: ManagedRuntime for Long-Lived Processes

- **Where used:** MCP server
- **Why used:** The MCP server is a long-running stdio process where
  per-call layer construction would be wasteful
- **Implementation:** `ManagedRuntime.make(McpLive(dbPath))` creates a
  shared runtime. tRPC context carries the runtime so procedures call
  `ctx.runtime.runPromise(effect)`. Database connection is held for the
  process lifetime

### Pattern: Hash-Based Change Detection

- **Where used:** Coverage trend tracking (target change detection)
- **Why used:** Detect when coverage targets have changed between runs,
  invalidating historical trend data
- **Implementation:** `hashTargets()` serializes `ResolvedThresholds` to
  JSON string, stored as `targetsHash` on each trend entry. When the
  hash differs, trend history is reset

### Pattern: Pipeline Architecture

- **Where used:** Output pipeline
- **Why used:** Each stage of output determination has a single
  responsibility and is independently testable
- **Implementation:** Five chained services: detect -> resolve executor ->
  select format -> resolve detail -> render. Explicit overrides can
  short-circuit automatic selection at any stage

---

## Constraints and Trade-offs

### Constraint: Vitest >= 4.1.0

- **Description:** Requires the Vitest 4 Reporter API with `TestProject`,
  `TestModule`, and `TestCase`
- **Impact:** Limits adoption to Vitest 4.1+
- **Mitigation:** Vitest 4.1+ is current stable; peer dep is explicit

### Trade-off: `onCoverage` Ordering

- **What we gained:** Clean integration with coverage data
- **What we sacrificed:** Must stash coverage as instance state (fires
  before `onTestRunEnd`)
- **Why it's worth it:** Simple pattern; coverage and results merge in
  one output pass

### Trade-off: Per-Call Layer Construction (Reporter)

- **What we gained:** No ManagedRuntime lifecycle concerns, no resource
  leaks, no disposal needed
- **What we sacrificed:** Layer constructed on each `onTestRunEnd` call
- **Why it's acceptable:** The layer is lightweight. Construction cost is
  negligible compared to test run duration. SQLite connections are fast
  to establish

### Trade-off: Convention-Based Source Mapping

- **What we gained:** Simple, predictable file-to-test mapping for scoped
  coverage
- **What we sacrificed:** Cannot detect tests that cover source files
  with non-matching names
- **Why it's acceptable:** Convention covers the vast majority of cases.
  Import analysis remains a potential future enhancement. The
  `source_test_map` table supports multiple mapping types for future
  expansion

### Trade-off: Zod for tRPC

- **What we gained:** tRPC integration with type-safe procedures and
  testable caller factory
- **What we sacrificed:** Added Zod as a runtime dependency alongside
  Effect Schema
- **Why it's acceptable:** Zod is scoped to MCP tool input schemas only.
  Effect Schema remains the source of truth for all domain data structures.
  tRPC requires Zod for input validation; there is no Effect Schema adapter
  for tRPC procedures

### Trade-off: SQLite Binary Format

- **What we gained:** ACID transactions, concurrent reads, efficient
  queries, relational integrity, FTS5, migration-based schema evolution
- **What we sacrificed:** Human-readable cache files (JSON)
- **Why it's acceptable:** The CLI and MCP tools provide all the access
  patterns agents need. Humans who need to inspect data can use
  `sqlite3` CLI or the `doctor` command. The benefits of relational
  storage far outweigh readability concerns
