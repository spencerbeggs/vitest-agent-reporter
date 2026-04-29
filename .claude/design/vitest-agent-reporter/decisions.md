---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-04-28
last-synced: 2026-04-28
post-phase5-sync: 2026-04-23
completeness: 95
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
Phase 5 added `splitProject()` to separate `"project:subProject"` for
normalized database storage.

### Decision 3: Four-Environment Detection (Phase 5 update)

**Context:** The reporter needs to behave differently depending on who is
running tests and in what context.

**Phase 1 approach:** Hand-rolled `detectEnvironment()` checking 9+
individual env vars.

**Phase 2 approach:** AgentDetection Effect service backed by `std-env`
with three environments: agent, CI, human.

**Phase 5 approach (current):** EnvironmentDetector service with four
granular environments: `agent-shell` (LLM agent in a shell), `terminal`
(human in terminal), `ci-github` (GitHub Actions specifically),
`ci-generic` (other CI systems). The ExecutorResolver then maps these to
three executor roles (`human`, `agent`, `ci`) for output behavior.

**Why changed:** The CI split (`ci-github` vs `ci-generic`) enables
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

### Decision 5: Effect Schema Data Structures (Phase 2)

**Context:** Report and manifest data needs to be both type-safe in
TypeScript and serializable to/from JSON files on disk.

**Phase 1 approach:** Zod 4 schemas in `schemas.ts`, types via
`z.infer<>` in `types.ts`, codecs via `z.codec()`.

**Phase 2 approach (current):** Effect Schema definitions split across
`package/src/schemas/` directory. TypeScript types derived via
`typeof Schema.Type`. JSON encode/decode via `Schema.decodeUnknown` /
`Schema.encodeUnknown`. Schemas are exported from the public API so
consumers can validate report files.

**Why migrated:** Effect Schema integrates naturally with the Effect
service architecture. Eliminates the Zod dependency. Unified ecosystem
means schemas compose with Effect services without bridging.

**Note:** Phase 5c re-introduced `zod` as a dependency for tRPC procedure
input validation in the MCP server. This is separate from the data schema
layer -- Effect Schema remains the source of truth for data structures,
while Zod is used only for MCP tool input schemas where `@trpc/server`
requires it.

### Decision 6: Effect Services over Plain Functions (Phase 2)

**Context:** The reporter and CLI share functionality (cache reading,
coverage processing). Both need testable I/O without mocking Node APIs
directly.

**Phase 2 approach:** Five Effect services: AgentDetection, CacheWriter,
CacheReader, CoverageAnalyzer, ProjectDiscovery.

**Phase 5 approach (current):** Ten Effect services: DataStore, DataReader,
EnvironmentDetector, ExecutorResolver, FormatSelector, DetailResolver,
OutputRenderer, CoverageAnalyzer, ProjectDiscovery, HistoryTracker. Live
layers use `@effect/platform` FileSystem and `@effect/sql-sqlite-node`;
test layers swap in mock implementations.

**Why expanded:** The output pipeline needed distinct stages
(detect -> resolve -> select -> resolve detail -> render) to be
individually testable. The data layer split (DataStore write vs DataReader
read) enables different composition in different contexts (reporter writes,
CLI/MCP reads).

### Decision 7: Scoped Effect.runPromise in Reporter (Phase 2)

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

**Note:** The MCP server (Phase 5c) does use `ManagedRuntime` because it
is a long-running process where per-call construction would be wasteful.

### Decision 8: CLI-First Overview (Phase 2)

**Context:** Overview/status data could be generated on every test run
(in the reporter's `onInit` hook) or on-demand by a separate tool.

**Chosen approach:** The CLI generates overview/status on-demand. The
reporter writes test results to the database; the CLI reads them plus does
its own project discovery when asked.

**Why chosen:** Keeps the reporter lean. Overview generation requires
filesystem discovery (globbing for test files, reading source files) that
would slow down every test run. On-demand generation is more appropriate
for discovery data that changes infrequently.

### Decision 9: Hybrid Console Strategy (Phase 2, renamed post-Phase-5)

**Context:** Vitest 4.1 added a built-in `agent` reporter. Our plugin
originally stripped all console reporters and took over output entirely.

**Chosen approach:** New `strategy` option (originally `consoleStrategy`,
renamed post-Phase-5 -- see Decision 27):

- `"complement"` (default) -- layers on top of Vitest's built-in agent
  reporter. Does not strip reporters. Writes to database only.
  Warns if `agent` reporter missing from chain
- `"own"` -- strips built-in console reporters, uses our formatter, writes
  our own GFM. Phase 1 behavior

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
- No cache file pointer line (removed post-Phase-5; not useful to agents)

### Decision 13: History Always-On (Phase 3)

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

### Decision 14: Vitest-Native Threshold Format (Phase 4)

**Context:** Phase 1-3 used a single `coverageThreshold: number` (minimum
across all metrics). Vitest supports a richer format with per-metric
thresholds, per-glob patterns, negative numbers (relative thresholds),
`100` shorthand, and `perFile` mode.

**Phase 4 approach (current):** `coverageThresholds` accepts the full
Vitest thresholds format (`Record<string, unknown>`). Parsed by
`resolveThresholds()` into a typed `ResolvedThresholds` structure.

**Breaking change:** `coverageThreshold: number` replaced by
`coverageThresholds: Record<string, unknown>`.

### Decision 15: Three-Level Coverage Model (Phase 4)

**Context:** Users need both hard enforcement (fail the build) and
aspirational goals (track progress toward 100%). A single threshold
serves one purpose but not both.

**Chosen approach:** Three levels:

1. **Thresholds** (`coverageThresholds`) -- enforced minimums
2. **Targets** (`coverageTargets`) -- aspirational goals
3. **Baselines** (stored in SQLite `coverage_baselines` table) --
   auto-ratcheting high-water marks

### Decision 16: Coverage Trend Tracking (Phase 4)

**Context:** Point-in-time coverage data doesn't show whether coverage is
improving or degrading over time.

**Chosen approach:** Per-project trend tracking with 50-entry sliding
window (now stored in SQLite `coverage_trends` table). Only recorded on
full (non-scoped) test runs. Target change detection via hash comparison
resets trend history when targets change.

### Decision 17: Tiered Console Output (Phase 4)

**Context:** Phase 1-3 console output showed the same format regardless
of run health.

**Chosen approach:** Three tiers based on run health:

- **Green** (all pass, targets met): one-line summary
- **Yellow** (pass but below targets): improvements needed + CLI hint
- **Red** (failures/threshold violations/regressions): full detail +
  CLI hints

**Phase 5 update:** Tiered output is now implemented in the markdown
formatter (`package/src/formatters/markdown.ts`) and controlled by the
DetailResolver service, which maps `(executor, runHealth)` to a
`DetailLevel` enum.

### Decision 18: SQLite over JSON Files (Phase 5a)

**Context:** Phase 2-4 stored all data in JSON files: per-project report
files, history files, trends files, baselines file, and a manifest file.
This created issues with concurrent access, atomicity, querying across
projects, and file proliferation in monorepos.

**Options considered:**

1. **SQLite with normalized schema (Chosen):**
   - Pros: ACID transactions, concurrent reads (WAL mode), efficient
     queries across projects, relational integrity via foreign keys,
     single file per cache directory, FTS5 for note search, migration-
     based schema evolution
   - Cons: Binary format (not human-readable), requires SQLite dependency
   - Why chosen: The benefits of structured queries, relational integrity,
     and single-file storage dramatically simplify the data layer

2. **Keep JSON files:**
   - Pros: Human-readable, no external dependencies
   - Cons: No cross-project queries, no atomicity, file proliferation,
     no FTS, manual file management in CacheWriter/CacheReader
   - Why rejected: The growing number of file types (reports, history,
     trends, baselines, manifest) created increasing complexity

3. **Embedded key-value store (LevelDB, etc.):**
   - Pros: Simple API, single file
   - Cons: No relational queries, no SQL, custom migration story
   - Why rejected: We need relational queries for cross-project analysis

**Implementation:** 25-table normalized schema via `@effect/sql-sqlite-node`
with `@effect/sql-sqlite-node` SqliteMigrator. WAL journal mode for
concurrent reads. All composition layers (`ReporterLive`, `CliLive`,
`McpLive`) are now functions of `dbPath` that construct the SqliteClient
layer inline.

### Decision 19: tRPC for MCP Routing (Phase 5c)

**Context:** The MCP server needs to expose 24 tools. Each tool needs
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

### Decision 20: File-Based Claude Code Plugin (Phase 5d)

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

### Decision 21: spawnSync for run_tests (Phase 5c)

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

### Decision 22: Output Pipeline Architecture (Phase 5b)

**Context:** Phase 1-4 had formatting logic scattered across the reporter,
plugin, and utility files. The format was determined by a combination of
`consoleOutput`, `consoleStrategy`, and environment detection.

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

### Decision 23: Normalized Project Identity (Phase 5a)

**Context:** Vitest project names can include colons for sub-projects
(e.g., `"my-app:unit"`, `"my-app:e2e"`). Phase 1-4 treated these as
opaque strings.

**Chosen approach:** `splitProject()` utility separates the project name
at the first colon into `project` and `subProject` fields. Both fields
are stored in the database and used for querying. The `ProjectIdentity`
interface (`{ project: string, subProject: string | null }`) is used
throughout the data layer.

**Why split:** Normalized project/sub-project fields enable queries like
"all sub-projects of my-app" or "all unit test results across projects"
without string parsing at query time.

### Decision 24: Effect-Based Structured Logging (post-Phase-5)

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

### Decision 25: Per-Project Reporter Instances (post-Phase-5)

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

### Decision 26: Native Coverage Table Suppression (post-Phase-5)

**Context:** Vitest prints a large text coverage table to the console
by default. This duplicates the reporter's own compact coverage output
and wastes context window tokens for LLM agents.

**Chosen approach:** In agent/own mode, the plugin sets
`coverage.reporter = []` to suppress Vitest's built-in text table.
Our reporter produces its own compact coverage gaps section.

**Why chosen:** Setting `coverage.reporter` to empty array is the
cleanest way to suppress the table without affecting coverage data
collection. The table is redundant with our output.

### Decision 27: `consoleStrategy` Renamed to `strategy` (post-Phase-5)

**Context:** The `consoleStrategy` option name was verbose and the
`console` prefix was redundant given the plugin context.

**Chosen approach:** Renamed to `strategy` on `AgentPluginOptions`.
Same values (`"own" | "complement"`, default `"complement"`).

**Why chosen:** Shorter, cleaner API. The option controls the
overall strategy for how the plugin interacts with Vitest's reporter
chain, not just console behavior.

### Decision 28: Process-Level Migration Coordination via globalThis Cache (bug/startup branch)

**Context:** In multi-project Vitest configurations sharing a single
`data.db`, each `AgentReporter` instance ran SQLite migrations through
its own `SqliteClient` connection. With a fresh database, two
connections would both start deferred transactions and then attempt to
upgrade to write, producing `SQLITE_BUSY` (database is locked). SQLite's
busy handler is not invoked for write-write upgrade conflicts on
deferred transactions, so better-sqlite3's 5s `busy_timeout` did not
help. This was a real bug reproducible on the bug/startup branch.

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
`package/src/utils/ensure-migrated.ts` exports `ensureMigrated(dbPath,
logLevel?, logFile?)`. The promise cache lives at
`Symbol.for("vitest-agent-reporter/migration-promises")` on
`globalThis`. `AgentReporter.onTestRunEnd` awaits `ensureMigrated`
before the main `Effect.runPromise`; on rejection, it prints
`formatFatalError(err)` to stderr and returns. The function is also
referenced from a new test file with a `_resetMigrationCacheForTesting`
internal helper.

### Decision 29: Plugin MCP Server Loader (bug/startup branch)

**Context:** The Phase 5d plugin previously registered the MCP server
via a separate `.mcp.json` file with `npx vitest-agent-reporter-mcp`.
Two problems: (a) on first run, `npx` could fall back to downloading
the package from the registry and exceed Claude Code's MCP startup
window, and (b) Node's strict-exports CJS rejection blocked dynamic
loading of our published `./mcp` subpath because the package only
declares an `import` condition for it.

**Chosen approach:**

- Inline the `mcpServers` configuration into
  `plugin/.claude-plugin/plugin.json` (per Claude Code's plugin
  convention)
- Ship a small Node loader at `plugin/bin/mcp-server.mjs` invoked as
  `command: "node"` with arg
  `"${CLAUDE_PLUGIN_ROOT}/bin/mcp-server.mjs"`
- The loader walks up from `process.cwd()` looking for
  `node_modules/vitest-agent-reporter`, reads its `exports['./mcp']`
  from `package.json`, and dynamically imports it via a `file://` URL
- If the package is missing, fail fast with a clear stderr message and
  install instructions for npm/pnpm/yarn/bun
- Delete the old `plugin/.mcp.json`

**Why chosen:**

- Resolving from the user's `node_modules` is required because the
  package depends on `better-sqlite3`, a native module that must match
  the user's platform/Node version. We cannot bundle the MCP server
  inside the plugin
- Walking up from `process.cwd()` mirrors Node's resolution algorithm
  and works for hoisted monorepo installs across all package managers
- Dynamic `import()` of a `file://` URL bypasses CJS-vs-ESM exports
  validation that blocks the canonical `import "vitest-agent-reporter/mcp"`
  path when conditions don't match
- Failing fast with install instructions is more useful than a silent
  npx download that could time out the MCP handshake

**Trade-offs:**

- The loader is brittle to deeply non-standard install layouts (anything
  Node's own resolver couldn't find), but those layouts already break
  most tools
- Plugin users must install `vitest-agent-reporter` as a project
  dependency. This is consistent with how the Vitest reporter and CLI
  are already used and is documented in the failure message

---

## Design Patterns Used

### Pattern: Manifest-First Read

- **Where used:** DataReader (backward-compatible manifest assembly)
- **Why used:** Agents and CLI commands can quickly assess project states
  before fetching detailed data
- **Implementation:** `DataReader.getManifest()` assembles a
  `CacheManifest` from the latest test run per project in the database

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

- **Where used:** All Effect services (Phase 2+)
- **Why used:** Clean separation between service interface (Context.Tag)
  and implementation (Layer). Enables swapping live I/O for test mocks
- **Implementation:** Service tags in `package/src/services/`, live and
  test layers in `package/src/layers/`, merged composition layers
  (`ReporterLive`, `CliLive`, `McpLive`, `OutputPipelineLive`)

### Pattern: Scoped Effect.runPromise

- **Where used:** AgentReporter lifecycle hooks, AgentPlugin configureVitest
- **Why used:** Bridge between imperative Vitest class API and Effect
  service architecture without ManagedRuntime lifecycle concerns
- **Implementation:** Each hook builds a self-contained effect, provides
  the layer inline, and runs via `Effect.runPromise`

### Pattern: ManagedRuntime for Long-Lived Processes

- **Where used:** MCP server (Phase 5c)
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

- **Where used:** Output pipeline (Phase 5b)
- **Why used:** Each stage of output determination has a single
  responsibility and is independently testable
- **Implementation:** Five chained services: detect -> resolve executor ->
  select format -> resolve detail -> render. Explicit overrides can
  short-circuit automatic selection at any stage

---

## Constraints and Trade-offs

### Constraint: Vitest >= 3.2.0

- **Description:** Requires stable Reporter v2 API with `TestProject`
- **Impact:** Limits adoption to Vitest 3.2+
- **Mitigation:** Vitest 3.2 is current stable; peer dep is explicit

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

### Trade-off: Zod Re-introduction for tRPC (Phase 5c)

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
