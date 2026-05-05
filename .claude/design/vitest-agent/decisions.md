---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-05-05
last-synced: 2026-05-05
completeness: 100
related:
  - ./architecture.md
  - ./components.md
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
`packages/sdk/src/schemas/` directory. TypeScript types derived via
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
3. `vite.cacheDir + "/vitest-agent"` (default, typically
   `node_modules/.vite/.../vitest-agent/`)

CLI and MCP cache dir resolution check common locations. The database
file is `data.db` within the resolved cache directory.

When using `AgentReporter` standalone (without the plugin), the default is
`.vitest-agent` in the project root.

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
(`packages/sdk/src/formatters/markdown.ts`) and controlled by the
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
`packages/sdk/src/utils/ensure-migrated.ts` exports `ensureMigrated(dbPath,
logLevel?, logFile?)`. The promise cache lives at
`Symbol.for("vitest-agent/migration-promises")` on
`globalThis`. `AgentReporter.onTestRunEnd` awaits `ensureMigrated`
before the main `Effect.runPromise`; on rejection, it prints
`formatFatalError(err)` to stderr and returns. The function is also
referenced from a new test file with a `_resetMigrationCacheForTesting`
internal helper.

### Decision 29: Plugin MCP Server Loader (RETIRED)

> Retired. Superseded by Decision 30 (PM-detect + spawn loader). The
> previous `file://` dynamic-import + `node_modules` walk is gone --
> `vitest-agent-mcp` is now its own package with its own bin,
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
3. Spawn `<pm-exec> vitest-agent-mcp` with `stdio:
   "inherit"`, `cwd: projectDir`, and `env: { ...process.env,
   VITEST_AGENT_PROJECT_DIR: projectDir }`. The PM commands
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

**`VITEST_AGENT_PROJECT_DIR` env passthrough:** the spawned
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

`$XDG_DATA_HOME/vitest-agent/<workspaceKey>/data.db`

where `<workspaceKey>` is the root `package.json` `name` normalized
via `normalizeWorkspaceKey` (`@org/pkg` -> `@org__pkg`). On systems
without `XDG_DATA_HOME` it falls back to
`~/.local/share/vitest-agent/<workspaceKey>/data.db` per
`xdg-effect`'s `AppDirs` semantics. An optional
`vitest-agent.config.toml` lets users override the
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
- **Human-readable:** `ls ~/.local/share/vitest-agent/`
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

> **Updated by Decision 34.** Decision 33 captured the original four-
> package split (shared / reporter / cli / mcp). Decision 34 further
> splits the reporter package into `vitest-agent` (plugin +
> lifecycle) and `vitest-agent-reporter` (named reporter factories
> only) for a five-package layout. The rationale below remains the
> canonical "why three runtimes share one shared package" reference.

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

**Decision:** split the monolith into five pnpm workspaces under
`packages/`:

| Package | Role |
| --- | --- |
| `vitest-agent-sdk` | data layer, schemas, services, formatters, utilities, XDG path stack -- no internal deps |
| `vitest-agent-plugin` | `AgentPlugin`, `AgentReporter`, `ReporterLive`, `CoverageAnalyzer`; declares reporter, cli + mcp as required peer deps |
| `vitest-agent-reporter` | named `VitestAgentReporterFactory` implementations only (no Vitest-API code) |
| `vitest-agent-cli` | `vitest-agent` bin |
| `vitest-agent-mcp` | `vitest-agent-mcp` bin |

All five release in lockstep via changesets `linked` config. The
plugin declares the reporter, CLI, and MCP packages as **required**
`peerDependencies` so installing the plugin still pulls the agent
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

The name `vitest-agent-sdk` reflects the actual role:
anything depended on by more than one runtime package. The package owns
not only schemas but also services, layers, formatters, utilities,
errors, migrations, and the entire XDG path stack.

**Trade-offs:**

- Lockstep releases require all five `package.json` files to bump in
  sync. Changesets `linked` config handles this, but it's a process
  rule the team has to follow
- Four new `private: true` package.jsons to maintain (rslib-builder
  transforms each on publish)
- Users importing the schemas directly need a different import:
  `from "vitest-agent-sdk"` instead of
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

**2.0 follow-up — modified `0002` in place rather than adding `0006`:**
the goal/behavior hierarchy redesign (Decision D12) edits
`0002_comprehensive` directly: adds `tdd_session_goals` and
`tdd_behavior_dependencies`, reshapes `tdd_session_behaviors`,
changes the `tdd_phases.behavior_id` cascade (Decision D15), and
adds `tdd_artifacts.behavior_id` (Note N9). The migration ledger has
no content hash, so `SqliteMigrator` does not auto-replay the edited
migration on existing DBs — pre-2.0 dev databases must be wiped on
first pull. This is a documented break, acceptable because the 2.0
XDG path differs from 1.x and v2.0 has no production users yet. The
"ALTER-only forever after" invariant still holds for *future*
migrations; D9 is a constraint on what comes after the last
drop-and-recreate, and 0002 *is* the last drop-and-recreate. The
2.0 changeset (`tdd-goal-behavior-hierarchy.md`) carries the
explicit "wipe `$XDG_DATA_HOME/vitest-agent/<key>/data.db` on first
pull" instruction.

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
`packages/sdk/src/utils/failure-signature.ts`. The
function-boundary line comes from `findFunctionBoundary` in
`packages/sdk/src/utils/function-boundary.ts`, which parses the
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
`packages/sdk/src/utils/validate-phase-transition.ts`. The
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
with all tests still passing).

**Source-phase guard for `green`:** `validatePhaseTransition` also
enforces that `green` may only be entered from `red`,
`red.triangulate`, or `green.fake-it`. Requesting `green` from any
other phase (e.g. `spike → green`, `refactor → green`,
`extended-red → green`) returns `{ accepted: false, denialReason:
"wrong_source_phase" }` with a remediation pointing at the missing
`→ red` step. The rationale: skipping the named red phase entirely
would leave the `tdd_phases` table without a `phase="red"` row,
breaking the phase-evidence integrity metric and the D2
binding-rule model.

All remaining transitions are **evidence-free** and accepted
unconditionally — including `spike → red` (the entry point for
every TDD cycle), `red.triangulate → red`,
`green.fake-it → refactor`, and `refactor → red`. Transitions that
are neither evidence-bearing nor source-phase-guarded return
`{ accepted: true }` immediately.

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

### Note N6: `FailureSignatureWriteInput` vs `FailureSignatureInput`

**Context:** `DataStore.writeFailureSignature` persists computed failure
signatures. The natural input name is `FailureSignatureInput`, but that
name is already taken by `packages/sdk/src/utils/failure-signature.ts`
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

The six idempotency-registered mutation tools (2.0 update) are
`hypothesis_record`, `hypothesis_validate`, `tdd_session_start`,
`tdd_session_end`, `tdd_goal_create`, and `tdd_behavior_create`.
`decompose_goal_into_behaviors` was **removed** from the registry in
2.0 alongside the tool itself (see Decision D12).
`tdd_phase_transition_request` and every `*_update` / `*_delete` /
`*_get` / `*_list` are intentionally excluded.

**Why `tdd_phase_transition_request` is excluded:** The accept/deny
is a deterministic function of artifact-log state at the moment of
the request. Identical inputs at different times can legitimately
produce different results (e.g., at T0 a transition is denied
because the test was already failing on main; at T1 the agent
records a new failing test and the same transition is accepted).
Caching the T0 deny would replay it against the changed state at
T1 -- which is wrong.

The validator is itself the source of idempotency: it's a pure function of
database state plus the cited artifact id. If the agent retries an
identical call before any state change, the validator produces the same
answer naturally without caching.

**Why `*_update` / `*_delete` / `*_get` / `*_list` are excluded:**
state-dependent reads (`*_get` / `*_list`) and intentional state
transitions (`*_update`) cannot be cached without inverting the
caller's expectation. Destructive ops (`*_delete`) are guarded at
the hook + permission-prompt layer (Decision D13), not via cache
replay.

**Why the registered mutations get cached:**

- `tdd_session_start` (key: `${sessionId}:${goal}`) -- opening the same
  session twice is a no-op
- `tdd_session_end` (key: `${tddSessionId}:${outcome}`) -- closing the
  same session twice is a no-op
- `tdd_goal_create` (key: `${sessionId}:${goal}`) — creating the same
  goal under the same session twice is a no-op (returns the existing
  row)
- `tdd_behavior_create` (key: `${goalId}:${behavior}`) — same shape,
  scoped per-goal so identical behavior text under different goals
  creates separate rows

### Note N3: D7 load-bearing constraint -- `tdd_artifact_record` is CLI-only

TDD lifecycle write tools (`tdd_session_start`, `tdd_session_end`,
`tdd_session_resume`, `tdd_phase_transition_request`, plus the 8
non-destructive `tdd_goal_*` / `tdd_behavior_*` CRUD tools added in
2.0) are accessible to the orchestrator via the MCP tool surface.
Recording an artifact under a phase (`tdd_artifacts.artifact_kind`)
is **deliberately not** an MCP tool. It is only writable through the
`record tdd-artifact` CLI subcommand, driven by hooks
(`post-tool-use-tdd-artifact.sh` and
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

**Related precedent (Decision D13):** `tdd_goal_delete` and
`tdd_behavior_delete` follow a similar but distinct pattern. The
delete tools **do exist** on the MCP surface (the main agent needs
them for cleanup of mistakes under explicit user confirmation), but
they are denied to the orchestrator at the hook layer
(`pre-tool-use-tdd-restricted.sh`) and intentionally omitted from
the auto-allow list. Where D7 keeps `tdd_artifact_record` *entirely
off* the MCP surface, D13 has the tool exist but be *gated by
identity*. Both patterns are about preventing the agent from writing
data the wider system will later treat as authoritative.

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

### Decision 34: Plugin/Reporter Split (vitest-agent + vitest-agent-reporter)

**Context:** Decision 33 split the 1.x monolith into four packages
(`vitest-agent-sdk`, `vitest-agent-reporter`, `vitest-agent-cli`,
`vitest-agent-mcp`), with `vitest-agent-reporter` owning both the
plugin (`AgentPlugin`) and the Vitest-API reporter class
(`AgentReporter`). That worked, but `vitest-agent-reporter` ended up
fused: a Vitest-lifecycle handler (constructed and called by Vitest
itself) plus an opinionated rendering pipeline plus
`OutputRenderer.render` invocation plus a dedicated GFM write path
plus istanbul-aware coverage analysis. The package conflated two
concerns: "drive Vitest" and "decide what output goes where".

The 2.0 dogfood surfaced three concrete problems:

1. **Custom rendering required forking the reporter.** Users who
   wanted a different output strategy (SARIF, JUnit, JSON+stdout
   combined, etc.) had to subclass `AgentReporter` or fork the whole
   reporter package, because there was no contract surface to plug
   in
2. **The default's GFM behavior was hardcoded.** Under GitHub Actions
   the reporter unconditionally appended GFM to
   `GITHUB_STEP_SUMMARY` via a `shouldWriteGfm` block. Suppressing
   it required passing `githubActions: false`, which also disabled
   useful auto-detection. There was no clean way to say "use a
   different GitHub Actions output strategy"
3. **Naming collision with the npm package family.** `AgentReporter`
   is the Vitest-API class; "a reporter" in the user's vocabulary is
   the *thing they configure to control output*. The two senses
   shared one name and one package, so docs had to constantly
   disambiguate

**Decision:** split `vitest-agent-reporter` into two packages and
introduce a public reporter contract:

- **`vitest-agent-plugin`** (`packages/plugin/`) -- owns the Vitest plugin,
  the internal `AgentReporter` Vitest-API class (now a private
  implementation detail), `CoverageAnalyzer`, `ReporterLive`, and
  the reporter-side utilities. Constructs a `ReporterKit`, calls the
  user-supplied factory, concatenates `RenderedOutput[]`, routes by
  target.
- **`vitest-agent-reporter`** (`packages/reporter/`) -- contains
  named `VitestAgentReporterFactory` implementations only:
  `defaultReporter` (env-aware composition), `markdownReporter`,
  `terminalReporter`, `jsonReporter`, `silentReporter`,
  `ciAnnotationsReporter`, `githubSummaryReporter`. Plus a private
  `_kit-context.ts` helper.
- **Contract types in `vitest-agent-sdk`**
  (`packages/sdk/src/contracts/reporter.ts`):
  `ResolvedReporterConfig`, `ReporterKit`, `ReporterRenderInput`,
  `VitestAgentReporter` (a single sync `render(input)` method
  returning `RenderedOutput[]`), and `VitestAgentReporterFactory`
  (returns one reporter or an array).

`vitest-agent-plugin` declares `vitest-agent-reporter`, the CLI, and the
MCP packages as required `peerDependencies`. The five packages
release in lockstep.

**(a) Why split now:** the cost of the fused reporter compounded as
soon as we tried to support a second output strategy. Doing the
split as part of 2.0 is the cheapest moment -- the package surface
is already breaking (Decision 31, the XDG path move; Decision 33,
the four-package split), and the install ergonomics stay the same
because `vitest-agent-plugin` requires `vitest-agent-reporter` as a peer.

**(b) Why "reporter as renderer-only" beats "reporter as
Vitest-lifecycle handler":** the Vitest Reporter API is a low-level
surface (lifecycle hooks called by the test runner) that needs
careful integration with persistence, classification, baselines, and
trend computation. That work is non-negotiable -- every consumer
needs it. The *output* decisions on top, by contrast, are highly
opinionated and per-consumer. Pulling rendering into a small
synchronous contract means:

- Custom reporters are one factory function, not a Vitest Reporter
  subclass with lifecycle hooks to maintain
- The reporter contract has no Effect requirements, no lifecycle
  semantics, no I/O -- just `(input) => RenderedOutput[]`. A "no-op"
  reporter is one line: `() => ({ render: () => [] })`
- The plugin owns the Vitest version peer dep. Reporters don't need
  to think about Vitest version ranges
- Persistence runs exactly once per run regardless of how many
  reporters the factory returns -- it's locked into the plugin

**(c) Why the factory returns
`VitestAgentReporter | ReadonlyArray<VitestAgentReporter>`:** Vitest's
own multi-reporter pattern (`reporters: ['default',
'github-actions']`) is the obvious shape for "multiple outputs from
one run". Modelling it directly means `defaultReporter` can return
`[primary, githubSummaryReporter]` under GitHub Actions without
needing a separate "composite reporter" abstraction. Each reporter
in the array sees the same `ReporterKit` and the same
`ReporterRenderInput`; their `RenderedOutput[]` results are
concatenated in factory-declaration order before routing. Users
authoring single-purpose reporters return a bare reporter; users
composing multiple return an array. No ceremony either way.

**(d) Why the default reporter lives in `vitest-agent-reporter` (not
in `vitest-agent`):**

- The plugin owns the Vitest lifecycle and the contract glue. Those
  things rarely change
- The *opinions* about what output goes where (markdown to stdout +
  GFM to step summary by default; GitHub Actions detection logic;
  format selection from `kit.config.format`) change more often, and
  should be forkable without touching the plugin
- Putting `defaultReporter` in `vitest-agent-reporter` makes "fork
  the default" mean "fork the reporter package" -- one boundary,
  not two. Users who want a different default just publish their
  own factory and pass it as `reporterFactory`
- It also keeps the plugin's required-peer set honest: `vitest-agent`
  needs `vitest-agent-reporter` because that's where its default
  comes from. The dependency arrow points the right way

**(e) Why standalone `AgentReporter` usage is intentionally broken
in 2.0:** 1.x users could
`import { AgentReporter } from "vitest-agent-reporter"` and place
the class directly in `vitest.config.reporters` without the plugin.
After the split:

- `vitest-agent-reporter` no longer exports a Vitest-API class.
  Standalone usage is impossible by construction
- `AgentReporter` is now an internal class in `vitest-agent`,
  constructed by `AgentPlugin`. Exposing it would re-fuse the two
  packages
- The plugin path was already the recommended setup in 1.x; the
  standalone path was a niche escape hatch. We accept the breakage
  and document it as a 2.0 migration step: replace the standalone
  reporter with `agentPlugin()`

The Claude Code plugin manifest at
`plugin/.claude-plugin/plugin.json` is unchanged -- the Claude Code
plugin identity stays `vitest-agent-reporter` because that's a
separate identity from the npm packages. Hook scripts continue to
call the CLI bin `vitest-agent` (the bin name changed in 2.0;
only the npm package owning the bin changed in Decision 33's rename
pass).

**Trade-offs:**

- Adds a fifth pnpm workspace and another lockstep release. The
  changesets `linked` config already coordinates the four 2.0
  packages; adding a fifth is a one-line config change
- Required peer chain is longer (`vitest-agent` -> reporter + cli +
  mcp). Lockfile resolution is slightly noisier on first install,
  but the ergonomics for the user remain "install `vitest-agent`,
  get the whole story"
- Custom reporters built against the contract must be kept in sync
  with future contract additions. The contract is intentionally
  small (5 types) and the open shape of `ReporterKit` (named-field
  object) means additions are non-breaking by construction
- The naming asymmetry between the constructor option fields
  (`AgentReporterConstructorOptions.reporter`,
  `AgentPluginConstructorOptions.reporterFactory`) is mild but
  real. The plugin has `reporterFactory` because
  `AgentPluginOptions.reporter` is already a config bag in 1.x.
  A future cleanup may flatten that bag and free the name; deferred
  to avoid a second breaking change in 2.0

This decision is the successor to Decision 33 (the four-package
split). Decision 33 established that "what does more than one
runtime package need" defines the shared boundary; Decision 34
applies the same logic one level finer to the reporter package
itself, separating the lifecycle handler from the opinionated
rendering implementations.

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

### Decision D12: Three-Tier Objective→Goal→Behavior Hierarchy

**Context:** The 1.x TDD orchestrator decomposed a session goal into
behaviors via the `decompose_goal_into_behaviors` MCP tool, which
ran a server-side `splitGoal()` regex over `\s+and\s+` and `;\s+`.
Compound goals expressed any other way produced a **single DB row**
that the orchestrator then imagined as multiple behaviors —
fabricating sub-behaviors that all reused the one real DB id.
`behaviors_ready` channel events carried duplicate ids, the main
agent's task list rendered duplicates, and the binding-rule validator
saw a `behavior_id` that did not match the orchestrator's mental model.
Plus seven additional gaps surfaced during the round-1 dogfood:
`status` column never written after insert, no read path for behavior
rows, no append-single-behavior path, `child_tdd_session_id` dead
code, `behaviorId` on `tdd_phase_transition_request` only validated
by the FK, `TddSessionDetail` missing behaviors, behavior ids
ephemeral.

**Decision:** introduce a three-tier hierarchy with first-class
storage and CRUD for goals and behaviors:

```text
Objective  (tdd_sessions.goal)
  └── Goal 1  (tdd_session_goals — new table)
        ├── Behavior 1.1  (tdd_session_behaviors — reshaped)
        └── Behavior 1.2
  └── Goal 2
        └── Behavior 2.1
```

Each tier has its own row-level identity, status lifecycle (closed:
`pending → in_progress → done|abandoned`), and CRUD surface. The
orchestrator decomposes via LLM reasoning and creates each entity
individually through `tdd_goal_create` / `tdd_behavior_create`. The
server stores what it's told and validates referential integrity
through tagged errors at the DataStore boundary; it does not
linguistically interpret goal text.

**Why server-side splitting is gone:**

- The root cause was a regex that produced one DB row when the
  orchestrator imagined two behaviors. No regex extension can
  capture all the ways an LLM can phrase a compound goal; the right
  abstraction layer for "what counts as one behavior" is the LLM
  itself, not a string-splitter
- LLM-driven decomposition has full access to context (goal text,
  acceptance criteria, codebase patterns) the server does not
- The server retains hard guarantees through schema constraints
  (FKs, CHECK on status, junction-table validation): the LLM cannot
  invent behavior ids, cannot create a behavior under a closed
  goal, cannot depend on a behavior in a different goal

**Why goals are first-class storage rather than text in
`tdd_sessions.goal`:**

- Goals are addressable in their own right: status transitions,
  ordinal allocation, dependency junction-table reference, channel
  events keyed on goal id, phase-transition pre-checks ("is the
  cited behavior's parent goal `in_progress`?")
- The `(session_id, id)` covering index on goals supports cheap
  behavior→goal→session join paths so we don't denormalize
  `session_id` onto behaviors
- Goal-level lifecycle events (`goal_started`, `goal_completed`
  with `behaviorIds[]` for reconciliation, `goal_abandoned`) need
  a stable id to address; storing them as session metadata would
  collide on duplicate goal text

**Why `dependsOnBehaviorIds` is a junction table not JSON-in-TEXT:**
see Decision D14 below.

**Trade-offs:**

- The migration is a hard break: `0002_comprehensive` modified in
  place rather than added as `0006`. Acceptable because the 2.0
  XDG path differs from 1.x and v2.0 has no production users yet.
  See Decision D9
- Two more tables (`tdd_session_goals`, `tdd_behavior_dependencies`)
  bring the schema to 43 tables total. Index footprint is minimal
  (covering index on goals, single composite-PK + reverse-lookup on
  the junction)
- The state machine remains per-behavior (8 phases). Goal-level
  iteration is workflow code in the orchestrator, not a state in
  `tdd_phases`. This keeps `tdd_phases` from doubling its CHECK
  enum

### Decision D13: MCP Permits, Agent Restricts (Capability vs Scoping)

**Context:** The orchestrator subagent should not delete goals or
behaviors — `abandoned` status preserves evidence; hard delete is
reserved for cleanup of mistakes by the main agent under explicit
user confirmation. But the MCP tool surface needs to expose
`tdd_goal_delete` and `tdd_behavior_delete` so the main agent has
a CRUD-complete API.

**Decision:** capability lives on the MCP surface (the 10 CRUD
tools always exist); scoping lives at the agent + hook layer:

1. The orchestrator's `tools[]` frontmatter array enumerates only
   the 8 non-destructive goal/behavior tools — `tdd_goal_delete`
   and `tdd_behavior_delete` are absent (documentation, not
   enforcement)
2. `pre-tool-use-tdd-restricted.sh` is a `PreToolUse` hook scoped
   to the orchestrator subagent (via `lib/match-tdd-agent.sh`)
   that returns `permissionDecision: "deny"` with a remediation
   hint pointing at `status: 'abandoned'` if the orchestrator
   tries to call either delete tool. **This is the runtime gate.**
   It also reaffirms denial of `tdd_artifact_record` (never an MCP
   tool per Decision D7) for defense-in-depth
3. The main-agent allowlist (`safe-mcp-vitest-agent-ops.txt`)
   intentionally **omits** the two delete tools. Main-agent calls
   to deletes fall through to Claude Code's standard permission
   prompt, so the user sees a confirmation dialog before any
   cascade

**Why this split (vs adding the deletes as restricted tools on the
MCP server itself):**

- The MCP server has no agent-identity. It can't tell "main agent"
  from "orchestrator subagent"; it sees stdio bytes. Identity
  lives one layer up, in the Claude Code hook envelope's
  `agent_type` field
- Putting agent-scoping in the server would require shipping
  agent-aware authentication into a tool-routing layer, which is
  more surface than the problem warrants
- Hooks are already the place where agent identity is enforced
  (`subagent-start-tdd.sh`, `pre-tool-use-bash-tdd.sh`,
  `post-tool-use-tdd-artifact.sh` all gate via
  `lib/match-tdd-agent.sh`). Adding one more
  `pre-tool-use-tdd-restricted.sh` extends the established
  pattern

**Why two layers of denial (tools[] + hook):**

- `tools[]` is the documentation surface — it's how the
  orchestrator system prompt knows what's available. Removing
  delete tools from `tools[]` keeps the iron-law system prompt
  honest
- The hook is the runtime gate. If a future Claude Code update
  starts ignoring `tools[]`, or if a misconfigured override
  enables more tools, the hook still denies. Defense-in-depth

**Relationship to Decision D7:** D7 keeps `tdd_artifact_record`
*entirely off* the MCP surface — hooks observe what the agent did,
the agent never writes evidence about itself. D13 is a related
but distinct pattern: the delete tools **exist** on the MCP
surface (for the main agent under user confirmation) but are
denied to the orchestrator at the hook layer. The two patterns
together describe the full "MCP permits, agent restricts" doctrine.

**Trade-offs:**

- A misconfigured orchestrator (e.g., a fork that adds delete
  tools back to `tools[]` and disables the hook) could call
  deletes. Acceptable because both gates would have to fail
  simultaneously
- The hook's `permissionDecisionReason` text is the only place
  the orchestrator sees *why* a delete was denied. Worth keeping
  it explicit and pointing at `status: 'abandoned'` so the
  remediation is obvious

### Decision D14: Junction Table for Behavior Dependencies

**Context:** Behaviors can depend on each other ("B1.2 depends on
B1.1's test fixture"). The 1.x schema stored these as a
JSON-in-TEXT array in `tdd_session_behaviors.depends_on_behavior_ids`.
This made queries painful (no FK enforcement, no recursive walks
without parsing JSON in SQL), and let the orchestrator write ids
that no longer existed.

**Decision:** dependencies live in a dedicated `tdd_behavior_dependencies`
junction table with composite PK `(behavior_id, depends_on_id)` and
`ON DELETE CASCADE` on both endpoints. A `CHECK (behavior_id !=
depends_on_id)` prevents self-dependencies. A reverse-lookup index
on `depends_on_id` enables "what depends on X" queries.

**Why a junction table over JSON-in-TEXT:**

- **FK enforcement.** Both endpoints reference
  `tdd_session_behaviors(id)`. The DB rejects orphan ids the
  orchestrator might supply by mistake, surfacing as
  `BehaviorNotFoundError` at the DataStore boundary instead of a
  silent "id 99 doesn't exist anymore" data-integrity bug
- **Recursive CTE walks.** Common-table-expression queries can
  traverse the dependency graph (forward or backward via the
  reverse-lookup index) without parsing JSON in SQL — that's a
  feature SQLite's JSON functions support but at significant
  performance and clarity cost
- **CASCADE semantics.** Deleting a behavior cleanly removes both
  sides of every dependency edge it participates in. With JSON,
  deleting a behavior would orphan ids in other behaviors' arrays
  with no FK to flag the inconsistency
- **Same-goal validation.** `createBehavior` validates that every
  `dependsOnBehaviorIds` entry resolves to a behavior under the
  *same* goal (else `BehaviorNotFoundError`) — a relational query
  with the junction table; messier with JSON

**Why CHECK on `behavior_id != depends_on_id`:**

- Self-dependencies are always logically wrong (a behavior
  blocking itself can never resolve)
- Cheaper to enforce in DDL than to discover later in the
  recursive walker

**Trade-offs:**

- One more table in the schema. Trivial cost; the junction has
  no row-level state beyond the FKs
- Updates to dependencies replace the entire set in one
  transaction (`updateBehavior` deletes old rows, inserts new).
  Slightly more SQL than overwriting a JSON column, but bundled
  in `sql.withTransaction` so it's atomic

### Decision D15: `tdd_phases.behavior_id` Cascade Change (SET NULL → CASCADE)

**Context:** In 1.x, deleting a behavior left `tdd_phases` rows
with `behavior_id = NULL` (`ON DELETE SET NULL`). This was a
holdover from the old "behaviors are loosely related to phases"
shape. After the 2.0 hierarchy redesign — where every phase row
under an active session is bound to a specific behavior — the
SET NULL semantics produce ledger orphans: phases nobody can
attribute, evidence with no owner.

**Decision:** change `tdd_phases.behavior_id` FK action to
`ON DELETE CASCADE`. Deleting a behavior erases its entire phase
ledger and (transitively, via `tdd_artifacts.behavior_id` also
`ON DELETE CASCADE`) its evidence. The delete-vs-abandon
distinction becomes:

- **Delete = "this never existed."** Used to clean up duplicates
  the orchestrator created by mistake. Removes all evidence —
  there is nothing to attribute
- **Abandon (status = `abandoned`) = "we tried but didn't
  finish, preserve evidence."** This is the orchestrator's only
  way to drop work. Keeps the phase ledger and artifacts
  available for downstream metrics (`acceptance_metrics`),
  failure-signature recurrence tracking, and post-hoc analysis

**Why CASCADE over SET NULL:**

- `tdd_phases` rows without a `behavior_id` cannot be reasoned
  about by the binding-rule validator, the channel-event
  renderer, or the metrics computation. Keeping the rows around
  with NULL `behavior_id` is data leak, not preservation
- The orchestrator is denied delete tools by
  `pre-tool-use-tdd-restricted.sh` (Decision D13), so cascade
  delete only happens via main-agent calls under explicit user
  confirmation. The user has consented to the cascade
- Abandon-via-status preserves the rows when preservation is
  semantically appropriate. "We have two ways to drop work" is
  the right factoring; "we have one way that always preserves
  rows" was over-conservative

**Why this is a deliberate decision and not a routine schema
change:** the cascade direction matters for the entire mental
model of how the TDD ledger relates to the goal/behavior tree.
Documented here so it's hard to miss in code review.

### Note N8: Single-statement ordinal allocation

**Context:** Goals and behaviors carry `ordinal` columns that need
to be monotonically increasing under their parent (session for
goals, goal for behaviors). Concurrent inserts under the same
parent must not collide on `UNIQUE (parent_id, ordinal)`.

**Decision:** allocate ordinals in a single SQL statement:

```sql
INSERT INTO tdd_session_goals (session_id, ordinal, goal)
SELECT ?, COALESCE(MAX(ordinal), -1) + 1, ?
FROM tdd_session_goals
WHERE session_id = ?
RETURNING id, session_id, ordinal, goal, status, created_at;
```

The same pattern is used for behaviors with `goal_id`. The
single statement holds its lock for the duration of the
read-and-insert, so two concurrent inserters serialize on the
unique constraint without needing `BEGIN IMMEDIATE` or
application-level retry.

**Why not `BEGIN IMMEDIATE` + read-then-insert:** that would work
but adds a round-trip. The single-statement form is simpler and
the lock window is shorter.

**Why ordinals start at 0 (not 1):** internal artifact;
applications use them only for ordering. Starting at 0 keeps
`COALESCE(MAX(ordinal), -1) + 1` symmetric (the empty-table case
yields 0). Channel events and the orchestrator's `[G<n>.B<m>]`
labels are 1-based for human readability — that's a
presentation-layer concern, not the DB's.

### Note N9: `tdd_artifacts.behavior_id` for behavior-scoped queries

**Context:** Pre-2.0, behavior-scoped artifact queries had to
join `tdd_artifacts → tdd_phases → behavior_id`. This was
tolerable but made every "what tests/code did we write for
behavior X" query a two-hop join.

**Decision:** add `behavior_id INTEGER REFERENCES
tdd_session_behaviors(id) ON DELETE CASCADE` to `tdd_artifacts`
plus `idx_tdd_artifacts_behavior` on it. This denormalizes the
behavior reference one level so behavior-scoped queries are
single-hop.

**Why now:** D9 makes ALTER on `tdd_artifacts` expensive
post-2.0. Adding the column during the in-place edit of
`0002_comprehensive` is free.

**Why CASCADE:** consistent with Decision D15 — when a behavior
is deleted (main-agent under user confirmation), all its
evidence goes too.

### Decision 35: MCP Resources and Prompts (Two URI Schemes, Framing-Only Prompts)

**Context:** Through the 2.0 dogfood it became clear that the
50-tool surface was missing two adjacent capabilities. First,
agents kept asking "how do I assert on accumulated writes from a
DataStore test layer?" or "what's the right way to round-trip a
`Schema.Class`?" — questions whose answers are documentation, not
data. Pulling those answers in via tool calls was wasteful (every
question paid a tRPC roundtrip + zod parse) and the canonical
answers lived in two places that the agent could not reach
directly: the upstream Vitest documentation site (a network
fetch away, blocked by sandbox policies in many setups) and our
own curated guidance scattered across CLAUDE.md / design docs.
Second, the tool surface was *low-level* — agents had to know
which tools to compose and in what order to triage failures or
diagnose flaky tests. There was no canonical "this is how you
triage" or "this is how you find the regression" framing the
client could surface in its prompt menu.

The MCP spec already has the right primitives for both: resources
(URI-addressable read-only content) and prompts (templated
messages clients can pick from a menu). The question was
*which* split, and *what shape* of prompts.

**Decision:** add two MCP-server surfaces alongside the existing
tRPC tool router:

- **Four resources under two URI schemes.** `vitest://docs/`
  (index) + `vitest://docs/{+path}` (page template) expose the
  vendored upstream Vitest documentation snapshot at
  `packages/mcp/src/vendor/vitest-docs/`. `vitest-agent://patterns/`
  (index) + `vitest-agent://patterns/{slug}` (page template)
  expose the curated patterns library at
  `packages/mcp/src/patterns/`. All four return `text/markdown`
- **Six framing-only prompts.** `triage`, `why-flaky`,
  `regression-since-pass`, `explain-failure`, `tdd-resume`, and
  `wrapup`. Each prompt's factory takes a small zod-validated
  argument set and returns one or more user-role messages that
  orient the agent toward the right tool composition — *no tool
  data is pre-fetched on the server*

The registrars (`packages/mcp/src/resources/index.ts` and
`packages/mcp/src/prompts/index.ts`) are called from
`server.ts` immediately before `StdioServerTransport` is
constructed, so resources and prompts are visible on the same
session as the tools.

**(a) Why two URI schemes (vs one):**

- The two schemes carry content with **different provenance**:
  `vitest://` is vendored upstream content (a snapshot of
  `vitest-dev/vitest`'s `docs/` tree at a pinned tag, MIT-licensed,
  attributed in `ATTRIBUTION.md` + `manifest.json`).
  `vitest-agent://` is content authored *for* this project
  (curated guidance encoding our own opinions about testing
  Effect, schemas, and reporters). Splitting the schemes makes
  the provenance visible at glance — a client UI can render
  vendored docs differently from curated patterns, an agent can
  cite the right source without having to inspect path prefixes,
  and a future "trust this source for X but not Y" policy
  becomes expressible at the URI-scheme level
- Cramming both content trees under one scheme (e.g.
  `vitest-agent://docs/...` + `vitest-agent://patterns/...`)
  would conflate authored-by-us with vendored-from-upstream.
  Keeping them separate is cheap (two `server.registerResource`
  calls per tree instead of two) and load-bearing for licensing
  - provenance clarity

**(b) Why vendor the Vitest docs (vs fetch on demand from
`vitest.dev` or GitHub):**

- **Zero-network determinism.** The MCP server is called from
  agent loops that may have no network egress (sandbox policies,
  airgapped CI, offline dev). A network-fetching resource handler
  would intermittently fail, which agents would interpret as
  "the docs are gone" rather than "your network is partitioned".
  Vendoring at a pinned tag means every install ships with a
  known-good snapshot
- **Snapshot integrity.** `manifest.json` records the exact
  upstream tag + commit SHA + capture timestamp + source URL,
  and `ATTRIBUTION.md` carries the MIT license notice. Anyone
  reading the vendored content can verify provenance without
  trusting the build pipeline
- **Refresh path is an explicit human action.** The three
  Effect-based maintenance scripts under
  `packages/mcp/lib/scripts/` (`fetch-upstream-docs.ts`,
  `build-snapshot.ts`, `validate-snapshot.ts`), driven by the
  project-local `.claude/skills/update-vitest-snapshot/` skill,
  make "bump the Vitest docs we ship" a deliberate operation
  that goes through code review. A network-fetched resource
  handler would change what agents see *between server starts*
  without any audit trail
- **Build-time cost is bounded.** The snapshot is markdown only.
  ~10 entries per snapshot; checked-in size is small. rslib's
  `copyPatterns` config in `packages/mcp/rslib.config.ts`
  mirrors `src/vendor/` and `src/patterns/` into `dist/dev/`
  and `dist/npm/` so runtime path resolution works post-build
  without bundling markdown into the JS

**(c) Why `execFileSync` (with array args) for the snapshot
fetcher:**

- The fetcher takes a tag string from the CLI and passes it to
  `git`. Building a shell command (e.g. `git clone ... --branch
  ${tag} ...`) and passing it to `execSync` opens a
  shell-injection hole at the exact boundary where the input is
  least trusted. A malicious upstream tag like
  `v4.0.0; rm -rf $HOME` would execute as written
- `execFileSync("git", [..., "--branch", tag, ...], { cwd })`
  invokes git directly without spawning a shell, so the tag is
  treated verbatim as one argv element regardless of its
  contents. The same applies to the `git rev-parse HEAD` and
  `git sparse-checkout set docs` invocations
- The discipline is preserved by `fetch-upstream-docs.ts`
  (which replaced the zero-deps `update-vitest-snapshot.mjs`).
  The newer scripts run via `pnpm exec tsx ...` so they can
  share Effect Schema types with the runtime
  (`UpstreamManifest` in `src/resources/manifest-schema.ts`),
  but they continue to use `execFileSync` with array args for
  every git invocation. Documented in the
  `.claude/skills/update-vitest-snapshot/` skill alongside the
  rationale

**(d) Why path-traversal guarding (`paths.ts`):**

- The MCP server is a long-lived process and the resource URI
  template variables come from clients. A naïve
  `join(vendorRoot, relative)` would let
  `vitest://docs/../../etc/passwd` escape the vendored tree on
  any platform. `resolveResourcePath` enforces three invariants:
  no null bytes (defense against C-string-style truncation
  bugs), no absolute paths (which would bypass the prefix
  entirely), and the resolved path must start with
  `<root><sep>` (or equal `root` for empty input)
- Tests in `paths.test.ts` cover each rejection case explicitly.
  The reader functions (`upstream-docs.ts`, `patterns.ts`)
  must call `resolveResourcePath` before any `readFile` — the
  helper is the security boundary, not a performance optimization

**(e) Why "framing-only" prompts (vs prompts that pre-fetch tool
data on the server):**

- Pre-fetching on the server would invert the cost model.
  `triage` would have to call `triage_brief` server-side just to
  emit one templated message — paying the database read and the
  output rendering twice (once on prompt selection, once when
  the agent then calls `triage_brief` itself for the data).
  Framing-only prompts have *zero* server-side I/O on selection
- Prompts that pre-fetch couple the prompt result to the
  database state at prompt-selection time, which is one or two
  agent turns *earlier* than when the agent actually uses the
  data. By the time the agent reaches the relevant turn, the
  pre-fetched data is stale
- Framing-only prompts are composable with the existing tools.
  The `triage` prompt orients the agent toward
  `triage_brief` + `failure_signature_get` + `hypothesis_record`;
  the agent then calls those tools with the right arguments at
  the right time. The prompts don't duplicate tool data — they
  direct the agent toward the right tools
- Argument validation lives in the prompt (`zod` schemas), so
  the prompt surface is type-safe even though it's content-only.
  Failures show up at prompt selection, not several turns later
  in tool calls

**(f) Why six prompts specifically (vs more or fewer):**

- The six map onto the six **canonical workflows** that surfaced
  during the 2.0 dogfood: triaging recent failures, diagnosing
  flakes, finding the regression, explaining a failure class,
  resuming TDD work, and generating wrapup output. Each one had
  agents repeatedly asking "what's the right tool composition
  for X?", which is exactly what a prompt menu solves
- Adding a seventh prompt is one file in `packages/mcp/src/prompts/`
  - one entry in the registrar; the surface scales gracefully.
  The argument schema is `zod`, the message factory is a pure
  function, and the registrar's pattern (`if (args.x !==
  undefined) { ... }` for optionals) is mechanical. We expect
  the prompt set to grow as new workflow patterns emerge

**(g) Why direct SDK registration (vs going through tRPC):**

- tRPC is the right abstraction for the **tool** surface
  (input validation + typed context + caller factory for
  testing). Resources and prompts have a **different shape**:
  resources are URI-addressable reads, prompts are templated
  message emitters. Both are well-served by the SDK's native
  `registerResource` / `registerPrompt` APIs, which understand
  URI templates and argument schemas natively
- Forcing resources through tRPC would mean inventing a
  procedure-per-resource convention and re-implementing URI
  template matching in the router, for no gain. Forcing prompts
  through tRPC would lose the SDK's native argument-schema
  support
- The two surfaces (tools via tRPC, resources/prompts via SDK)
  share the same `McpServer` instance, the same stdio transport,
  and the same `ManagedRuntime` indirectly (resources/prompts
  are content-only and don't need DataReader/DataStore yet, but
  if a future prompt needs runtime data the registrar can
  receive the runtime as a closure)

**Trade-offs:**

- The MCP package's release artifact now ships markdown trees
  (`vendor/` + `patterns/`) alongside compiled JS. rslib's
  `copyPatterns` config in `packages/mcp/rslib.config.ts`
  handles the layout in a single rsbuild-native invocation, so
  the build/copy pair is now atomic by construction (no `&&`
  chain that could partially succeed). This replaced the prior
  `packages/mcp/scripts/copy-vendor-to-dist.mjs` postbuild
  copier — see Decision 35 addendum below for the
  `src/`-relocation rationale
- Vendored snapshots get stale. We accept this: a stale snapshot
  is still useful (most Vitest API doesn't change between minors),
  and the explicit refresh path means staleness is visible in
  the changelog when it matters. A network-fetching alternative
  would be invisibly stale instead — the symptom would be
  "agents cite outdated docs without anyone noticing"
- The two URI schemes look like a lot of surface for two trees
  of content. Acceptable: future trees (e.g. a `vitest-agent://
  decisions/<id>` exposing the design-doc decisions for direct
  agent reference) slot in without introducing a third scheme,
  by extending the existing `vitest-agent://` namespace
- Prompts cannot dynamically discover tools. A future need for
  "this prompt should expand to whatever tools are currently
  registered" would require server-side enumeration that the
  current framing-only design doesn't support. Acceptable for
  the launch set; if that need surfaces, prompt factories can
  call into `server.tools` directly without breaking the
  framing-only model for the existing six

This decision sits next to Decision 19 (tRPC for MCP routing) and
Decision 21 (`spawnSync` for `run_tests`). Decision 19 chose tRPC
for the tool surface; Decision 35 keeps tRPC there and adds two
non-tool surfaces via the SDK's native APIs. The two coexist
cleanly because they address different needs.

#### Decision 35 addendum: Vendor + patterns under `src/`, Effect-based maintenance scripts, project-local refresh skill, per-page metadata via SDK `list` callback

**Context:** Three problems surfaced after the initial
implementation of Decision 35:

1. **Turbo's build cache didn't invalidate on snapshot
   refreshes.** With vendor + patterns under
   `packages/mcp/vendor/` and `packages/mcp/patterns/` (siblings
   of `src/`), edits to vendored markdown didn't show up in
   turbo's input hash for the build task — turbo defaults to
   tracking `src/` and a few other roots. A snapshot refresh
   could land without a fresh build, leaving `dist/` stale until
   somebody noticed and ran `--force`
2. **The single-pass `update-vitest-snapshot.mjs` couldn't pause
   for the agent to author per-page descriptions.** Mechanical
   titles (derived from H1) made the resource picker barely
   usable: `vitest_docs_page` clients saw "Mock Functions" with
   no description telling them when to load that page vs the
   "Vi Utility" page. The script ran fetch + transform +
   implicit-validate end-to-end, with no break point for an
   agent to read each page and author a "load when" signal
3. **The `update-vitest-snapshot` skill was being shipped to
   plugin consumers** under `plugin/skills/`, but the workflow
   referenced this repo's exact paths (`packages/mcp/scripts/...`,
   `pnpm run update-vitest-snapshot --tag <vN.M.K>`) and made no
   sense for a downstream user — they would never need to bump
   the snapshot

**Decision:** four coordinated changes:

**(i) Move vendor + patterns under `src/`.** Now at
`packages/mcp/src/vendor/vitest-docs/` and
`packages/mcp/src/patterns/`. Turbo's build-cache input
includes `src/` by convention, so refreshes show up as
build-affecting deterministically. The dist layout is
unchanged (`dist/<env>/vendor/` and `dist/<env>/patterns/`)
because rslib's `copyPatterns` config in
`packages/mcp/rslib.config.ts` declares `[{ from: "src/vendor",
to: "vendor" }, { from: "src/patterns", to: "patterns" }]`. The
old `packages/mcp/scripts/copy-vendor-to-dist.mjs` is removed —
rsbuild handles the copy as part of the build, so the
build/copy pair is now atomic by construction (no `&&` chain
that can partially succeed).

**(ii) Split the snapshot lifecycle into three Effect-based
TS scripts.** Under `packages/mcp/lib/scripts/`:
`fetch-upstream-docs.ts` (sparse-clone into a gitignored
`lib/vitest-docs-raw/`), `build-snapshot.ts` (denylist + strip
frontmatter + scaffold `manifest.json` with placeholder
descriptions marked `[TODO: replace with load-when signal]`),
and `validate-snapshot.ts` (schema-decodes the manifest,
asserts `pages[]` non-empty, refuses any `[TODO` description,
enforces a 30-character minimum description length). The split
gives the refresh skill a place to insert the
description-authoring step (phase 4) between scaffolding
(phase 3) and the gate (phase 5). The scripts run via `pnpm
exec tsx packages/mcp/lib/scripts/<name>.ts` so they can share
Effect Schema types (`UpstreamManifest` in
`src/resources/manifest-schema.ts`) with the runtime — the
manifest the validator decodes is the same shape the registrar
decodes. The `execFileSync`-with-array-args discipline for git
invocations is preserved.

**(iii) The maintenance scripts live under `lib/scripts/`, not
`src/scripts/`.** They are not part of the published bundle —
they are local-only Effect-based TypeScript that the agent
runs from the repo root. `lib/` is the repo convention for
build-affecting (turbo-cache-invalidating) TypeScript that
lives outside the bundle, matching the `lib/configs/`
directory at the repo root. Putting the scripts under `src/`
would pull them into the rslib build entry list.

**(iv) Move the `update-vitest-snapshot` skill to
`.claude/skills/`.** The skill is repo-internal only — never
plugin-shipped. `plugin/skills/update-vitest-snapshot/` is
deleted along with its row in `plugin/README.md`'s skills
table. The skill itself is now a 5-phase interactive workflow:
fetch → inventory and prune → scaffold → **agent rewrites each
manifest entry's description as a "load when" signal one entry
at a time** → validate. Phase 4 is the headline reason the
skill exists: the per-page `title` and `description` fields
drive what MCP clients display in their resource picker, so
they directly determine discoverability. Mechanical extractions
are not enough.

**(v) Per-page metadata via SDK `list` callback (not N
individual resources).** The `vitest_docs_page` `ResourceTemplate`
is now registered with a `list` callback (was `list:
undefined`) that decodes `manifest.json` against the
`UpstreamManifest` Effect Schema and emits per-page `{ name,
uri, title, description, mimeType }` for every entry in
`pages[]`. The alternative — registering each of the ~10 pages
as its own `server.registerResource` call with hardcoded title
and description — would tightly couple the registrar to the
content, force a code change for every snapshot refresh, and
lose the schema-validated single source of truth in
`manifest.json`. The `list`-callback approach keeps the
registrar generic (one template per scheme), drives MCP-client
discoverability from `manifest.json`, and gives the
description-authoring step in the skill a single artifact to
edit.

**Why per-page `pages[]` is optional in the schema:** the
registrar's `list` callback can fall back gracefully (skip
enumeration, return `resources: []`) during a transitional
pre-skill-run state where the manifest exists but
`pages[]` hasn't been authored yet. The `validate-snapshot.ts`
script enforces non-empty `pages[]` as a quality gate before
commit — so the optionality at the schema level lets the build
still produce a working server even mid-refresh, while the
quality gate prevents any commit from landing without per-page
descriptions.

**Why optional `pages` at schema level (vs required + required
non-empty):** if `pages` were required at the schema level,
`build-snapshot.ts` would have to emit an empty array as a
placeholder and the registrar would still accept that empty
array as valid input — moving the failure mode from "decode
error at startup" to "empty resource picker at runtime", which
is worse for diagnosability. The optional + script-enforced
pattern keeps the failure mode at validation time (where it's
loud and gated by CI) and keeps the registrar correct under
any well-formed manifest.

**Trade-offs:**

- The maintenance scripts now depend on the workspace's
  `node_modules` (specifically `tsx` and the workspace's Effect
  Schema). The prior `update-vitest-snapshot.mjs` was zero-deps
  Node and could run before `pnpm install`. Acceptable: the
  refresh workflow is run by repo contributors, who always have
  `node_modules` installed; the gain is sharing the
  `UpstreamManifest` schema with the runtime, which makes the
  validator and the registrar see the exact same shape
- The `lib/scripts/` directory is a new repo convention. It's
  modeled on `lib/configs/` at the root. Future maintenance
  scripts should follow the same pattern (Effect-based
  TypeScript, run via `pnpm exec tsx`, lives under `lib/`)
- The skill is no longer discoverable from a clean plugin
  install. Acceptable: nothing in the plugin's surface needs
  it — it's a contributor workflow, not a user workflow. The
  skill is documented in `.claude/skills/` (visible in any
  repo checkout) and referenced from this Decision

This addendum sits inside Decision 35 because the moves are
internal refactors of the same surface — the URI schemes, the
six prompts, the framing-only model, and the rationale chains
in (a)-(g) are unchanged. The MCP-client-facing contract
(`vitest://docs/`, `vitest://docs/{+path}`, with `text/markdown`
content) is unchanged; the per-page metadata in the resource
picker is a strict addition.

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
- **Implementation:** Service tags in `packages/sdk/src/services/`
  (plus `packages/plugin/src/services/CoverageAnalyzer.ts`), live and
  test layers in `packages/sdk/src/layers/` (plus the
  plugin-package-local `CoverageAnalyzerLive` /
  `CoverageAnalyzerTest`), merged composition layers (`ReporterLive`,
  `CliLive`, `McpLive`, `OutputPipelineLive`)

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
