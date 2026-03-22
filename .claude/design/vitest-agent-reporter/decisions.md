---
status: current
module: vitest-agent-reporter
category: architecture
created: 2026-03-20
updated: 2026-03-22
last-synced: 2026-03-22
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
`package/src/schemas/` directory. TypeScript types derived via
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

### Decision 14: Vitest-Native Threshold Format (Phase 4)

**Context:** Phase 1-3 used a single `coverageThreshold: number` (minimum
across all metrics). Vitest supports a richer format with per-metric
thresholds, per-glob patterns, negative numbers (relative thresholds),
`100` shorthand, and `perFile` mode.

**Phase 3 approach:** `coverageThreshold: number` -- a single minimum
extracted via `extractCoverageThreshold()` from Vitest's config.

**Phase 4 approach (current):** `coverageThresholds` accepts the full
Vitest thresholds format (`Record<string, unknown>`). Parsed by
`resolveThresholds()` into a typed `ResolvedThresholds` structure with
`global` (MetricThresholds), `perFile` (boolean), and `patterns`
(PatternThresholds[]). `extractCoverageThreshold()` removed entirely.

**Why changed:** The single-number approach lost per-metric granularity.
Agents benefit from knowing exactly which metric is below threshold and
by how much. The Vitest-native format means users can copy their existing
coverage config directly into our plugin options without translation.

**Breaking change:** `coverageThreshold: number` replaced by
`coverageThresholds: Record<string, unknown>`. `CoverageReport.threshold`
(number) replaced by `CoverageReport.thresholds` (object).

### Decision 15: Three-Level Coverage Model (Phase 4)

**Context:** Users need both hard enforcement (fail the build) and
aspirational goals (track progress toward 100%). A single threshold
serves one purpose but not both.

**Chosen approach:** Three levels:

1. **Thresholds** (`coverageThresholds`) -- enforced minimums. Same as
   Vitest's `coverage.thresholds`. Violations are reported as failures
2. **Targets** (`coverageTargets`) -- aspirational goals. Same format as
   thresholds but informational only. Console output shows progress
   toward targets in the yellow tier
3. **Baselines** (`baselines.json`) -- auto-ratcheting high-water marks.
   Updated automatically after each run. Advance toward targets but
   never past them. Regressions below baselines are flagged

**Why chosen:** Separating enforcement from aspiration lets teams set
aggressive goals without breaking CI. Baselines provide a ratchet
mechanism so coverage never goes backward without explicit acknowledgment.

**Implementation:** Plugin disables Vitest's native `autoUpdate` when our
targets are set (prevents double-ratcheting). Reporter reads baselines,
computes updated values, writes them back. `autoUpdate` option (default
true) controls whether baselines auto-advance.

### Decision 16: Coverage Trend Tracking (Phase 4)

**Context:** Point-in-time coverage data doesn't show whether coverage is
improving or degrading over time. LLM agents need trajectory information
to prioritize coverage work.

**Chosen approach:** Per-project trend tracking with 50-entry sliding
window. Only recorded on full (non-scoped) test runs to avoid mixing
partial and full coverage data. Target change detection via hash
comparison resets trend history when targets change (old data is no
longer comparable).

**Options considered:**

1. **50-entry sliding window (Chosen):**
   - Pros: Bounded storage, sufficient history for trajectory analysis,
     constant-space per project
   - Cons: Loses older history
   - Why chosen: 50 runs provides weeks of daily trend data without
     unbounded growth

2. **Unlimited history:**
   - Pros: Complete record
   - Cons: Unbounded file growth, slower reads
   - Why rejected: Cache files should be lightweight and disposable

**Why target hash comparison:** When targets change, historical deltas
are no longer meaningful (the goalpost moved). Resetting provides a
clean baseline for the new target regime rather than showing misleading
"improvements" that are actually just threshold changes.

### Decision 17: Tiered Console Output (Phase 4)

**Context:** Phase 1-3 console output showed the same format regardless
of run health. LLM agents with limited context windows benefit from
adaptive verbosity -- minimal output when everything is fine, detailed
output when action is needed.

**Chosen approach:** Three tiers based on run health:

- **Green** (all pass, targets met): one-line summary with cache pointer.
  Minimal context consumption
- **Yellow** (pass but below targets): shows improvements needed and
  CLI hint for the `coverage` command. Moderate detail
- **Red** (failures/threshold violations/regressions): full detail with
  failed tests, errors, diffs, coverage gaps, and CLI hints for
  `coverage` and `trends` commands. Maximum actionable information

**Why chosen:** The green tier reduces noise for stable runs (the
majority case). The yellow tier surfaces coverage work without
overwhelming. The red tier provides everything needed to diagnose and
fix issues. CLI command suggestions at yellow/red tiers guide agents to
deeper analysis tools.

**Implementation:** Console formatter receives trend data and computes
the tier from report state. Trend summary line added after the header
when trend data is available. CLI command suggestions use detected
package manager from `detect-pm.ts` for correct invocation syntax.

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
- **Implementation:** Service tags in `package/src/services/`, live and
  test layers in `package/src/layers/`, merged composition layers (`ReporterLive`,
  `CliLive`)

### Pattern: Scoped Effect.runPromise

- **Where used:** AgentReporter lifecycle hooks, AgentPlugin configureVitest
- **Why used:** Bridge between imperative Vitest class API and Effect
  service architecture without ManagedRuntime lifecycle concerns
- **Implementation:** Each hook builds a self-contained effect, provides
  the layer inline, and runs via `Effect.runPromise`

### Pattern: Hash-Based Change Detection

- **Where used:** Coverage trend tracking (target change detection)
- **Why used:** Detect when coverage targets have changed between runs,
  invalidating historical trend data
- **Implementation:** `hashTargets()` serializes `ResolvedThresholds` to
  JSON string, stored as `targetsHash` on each `TrendEntry`. When the
  hash differs from the last entry, trend history is cleared

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
