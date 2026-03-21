---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-03-21
last-synced: 2026-03-20
completeness: 90
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

### Decision 3: Three-Environment Detection

**Context:** The reporter needs to behave differently depending on who is
running tests: an LLM agent, a CI system, or a human developer.

**Original approach (Phase 1):** Hand-rolled `detectEnvironment()` checking
9+ individual env vars (`AI_AGENT`, `CLAUDECODE`, `CURSOR_TRACE_ID`, etc.).

**Chosen approach (Phase 2):** AgentDetection Effect service backed by
`std-env`. `std-env` maintains agent detection upstream (currently covers
Claude, Cursor, Devin, Replit, Gemini, Codex, Auggie, OpenCode, Kiro,
Goose, Pi). CI detection stays custom because we need the specific
`GITHUB_ACTIONS` check for GFM behavior. Three tiers:

- **Agent**: structured markdown or complement mode, write JSON cache
- **CI** (GITHUB_ACTIONS, CI): keep existing reporters, GFM, JSON cache
- **Human**: keep existing reporters, reporter runs silently (JSON
  cache only)

The reporter always writes JSON cache regardless of environment.

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
`src/schemas/` directory. TypeScript types derived via
`typeof Schema.Type`. JSON encode/decode via `Schema.decodeUnknown` /
`Schema.encodeUnknown`. Schemas are exported from the public API so
consumers can validate report files.

**Why migrated:** Effect Schema integrates naturally with the Effect
service architecture. Eliminates the Zod dependency. Unified ecosystem
means schemas compose with Effect services without bridging.

### Decision 6: Effect Services over Plain Functions (Phase 2)

**Context:** The reporter and CLI share functionality (cache reading,
coverage processing). Both need testable I/O without mocking Node APIs
directly.

**Chosen approach:** Five Effect services with `Context.Tag` definitions:
AgentDetection, CacheWriter, CacheReader, CoverageAnalyzer,
ProjectDiscovery. Live layers use `@effect/platform` FileSystem; test
layers swap in mock implementations.

**Why chosen:** Effect's dependency injection gives testable layers without
mocking Node APIs. `@effect/platform` provides the FileSystem abstraction.
The reporter and CLI compose different layer sets (ReporterLive vs CliLive)
from the same service definitions.

### Decision 7: Scoped Effect.runPromise in Reporter (Phase 2)

**Context:** Vitest instantiates the reporter class -- we don't control
construction. We need to use Effect services inside class methods.

**Chosen approach:** Each lifecycle hook (`onTestRunEnd`) builds a scoped
effect and runs it with `Effect.runPromise`, providing the `ReporterLive`
layer inline. No `ManagedRuntime` needed.

**Why chosen:** The layer is lightweight (FileSystem + pure services), so
per-call construction is acceptable. Avoids `ManagedRuntime` lifecycle
concerns (no resource leak, no disposal needed). For the plugin,
`configureVitest` is async (Vitest awaits plugin hooks), so
`Effect.runPromise` is also safe there.

### Decision 8: CLI-First Overview (Phase 2)

**Context:** Overview/status data could be generated on every test run
(in the reporter's `onInit` hook) or on-demand by a separate tool.

**Chosen approach:** The CLI generates overview/status on-demand. The
reporter writes test results and manifest; the CLI reads them plus does
its own project discovery when asked.

**Why chosen:** Keeps the reporter lean. Overview generation requires
filesystem discovery (globbing for test files, reading source files) that
would slow down every test run. On-demand generation is more appropriate
for discovery data that changes infrequently.

### Decision 9: Hybrid Console Strategy (Phase 2)

**Context:** Vitest 4.1 added a built-in `agent` reporter. Our plugin
originally stripped all console reporters and took over output entirely.

**Chosen approach:** New `consoleStrategy` option:

- `"complement"` (default) -- layers on top of Vitest's built-in agent
  reporter. Does not strip reporters. Writes JSON cache and manifest only.
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
standalone reporter, plugin with Vite, CLI reading cached data, and
consumer-specified paths.

**Chosen approach:** Three-priority resolution in `AgentPlugin`:

1. Explicit `reporter.cacheDir` option (user override)
2. `outputFile['vitest-agent-reporter']` from Vitest config (native pattern)
3. `vite.cacheDir + "/vitest-agent-reporter"` (default, typically
   `node_modules/.vite/.../vitest-agent-reporter/`)

CLI cache dir resolution checks common locations: `.vitest-agent-reporter/`
in project root, then `node_modules/.vite/vitest-agent-reporter/`. Uses
the first location containing a `manifest.json`.

When using `AgentReporter` standalone (without the plugin), the default is
`.vitest-agent-reporter` in the project root.

### Decision 12: Compact Console Output

**Context:** LLM agents have limited context windows. Console output
should maximize signal-to-noise ratio.

**Chosen approach:**

- Single-line header with pass/fail counts and duration
- No summary tables (counts are in the header)
- No coverage totals table (only files below threshold with uncovered lines)
- "Next steps" section with specific re-run commands
- Relative file paths throughout
- All-pass output collapses to one line with cache file pointer

### Decision 13: History Always-On (Phase 3)

**Context:** Failure history could be an opt-in feature (toggle in
`AgentReporterOptions`) or always enabled alongside the existing report cache.

**Options considered:**

1. **Always-on (Chosen):**
   - Pros: Zero configuration; agents always have classification data;
     consistent behavior across all consumer setups; simpler code paths
   - Cons: Writes an additional file per project on every run
   - Why chosen: History files are small (one JSON object per test, capped
     at 10 runs). The write cost is negligible. An opt-in toggle adds API
     surface without meaningful benefit -- agents that don't use history data
     simply never read the history files

2. **Opt-in toggle:**
   - Pros: Slightly reduces disk writes for users who don't need history
   - Cons: Feature must be explicitly enabled to be useful; agents cannot
     rely on history being present; adds `enableHistory?: boolean` to
     `AgentReporterOptions`
   - Why rejected: The opt-in overhead outweighs the marginal write savings.
     Disk I/O for a small JSON file is not a meaningful performance concern
     compared to a full test run

**Implementation:** `CacheWriter.writeHistory` is called unconditionally
alongside `CacheWriter.writeReport` in `onTestRunEnd`. History files are
always populated in `CacheManifestEntry.historyFile`.

---

## Design Patterns Used

### Pattern: Manifest-First Read

- **Where used:** Cache directory output, CLI commands
- **Why used:** Agents read one file to discover all project states, then
  selectively read only failing project caches
- **Implementation:** `manifest.json` maps project names to cache file
  paths, last run timestamps, and pass/fail status

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
  `testModule.project.name`

### Pattern: Duck-Typed External APIs

- **Where used:** Istanbul CoverageMap, Vitest TestModule/TestCase
- **Why used:** Avoid hard dependencies on external types that may change
- **Implementation:** Structural interfaces checked at runtime via type
  guards; formatters use duck-typed Vitest interfaces

### Pattern: Effect Service / Layer Separation

- **Where used:** All Effect services (Phase 2)
- **Why used:** Clean separation between service interface (Context.Tag)
  and implementation (Layer). Enables swapping live I/O for test mocks
- **Implementation:** Service tags in `src/services/`, live and test
  layers in `src/layers/`, merged composition layers (`ReporterLive`,
  `CliLive`)

### Pattern: Scoped Effect.runPromise

- **Where used:** AgentReporter lifecycle hooks, AgentPlugin configureVitest
- **Why used:** Bridge between imperative Vitest class API and Effect
  service architecture without ManagedRuntime lifecycle concerns
- **Implementation:** Each hook builds a self-contained effect, provides
  the layer inline, and runs via `Effect.runPromise`

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

### Trade-off: Per-Call Layer Construction

- **What we gained:** No ManagedRuntime lifecycle concerns, no resource
  leaks, no disposal needed
- **What we sacrificed:** Layer constructed on each `onTestRunEnd` call
- **Why it's acceptable:** The layer is lightweight (FileSystem + pure
  services). Construction cost is negligible compared to test run duration

### Trade-off: Convention-Based Source Mapping

- **What we gained:** Simple, predictable file-to-test mapping for scoped
  coverage
- **What we sacrificed:** Cannot detect tests that cover source files
  with non-matching names
- **Why it's acceptable:** Convention covers the vast majority of cases.
  Import analysis remains a potential future enhancement
