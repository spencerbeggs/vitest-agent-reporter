# Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate vitest-agent-reporter to Effect services, add CLI bin,
hybrid console strategy, std-env detection, scoped coverage, and fix
Phase 1 bugs.

**Architecture:** Effect services with `@effect/platform` for I/O,
`@effect/cli` for the bin, `std-env` for agent detection. Reporter is a
thin Vitest adapter calling Effect services. CLI reads cached data
on-demand.

**Tech Stack:** Effect, @effect/cli, @effect/platform,
@effect/platform-node, std-env, Vitest, @savvy-web/rslib-builder

**Spec:** `docs/superpowers/specs/2026-03-20-phase-2-design.md`

**Reference projects:**

- Effect patterns: `../../savvy-web/github-action-effect`
- CLI bin build: `../../savvy-web/lint-staged`

---

## File Map

### Files to Delete

- `src/schemas.ts` (451 lines) -- replaced by `src/schemas/*.ts`
- `src/types.ts` (153 lines) -- types inferred inline via
  `typeof Schema.Type`
- `src/utils.ts` (300 lines) -- split into `src/utils/*.ts`
- `src/coverage.ts` (128 lines) -- replaced by CoverageAnalyzer service
- `src/detect-pm.ts` (140 lines) -- moved to `src/utils/detect-pm.ts`
- `src/formatters/console.ts` (212 lines) -- moved to
  `src/utils/format-console.ts`
- `src/formatters/json.ts` (248 lines) -- stays but path changes (still
  pure function, used by reporter)
- `src/formatters/gfm.ts` (185 lines) -- moved to
  `src/utils/format-gfm.ts`
- `src/formatters/` directory -- emptied and removed

### Files to Create

```text
src/
  schemas/
    Common.ts                   -- TestState, TestRunReason, TestClassification,
                                   ConsoleOutputMode, PluginMode, ConsoleStrategy,
                                   PackageManager literals
    AgentReport.ts              -- ReportError, TestReport, ModuleReport,
                                   ReportSummary, AgentReport schemas + types
    Coverage.ts                 -- CoverageTotals, FileCoverageReport,
                                   CoverageReport (with scoped field)
    CacheManifest.ts            -- CacheManifestEntry, CacheManifest schemas + types
    Options.ts                  -- AgentReporterOptions, AgentPluginOptions,
                                   CoverageOptions, FormatterOptions schemas

  errors/
    CacheError.ts               -- Data.TaggedError for file I/O failures
    DiscoveryError.ts           -- Data.TaggedError for project discovery

  services/
    AgentDetection.ts           -- Context.Tag wrapping std-env
    CacheWriter.ts              -- Context.Tag for disk writes
    CacheReader.ts              -- Context.Tag for disk reads
    CoverageAnalyzer.ts         -- Context.Tag for coverage processing
    ProjectDiscovery.ts         -- Context.Tag for test file discovery

  layers/
    AgentDetectionLive.ts       -- Live: reads std-env + CI env vars
    AgentDetectionTest.ts       -- Test: fixed environment value
    CacheWriterLive.ts          -- Live: FileSystem writes
    CacheWriterTest.ts          -- Test: state container
    CacheReaderLive.ts          -- Live: FileSystem reads
    CacheReaderTest.ts          -- Test: seeded data
    CoverageAnalyzerLive.ts     -- Live: duck-typed istanbul processing
    CoverageAnalyzerTest.ts     -- Test: canned data
    ProjectDiscoveryLive.ts     -- Live: FileSystem glob
    ProjectDiscoveryTest.ts     -- Test: fixed file list
    ReporterLive.ts             -- Merged layer for reporter
    CliLive.ts                  -- Merged layer for CLI

  utils/
    compress-lines.ts           -- from utils.ts
    safe-filename.ts            -- from utils.ts
    ansi.ts                     -- from utils.ts (ansi + stripAnsi)
    strip-console-reporters.ts  -- from utils.ts
    detect-pm.ts                -- from detect-pm.ts (with FileSystem adapter)
    format-console.ts           -- from formatters/console.ts
    format-gfm.ts               -- from formatters/gfm.ts
    build-report.ts             -- from formatters/json.ts (buildAgentReport)

  cli/
    index.ts                    -- runCli, root command
    commands/
      status.ts                 -- status subcommand
      overview.ts               -- overview subcommand
      coverage.ts               -- coverage subcommand
    lib/
      format-status.ts          -- testable status formatting
      format-overview.ts        -- testable overview formatting
      format-coverage.ts        -- testable coverage formatting
      resolve-cache-dir.ts      -- cache dir auto-discovery

bin/
  vitest-agent-reporter.js      -- shebang wrapper (checked in, not compiled)
```

### Files to Modify

- `src/index.ts` -- rewrite exports for new module paths
- `src/reporter.ts` -- use Effect services, fix unhandledErrors bug
- `src/plugin.ts` -- add consoleStrategy, use std-env via
  AgentDetection, use Effect.runPromise
- `package.json` -- add deps, remove zod, add bin field
- `rslib.config.ts` -- handle bin in transform
- `vitest.config.ts` -- may need minor updates for new plugin options

---

## Task Dependency Graph

```text
Task 1: Dependencies + config
  |
Task 2: Schemas (Zod -> Effect Schema)
  |
Task 3: Errors
  |
  +---> Task 5: AgentDetection service + layers
  |
  +---> Task 6: CacheWriter service + layers
  |
  +---> Task 7: CacheReader service + layers
  |
  +---> Task 8: CoverageAnalyzer service + layers (+ bug fixes)
  |
  +---> Task 9: ProjectDiscovery service + layers
  |
Task 4: Utils (split + move + delete old files)
  |
Task 10: ReporterLive + CliLive merged layers
  |
Task 11: Reporter rewrite (use services)
  |
Task 12: Plugin rewrite (hybrid mode + std-env)
  |
Task 13: Public API (src/index.ts)
  |
Task 14: CLI lib functions
  |
Task 15: CLI commands + bin
  |
Task 16: Integration tests + cleanup
```

Tasks 5-9 are independent of each other and can run in parallel.
Task 4 (Utils Split) MUST run after Tasks 5-9 are complete because
it deletes old files that Tasks 5-9 reference for migration logic.
If running sequentially, do Tasks 5-9 first, then Task 4.

---

### Task 1: Dependencies and Configuration

**Files:**

- Modify: `package.json`
- Modify: `rslib.config.ts`

- [ ] **Step 1: Install Effect ecosystem and std-env**

```bash
pnpm add effect @effect/cli @effect/platform @effect/platform-node std-env
```

- [ ] **Step 2: Remove zod**

```bash
pnpm remove zod
```

- [ ] **Step 3: Add bin field to package.json**

Add to `package.json` at the top level:

```json
"bin": {
  "vitest-agent-reporter": "./bin/vitest-agent-reporter.js"
}
```

- [ ] **Step 4: Update rslib.config.ts transform**

Reference `../../savvy-web/lint-staged/rslib.config.ts` for how bin
fields are handled. The transform callback may need to preserve or
remap the `bin` field for the `dist/npm/` output.

- [ ] **Step 5: Create bin shebang wrapper**

Create `bin/vitest-agent-reporter.js`:

```javascript
#!/usr/bin/env node
import { runCli } from "../src/cli/index.js";
runCli();
```

Note: The exact import path depends on how the builder bundles. Check
the lint-staged reference for the correct pattern. The bin file is
checked into the repo, not generated.

- [ ] **Step 6: Verify build still works**

```bash
pnpm run build
```

Expected: Build succeeds. Tests will fail (schemas import changed) --
that's expected at this stage.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml rslib.config.ts bin/
git commit -m "chore: add Effect, std-env deps; remove zod; add bin entry

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 2: Schema Migration (Zod to Effect Schema)

**Files:**

- Create: `src/schemas/Common.ts`
- Create: `src/schemas/AgentReport.ts`
- Create: `src/schemas/Coverage.ts`
- Create: `src/schemas/CacheManifest.ts`
- Create: `src/schemas/Options.ts`
- Create: `src/schemas/AgentReport.test.ts`
- Create: `src/schemas/CacheManifest.test.ts`
- Create: `src/schemas/Coverage.test.ts`
- Reference: `src/schemas.ts` (current Zod schemas, 451 lines)
- Reference: `src/types.ts` (current type aliases, 153 lines)

- [ ] **Step 1: Write tests for Common.ts schemas**

Create `src/schemas/Common.test.ts` testing that each literal schema
accepts valid values and rejects invalid ones:

```typescript
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { TestState, TestRunReason, ConsoleOutputMode, PluginMode, ConsoleStrategy } from "./Common.js";

describe("Common schemas", () => {
  it("TestState accepts valid values", () => {
    for (const v of ["passed", "failed", "skipped", "pending"]) {
      expect(Schema.decodeUnknownSync(TestState)(v)).toBe(v);
    }
  });

  it("TestState rejects invalid values", () => {
    expect(() => Schema.decodeUnknownSync(TestState)("invalid")).toThrow();
  });

  it("ConsoleStrategy accepts valid values", () => {
    for (const v of ["own", "complement"]) {
      expect(Schema.decodeUnknownSync(ConsoleStrategy)(v)).toBe(v);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/schemas/Common.test.ts
```

Expected: FAIL -- module not found.

- [ ] **Step 3: Implement Common.ts**

Create `src/schemas/Common.ts`:

```typescript
import { Schema } from "effect";

export const TestState = Schema.Literal(
  "passed", "failed", "skipped", "pending",
).annotations({ identifier: "TestState" });
export type TestState = typeof TestState.Type;

export const TestRunReason = Schema.Literal(
  "passed", "failed", "interrupted",
).annotations({ identifier: "TestRunReason" });
export type TestRunReason = typeof TestRunReason.Type;

export const TestClassification = Schema.Literal(
  "stable", "new-failure", "persistent", "flaky", "recovered",
).annotations({ identifier: "TestClassification" });
export type TestClassification = typeof TestClassification.Type;

export const ConsoleOutputMode = Schema.Literal(
  "failures", "full", "silent",
).annotations({ identifier: "ConsoleOutputMode" });
export type ConsoleOutputMode = typeof ConsoleOutputMode.Type;

export const PluginMode = Schema.Literal(
  "auto", "agent", "silent",
).annotations({ identifier: "PluginMode" });
export type PluginMode = typeof PluginMode.Type;

export const ConsoleStrategy = Schema.Literal(
  "own", "complement",
).annotations({ identifier: "ConsoleStrategy" });
export type ConsoleStrategy = typeof ConsoleStrategy.Type;

export const PackageManager = Schema.Literal(
  "pnpm", "npm", "yarn", "bun",
).annotations({ identifier: "PackageManager" });
export type PackageManager = typeof PackageManager.Type;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm vitest run src/schemas/Common.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write tests for AgentReport.ts**

Create `src/schemas/AgentReport.test.ts` with round-trip encode/decode
tests. Use `Schema.decodeUnknownSync` to parse a valid report object
and verify the output shape. Test edge cases: empty `failed` array,
optional `project` field, optional `coverage` field.

Reference the existing test patterns in `src/schemas.test.ts` for the
data shapes.

- [ ] **Step 6: Run test to verify it fails**

```bash
pnpm vitest run src/schemas/AgentReport.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Implement AgentReport.ts**

Create `src/schemas/AgentReport.ts` translating from
`src/schemas.ts`:

- `ReportErrorSchema` -> `ReportError` (Schema.Struct)
- `TestReportSchema` -> `TestReport` (Schema.Struct)
- `ModuleReportSchema` -> `ModuleReport` (Schema.Struct)
- `ReportSummarySchema` -> `ReportSummary` (Schema.Struct)
- `AgentReportSchema` -> `AgentReport` (Schema.Struct)

Import `TestState`, `TestRunReason` from `./Common.js`. Import
`CoverageReport` from `./Coverage.js` (create a stub first if needed).

Each schema exports both the schema and the inferred type:
`export type AgentReport = typeof AgentReport.Type;`

- [ ] **Step 8: Run test to verify it passes**

```bash
pnpm vitest run src/schemas/AgentReport.test.ts
```

Expected: PASS.

- [ ] **Step 9: Write tests for Coverage.ts**

Create `src/schemas/Coverage.test.ts`:

- Test that `scoped` defaults to `false` when absent
- Test that `scopedFiles` is optional
- Test round-trip with full coverage data

- [ ] **Step 10: Run test to verify it fails**

```bash
pnpm vitest run src/schemas/Coverage.test.ts
```

Expected: FAIL.

- [ ] **Step 11: Implement Coverage.ts**

Create `src/schemas/Coverage.ts`:

- `CoverageTotals` -- statements, branches, functions, lines (numbers)
- `FileCoverageReport` -- file, summary, uncoveredLines
- `CoverageReport` -- totals, threshold, scoped (optional with default
  false), scopedFiles (optional), lowCoverage, lowCoverageFiles

- [ ] **Step 12: Run test to verify it passes**

```bash
pnpm vitest run src/schemas/Coverage.test.ts
```

Expected: PASS.

- [ ] **Step 13: Write tests for CacheManifest.ts**

Create `src/schemas/CacheManifest.test.ts`:

- Test round-trip encode/decode
- Test nullable `lastRun` and `lastResult` fields

- [ ] **Step 14: Run test to verify it fails**

```bash
pnpm vitest run src/schemas/CacheManifest.test.ts
```

Expected: FAIL.

- [ ] **Step 15: Implement CacheManifest.ts**

Create `src/schemas/CacheManifest.ts` translating from `src/schemas.ts`.

- [ ] **Step 16: Run test to verify it passes**

```bash
pnpm vitest run src/schemas/CacheManifest.test.ts
```

Expected: PASS.

- [ ] **Step 17: Implement Options.ts**

Create `src/schemas/Options.ts`:

- `AgentReporterOptions` -- all 8 fields from Phase 1
- `AgentPluginOptions` -- mode, consoleStrategy (new), reporter
- `CoverageOptions` -- threshold, includeBareZero, coverageConsoleLimit
- `FormatterOptions` -- consoleOutput, coverageConsoleLimit, noColor,
  cacheFile

No separate test file needed -- these are configuration schemas
validated at boundaries.

- [ ] **Step 18: Run all schema tests**

```bash
pnpm vitest run src/schemas/
```

Expected: All pass.

- [ ] **Step 19: Commit**

```bash
git add src/schemas/
git commit -m "feat: migrate schemas from Zod to Effect Schema

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 3: Error Types

**Files:**

- Create: `src/errors/CacheError.ts`
- Create: `src/errors/DiscoveryError.ts`

- [ ] **Step 1: Create CacheError**

```typescript
import { Data } from "effect";

export class CacheError extends Data.TaggedError("CacheError")<{
  readonly operation: "read" | "write" | "mkdir";
  readonly path: string;
  readonly reason: string;
}> {}
```

- [ ] **Step 2: Create DiscoveryError**

```typescript
import { Data } from "effect";

export class DiscoveryError extends Data.TaggedError("DiscoveryError")<{
  readonly operation: "glob" | "read" | "stat";
  readonly path: string;
  readonly reason: string;
}> {}
```

- [ ] **Step 3: Commit**

```bash
git add src/errors/
git commit -m "feat: add CacheError and DiscoveryError tagged errors

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 4: Utils Split and Move

**Files:**

- Create: `src/utils/compress-lines.ts`
- Create: `src/utils/safe-filename.ts`
- Create: `src/utils/ansi.ts`
- Create: `src/utils/strip-console-reporters.ts`
- Create: `src/utils/detect-pm.ts`
- Create: `src/utils/format-console.ts`
- Create: `src/utils/format-gfm.ts`
- Create: `src/utils/build-report.ts`
- Create: test files for each
- Reference: `src/utils.ts`, `src/detect-pm.ts`,
  `src/formatters/console.ts`, `src/formatters/json.ts`,
  `src/formatters/gfm.ts`

This task moves existing code into the new file structure. Each
function keeps its existing logic but imports change to reference new
schema paths. Istanbul duck-type interfaces move to a local file or
inline in `build-report.ts`.

- [ ] **Step 1: Create each util file by copying content**

Copy (do NOT `git mv`) functions from `src/utils.ts` into individual
files. Write new files with the content, updating imports to use new
schema paths. The old files are deleted in Step 5 after all content
has been extracted.

- `compress-lines.ts` -- `compressLines()` function
- `safe-filename.ts` -- `safeFilename()` function
- `ansi.ts` -- `ansi()`, `stripAnsi()`, `AnsiOptions` interface
- `strip-console-reporters.ts` -- `stripConsoleReporters()`,
  `CONSOLE_REPORTERS` const

Move from `src/detect-pm.ts`:

- `detect-pm.ts` -- `FileSystemAdapter`, `detectPackageManager()`,
  `getRunCommand()`, `LOCKFILE_MAP`, `RUN_COMMANDS`

Copy from `src/formatters/`:

- `format-console.ts` -- from `src/formatters/console.ts`:
  `formatConsoleMarkdown()`, `relativePath()`, `getWorstMetric()`,
  `ConsoleFormatOptions`
- `format-gfm.ts` -- from `src/formatters/gfm.ts`: `formatGfm()`,
  `formatProjectBody()`, `worstCoverage()`, `pct()`
- `build-report.ts` -- from `src/formatters/json.ts`:
  `buildAgentReport()`, duck-typed Vitest interfaces
  (`VitestTestModule`, `VitestTestCase`, etc.), `mapErrors()`,
  `normalizeState()`

Update all imports to use new schema paths (e.g.,
`import type { AgentReport } from "../schemas/AgentReport.js"`).

Istanbul duck-type interfaces (`IstanbulCoverageMap`,
`IstanbulFileCoverage`, `IstanbulSummary`) do NOT go in schemas --
they stay as plain TypeScript interfaces. They are copied into
`src/layers/CoverageAnalyzerLive.ts` (Task 8) where they are used.

- [ ] **Step 2: Create test files**

Move existing tests from `src/utils.test.ts` into split files:

- `src/utils/compress-lines.test.ts`
- `src/utils/safe-filename.test.ts`
- `src/utils/ansi.test.ts`
- `src/utils/strip-console-reporters.test.ts`
- `src/utils/detect-pm.test.ts`

Move from `src/formatters/*.test.ts`:

- `src/utils/format-console.test.ts`
- `src/utils/format-gfm.test.ts`
- `src/utils/build-report.test.ts`

Update imports in test files.

- [ ] **Step 3: Run all util tests**

```bash
pnpm vitest run src/utils/
```

Expected: All pass. This is a pure move -- no logic changes.

- [ ] **Step 4: Remove `isGitHubActions` and `detectEnvironment`**

These functions from `src/utils.ts` are NOT moved -- they are replaced
by the `AgentDetection` service (Task 5). Do not create files for them.

- [ ] **Step 5: Delete old files**

```bash
rm src/utils.ts src/utils.test.ts
rm src/detect-pm.ts src/detect-pm.test.ts
rm -r src/formatters/
rm src/schemas.ts src/schemas.test.ts
rm src/types.ts
rm src/coverage.ts src/coverage.test.ts
```

- [ ] **Step 6: Run all tests to verify nothing broke**

```bash
pnpm vitest run src/utils/
```

Expected: All pass. Reporter and plugin tests will fail at this point
(they still import old paths) -- that's expected.

- [ ] **Step 7: Commit**

Stage specific paths (not `git add -A` to avoid capturing unfinished
work from other tasks):

```bash
git add src/utils/ src/formatters/ src/schemas.ts src/schemas.test.ts \
  src/types.ts src/utils.ts src/utils.test.ts src/coverage.ts \
  src/coverage.test.ts src/detect-pm.ts src/detect-pm.test.ts
git commit -m "refactor: split utils into individual files, move formatters

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 5: AgentDetection Service

**Files:**

- Create: `src/services/AgentDetection.ts`
- Create: `src/layers/AgentDetectionLive.ts`
- Create: `src/layers/AgentDetectionTest.ts`
- Create: `src/layers/AgentDetectionLive.test.ts`

- [ ] **Step 1: Write test for AgentDetectionLive**

Create `src/layers/AgentDetectionLive.test.ts`:

```typescript
import { Effect, Option } from "effect";
import { describe, expect, it } from "vitest";
import { AgentDetection } from "../services/AgentDetection.js";
import { AgentDetectionTest } from "./AgentDetectionTest.js";

const run = <A>(
  env: "agent" | "ci" | "human",
  effect: Effect.Effect<A, never, AgentDetection>,
) => Effect.runPromise(Effect.provide(effect, AgentDetectionTest.layer(env)));

describe("AgentDetection", () => {
  it("returns agent environment", async () => {
    const result = await run(
      "agent",
      Effect.flatMap(AgentDetection, (d) => d.environment),
    );
    expect(result).toBe("agent");
  });

  it("returns ci environment", async () => {
    const result = await run(
      "ci",
      Effect.flatMap(AgentDetection, (d) => d.environment),
    );
    expect(result).toBe("ci");
  });

  it("returns human environment", async () => {
    const result = await run(
      "human",
      Effect.flatMap(AgentDetection, (d) => d.environment),
    );
    expect(result).toBe("human");
  });

  it("isAgent is true for agent env", async () => {
    const result = await run(
      "agent",
      Effect.flatMap(AgentDetection, (d) => d.isAgent),
    );
    expect(result).toBe(true);
  });

  it("agentName returns name when provided", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(AgentDetection, (d) => d.agentName),
        AgentDetectionTest.layer("agent", "claude"),
      ),
    );
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result)).toBe("claude");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/layers/AgentDetectionLive.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create AgentDetection service tag**

Create `src/services/AgentDetection.ts`:

```typescript
import { Context, Effect, Option } from "effect";

export class AgentDetection extends Context.Tag(
  "vitest-agent-reporter/AgentDetection",
)<
  AgentDetection,
  {
    readonly isAgent: Effect.Effect<boolean>;
    readonly agentName: Effect.Effect<Option.Option<string>>;
    readonly isCI: Effect.Effect<boolean>;
    readonly environment: Effect.Effect<"agent" | "ci" | "human">;
  }
>() {}
```

- [ ] **Step 4: Create AgentDetectionTest layer**

Create `src/layers/AgentDetectionTest.ts`:

```typescript
import { Effect, Layer, Option } from "effect";
import { AgentDetection } from "../services/AgentDetection.js";

export const AgentDetectionTest = {
  layer: (
    env: "agent" | "ci" | "human",
    agentName?: string,
  ): Layer.Layer<AgentDetection> =>
    Layer.succeed(AgentDetection, {
      isAgent: Effect.succeed(env === "agent"),
      agentName: Effect.succeed(
        agentName ? Option.some(agentName) : Option.none(),
      ),
      isCI: Effect.succeed(env === "ci"),
      environment: Effect.succeed(env),
    }),
} as const;
```

- [ ] **Step 5: Create AgentDetectionLive layer**

Create `src/layers/AgentDetectionLive.ts`:

```typescript
import { Effect, Layer, Option } from "effect";
import { isAgent, agent } from "std-env";
import { AgentDetection } from "../services/AgentDetection.js";

const checkCI = (): boolean =>
  process.env.GITHUB_ACTIONS === "true" ||
  process.env.GITHUB_ACTIONS === "1" ||
  process.env.CI === "true";

export const AgentDetectionLive: Layer.Layer<AgentDetection> =
  Layer.succeed(AgentDetection, {
    isAgent: Effect.sync(() => isAgent),
    agentName: Effect.sync(() =>
      agent ? Option.some(agent) : Option.none(),
    ),
    isCI: Effect.sync(checkCI),
    environment: Effect.sync(() => {
      if (isAgent) return "agent" as const;
      if (checkCI()) return "ci" as const;
      return "human" as const;
    }),
  });
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run src/layers/AgentDetectionLive.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/AgentDetection.ts src/layers/AgentDetection*
git commit -m "feat: add AgentDetection service with std-env integration

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 6: CacheWriter Service

**Files:**

- Create: `src/services/CacheWriter.ts`
- Create: `src/layers/CacheWriterLive.ts`
- Create: `src/layers/CacheWriterTest.ts`
- Create: `src/layers/CacheWriterLive.test.ts`

- [ ] **Step 1: Write test for CacheWriterLive**

Test that `ensureDir` creates a directory, `writeReport` writes JSON,
and `writeManifest` writes manifest JSON. Use the test layer's state
container to verify writes.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/layers/CacheWriterLive.test.ts
```

- [ ] **Step 3: Create CacheWriter service tag**

Create `src/services/CacheWriter.ts` with the interface from the spec.

- [ ] **Step 4: Create CacheWriterTest layer**

Create `src/layers/CacheWriterTest.ts` with:

```typescript
export interface CacheWriterTestState {
  readonly files: Map<string, string>;
  readonly dirs: Array<string>;
}

export const CacheWriterTest = {
  empty: (): CacheWriterTestState => ({
    files: new Map(),
    dirs: [],
  }),
  layer: (state: CacheWriterTestState): Layer.Layer<CacheWriter> =>
    Layer.succeed(CacheWriter, {
      writeReport: (cacheDir, projectName, report) =>
        Effect.sync(() => {
          const path = `${cacheDir}/reports/${projectName}.json`;
          state.files.set(path, JSON.stringify(report, null, 2));
        }),
      writeManifest: (cacheDir, manifest) =>
        Effect.sync(() => {
          state.files.set(
            `${cacheDir}/manifest.json`,
            JSON.stringify(manifest, null, 2),
          );
        }),
      ensureDir: (cacheDir) =>
        Effect.sync(() => {
          state.dirs.push(cacheDir);
        }),
    }),
} as const;
```

- [ ] **Step 5: Create CacheWriterLive layer**

Create `src/layers/CacheWriterLive.ts`. Depends on `FileSystem` from
`@effect/platform`. Uses `fs.makeDirectory` (recursive) for
`ensureDir`, `fs.writeFileString` for writes. Encode reports using
`Schema.encodeUnknownSync(AgentReport)` then `JSON.stringify`.

Map `@effect/platform` errors to `CacheError` using `Effect.mapError`:

```typescript
import { FileSystem } from "@effect/platform";

// In layer implementation:
writeReport: (cacheDir, projectName, report) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const json = JSON.stringify(
      Schema.encodeUnknownSync(AgentReport)(report),
      null,
      2,
    );
    const path = `${cacheDir}/reports/${safeFilename(projectName)}.json`;
    yield* fs.writeFileString(path, json);
  }).pipe(
    Effect.mapError(
      (error) =>
        new CacheError({
          operation: "write",
          path: cacheDir,
          reason: String(error),
        }),
    ),
  ),
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run src/layers/CacheWriterLive.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/services/CacheWriter.ts src/layers/CacheWriter*
git commit -m "feat: add CacheWriter service with FileSystem layer

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 7: CacheReader Service

**Files:**

- Create: `src/services/CacheReader.ts`
- Create: `src/layers/CacheReaderLive.ts`
- Create: `src/layers/CacheReaderTest.ts`
- Create: `src/layers/CacheReaderLive.test.ts`

- [ ] **Step 1: Write test for CacheReaderLive**

Test `readManifest` returns `Option.some` when manifest exists,
`Option.none` when missing. Test `readReport` similarly. Test
`listReports` returns file names.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/layers/CacheReaderLive.test.ts
```

- [ ] **Step 3: Create CacheReader service tag**

Create `src/services/CacheReader.ts`.

- [ ] **Step 4: Create CacheReaderTest layer**

Provide seeded data via a `Map<string, string>` of path -> content.

- [ ] **Step 5: Create CacheReaderLive layer**

Depends on `FileSystem`. Uses `fs.readFileString`, catches
file-not-found as `Option.none`, other errors as `CacheError`.
Decodes JSON via `Schema.decodeUnknownSync`.

`@effect/platform` FileSystem errors are `PlatformError` with a
`SystemError` variant containing a `reason` field. Use
`Effect.catchTag` to distinguish:

```typescript
readManifest: (cacheDir) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const content = yield* fs.readFileString(
      `${cacheDir}/manifest.json`,
    );
    const data = Schema.decodeUnknownSync(CacheManifest)(
      JSON.parse(content),
    );
    return Option.some(data);
  }).pipe(
    Effect.catchTag("SystemError", (error) =>
      error.reason === "NotFound"
        ? Effect.succeed(Option.none())
        : Effect.fail(
            new CacheError({
              operation: "read",
              path: `${cacheDir}/manifest.json`,
              reason: String(error),
            }),
          ),
    ),
    Effect.catchAll((error) =>
      Effect.fail(
        new CacheError({
          operation: "read",
          path: cacheDir,
          reason: String(error),
        }),
      ),
    ),
  ),
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm vitest run src/layers/CacheReaderLive.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/services/CacheReader.ts src/layers/CacheReader*
git commit -m "feat: add CacheReader service with FileSystem layer

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 8: CoverageAnalyzer Service (+ Bug Fixes)

**Files:**

- Create: `src/services/CoverageAnalyzer.ts`
- Create: `src/layers/CoverageAnalyzerLive.ts`
- Create: `src/layers/CoverageAnalyzerTest.ts`
- Create: `src/layers/CoverageAnalyzerLive.test.ts`
- Reference: `src/coverage.ts` (existing logic to migrate)

This task includes both bug fixes:

1. `includeBareZero` no-op at threshold 0
2. New `processScoped` method for partial runs

- [ ] **Step 1: Write test for includeBareZero fix**

In `src/layers/CoverageAnalyzerLive.test.ts`, test that:

- `includeBareZero: true` with `threshold: 0` includes bare-zero files
- `includeBareZero: false` with `threshold: 0` excludes bare-zero files

Use a mock istanbul CoverageMap (same duck-type pattern as
`src/coverage.test.ts`).

- [ ] **Step 2: Write test for processScoped**

Test that `processScoped` with a subset of `testedFiles`:

- Only flags threshold violations for files in the tested set
- Sets `scoped: true` in the result
- Populates `scopedFiles` with the input files

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run src/layers/CoverageAnalyzerLive.test.ts
```

- [ ] **Step 4: Create CoverageAnalyzer service tag**

Create `src/services/CoverageAnalyzer.ts`.

- [ ] **Step 5: Create CoverageAnalyzerTest layer**

Returns canned `Option.some(CoverageReport)` or `Option.none()`.

- [ ] **Step 6: Create CoverageAnalyzerLive layer**

Migrate logic from `src/coverage.ts`. Copy the istanbul duck-type
interfaces (`IstanbulCoverageMap`, `IstanbulFileCoverage`,
`IstanbulSummary`) from `src/schemas.ts` into this file as local
TypeScript interfaces. These are NOT Effect Schemas -- they are
structural interfaces used for runtime duck-type checks only.
Also copy `isIstanbulCoverageMap()` guard from `src/coverage.ts`.

Key changes from Phase 1:

- Fix `includeBareZero` logic:

```typescript
if (isBareZero && !includeBareZero) continue;
if (!isBareZero && !(worstMetric < threshold)) continue;
// bare-zero files with includeBareZero=true always pass through
```

- Add `processScoped`: same as `process` but accepts `testedFiles`
  array and only flags violations for files in that set. Sets
  `scoped: true` and `scopedFiles` in the result.

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm vitest run src/layers/CoverageAnalyzerLive.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add src/services/CoverageAnalyzer.ts src/layers/CoverageAnalyzer*
git commit -m "feat: add CoverageAnalyzer service with scoped coverage and bug fixes

Fixes includeBareZero no-op at threshold 0.
Adds processScoped for partial test runs.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 9: ProjectDiscovery Service

**Files:**

- Create: `src/services/ProjectDiscovery.ts`
- Create: `src/layers/ProjectDiscoveryLive.ts`
- Create: `src/layers/ProjectDiscoveryTest.ts`
- Create: `src/layers/ProjectDiscoveryLive.test.ts`

- [ ] **Step 1: Write test for discoverTestFiles**

Test that it finds `*.test.ts` and `*.spec.ts` files in a directory
structure.

- [ ] **Step 2: Write test for mapTestToSource**

Test conventions:

- `src/foo.test.ts` -> `["src/foo.ts"]`
- `src/foo.spec.ts` -> `["src/foo.ts"]`
- `src/foo.test.ts` where `src/foo.ts` doesn't exist -> `[]`

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm vitest run src/layers/ProjectDiscoveryLive.test.ts
```

- [ ] **Step 4: Create ProjectDiscovery service tag**

- [ ] **Step 5: Create test and live layers**

Live layer depends on `FileSystem` from `@effect/platform`. Uses
`fs.readDirectory` recursively to list files, then filters by
`.test.ts`/`.spec.ts` suffix (not a true glob -- simple string
matching is sufficient for test file discovery). Uses `fs.stat` for
source file existence checks in `mapTestToSource`.

Define `TestFileEntry` as a simple interface in the service file:

```typescript
export interface TestFileEntry {
  readonly testFile: string;    // relative path to test file
  readonly sourceFiles: ReadonlyArray<string>; // mapped source files
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm vitest run src/layers/ProjectDiscoveryLive.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/services/ProjectDiscovery.ts src/layers/ProjectDiscovery*
git commit -m "feat: add ProjectDiscovery service for test file mapping

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 10: Merged Layers

**Files:**

- Create: `src/layers/ReporterLive.ts`
- Create: `src/layers/CliLive.ts`

- [ ] **Step 1: Create ReporterLive**

```typescript
import { Layer } from "effect";
import { NodeFileSystem } from "@effect/platform-node";
import { CacheWriterLive } from "./CacheWriterLive.js";
import { CoverageAnalyzerLive } from "./CoverageAnalyzerLive.js";

export const ReporterLive = Layer.mergeAll(
  CacheWriterLive,
  CoverageAnalyzerLive,
).pipe(Layer.provideMerge(NodeFileSystem.layer));
```

- [ ] **Step 2: Create CliLive**

```typescript
import { Layer } from "effect";
import { NodeFileSystem } from "@effect/platform-node";
import { CacheReaderLive } from "./CacheReaderLive.js";
import { ProjectDiscoveryLive } from "./ProjectDiscoveryLive.js";

export const CliLive = Layer.mergeAll(
  CacheReaderLive,
  ProjectDiscoveryLive,
).pipe(Layer.provideMerge(NodeFileSystem.layer));
```

- [ ] **Step 3: Smoke test merged layers**

Write a brief test in `src/layers/ReporterLive.test.ts` that builds
the layer and resolves a service to verify wiring:

```typescript
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { CacheWriter } from "../services/CacheWriter.js";
import { ReporterLive } from "./ReporterLive.js";

describe("ReporterLive", () => {
  it("provides CacheWriter and CoverageAnalyzer", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(CacheWriter, () => Effect.succeed("ok")),
        ReporterLive,
      ),
    );
    expect(result).toBe("ok");
  });
});
```

- [ ] **Step 4: Run smoke test**

```bash
pnpm vitest run src/layers/ReporterLive.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/layers/ReporterLive.ts src/layers/CliLive.ts
git commit -m "feat: add ReporterLive and CliLive merged layers

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 11: Reporter Rewrite

**Files:**

- Modify: `src/reporter.ts`
- Modify: `src/reporter.test.ts`

- [ ] **Step 1: Update reporter tests**

Update `src/reporter.test.ts` to:

- Import from new schema/service paths
- Use `CacheWriterTest` state container to verify writes
- Test that unhandledErrors appear in ALL project reports (bug fix)
- Remove Zod codec assertions, use Effect Schema decode

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/reporter.test.ts
```

- [ ] **Step 3: Rewrite reporter.ts**

Update `src/reporter.ts`:

- Replace Zod imports with Effect Schema imports
- Import `CacheWriter`, `CoverageAnalyzer` from services
- Import `ReporterLive` from layers
- Import `formatConsoleMarkdown` from `./utils/format-console.js`
- Import `formatGfm` from `./utils/format-gfm.js`
- Import `buildAgentReport` from `./utils/build-report.js`
- Fix unhandledErrors: pass `unhandledErrors` to ALL projects (not
  just `"default"`)

The `onTestRunEnd` method builds an Effect pipeline:

```typescript
async onTestRunEnd(testModules, unhandledErrors, reason) {
  const program = Effect.gen(function* () {
    const writer = yield* CacheWriter;
    const analyzer = yield* CoverageAnalyzer;
    const fs = yield* FileSystem.FileSystem;

    yield* writer.ensureDir(`${this.options.cacheDir}/reports`);

    // Group modules by project
    const projectGroups = new Map<string, VitestTestModule[]>();
    // ... same grouping logic as Phase 1 ...

    // Detect partial run: compare module count to project config
    const testedFiles = testModules.map((m) => m.relativeModuleId);
    const isPartialRun = /* check if modules are subset of project globs */;

    // Process coverage (scoped or full)
    const coverageReport = isPartialRun
      ? yield* analyzer.processScoped(
          this.coverage, this.options, testedFiles,
        )
      : yield* analyzer.process(this.coverage, this.options);

    // Build reports, write cache, format console, write GFM
    for (const [name, modules] of projectGroups) {
      const report = buildAgentReport(
        modules, unhandledErrors, reason, this.options, name,
      );
      if (coverageReport) report.coverage = coverageReport;
      yield* writer.writeReport(this.options.cacheDir, name, report);
      // ... console + GFM output ...
    }

    // Write manifest
    yield* writer.writeManifest(this.options.cacheDir, manifest);

    // GFM append (if enabled)
    if (this.options.githubActions && this.options.githubSummaryFile) {
      const gfm = formatGfm(reports);
      yield* fs.writeFileString(
        this.options.githubSummaryFile, gfm,
        { flag: "a" },
      );
    }
  });

  await Effect.runPromise(
    program.pipe(Effect.provide(ReporterLive)),
  ).catch((err) => {
    process.stderr.write(`vitest-agent-reporter: ${err}\n`);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/reporter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/reporter.ts src/reporter.test.ts
git commit -m "feat: rewrite reporter to use Effect services

Fixes unhandledErrors dropped in monorepo projects.

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 12: Plugin Rewrite

**Files:**

- Modify: `src/plugin.ts`
- Modify: `src/plugin.test.ts`

- [ ] **Step 1: Update plugin tests**

Update `src/plugin.test.ts`:

- Test `consoleStrategy: "complement"` (default) -- does NOT strip
  reporters
- Test `consoleStrategy: "own"` in agent mode -- DOES strip reporters
- Test `consoleStrategy: "own"` in silent mode -- does NOT strip
- Test complement mode with `agent` reporter missing from chain --
  logs warning
- Use `AgentDetectionTest` for environment mocking
- Remove old `detectEnvironment` env var tests (replaced by std-env)

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run src/plugin.test.ts
```

- [ ] **Step 3: Rewrite plugin.ts**

Update `src/plugin.ts`:

- Import `AgentDetection` service and `AgentDetectionLive` layer
- Replace `detectEnvironment()` with Effect service call
- Make `configureVitest` async, use `Effect.runPromise`
- Add `consoleStrategy` option handling
- Import from new schema/util paths

Add complement mode agent reporter check:

```typescript
// After determining env and strategy:
if (env === "agent" && strategy === "complement") {
  const hasAgentReporter = vitest.config.reporters.some(
    (r) =>
      r === "agent" ||
      (Array.isArray(r) && r[0] === "agent"),
  );
  if (!hasAgentReporter) {
    process.stderr.write(
      "[vitest-agent-reporter] Warning: consoleStrategy is " +
      '"complement" but Vitest\'s built-in "agent" reporter ' +
      "is not in the reporter chain. Console output may be " +
      "verbose. Add 'agent' to your reporters or set " +
      'consoleStrategy: "own".\n',
    );
  }
}
```

Add `resolveConsoleOutput` and `resolveGithubActions` helper functions
that implement the behavior matrix from the spec. Test all matrix
combinations including CI+own (console silent, GFM ours).

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run src/plugin.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/plugin.ts src/plugin.test.ts
git commit -m "feat: add hybrid consoleStrategy, switch to std-env via AgentDetection

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 13: Public API

**Files:**

- Modify: `src/index.ts`

- [ ] **Step 1: Rewrite src/index.ts**

Replace all exports with new paths per the spec:

```typescript
// Reporter and Plugin
export { AgentReporter } from "./reporter.js";
export { AgentPlugin } from "./plugin.js";

// Schemas
export {
  AgentReport,
  ModuleReport,
  TestReport,
  ReportError,
} from "./schemas/AgentReport.js";
export type {
  AgentReport as AgentReportType,
  ModuleReport as ModuleReportType,
  TestReport as TestReportType,
  ReportError as ReportErrorType,
} from "./schemas/AgentReport.js";
export {
  TestState,
  TestRunReason,
  ConsoleOutputMode,
  PluginMode,
  ConsoleStrategy,
} from "./schemas/Common.js";
export {
  CacheManifest,
  CacheManifestEntry,
} from "./schemas/CacheManifest.js";
export {
  CoverageReport,
  CoverageTotals,
  FileCoverageReport,
} from "./schemas/Coverage.js";
export {
  AgentReporterOptions,
  AgentPluginOptions,
} from "./schemas/Options.js";

// Services (for programmatic cache access)
export { CacheReader } from "./services/CacheReader.js";
export { CacheReaderLive } from "./layers/CacheReaderLive.js";

// Errors
export { CacheError } from "./errors/CacheError.js";
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run all tests**

```bash
pnpm vitest run
```

Expected: All pass. This is the integration checkpoint -- everything
from Tasks 2-12 must work together.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: update public API exports for Phase 2

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 14: CLI Lib Functions

**Files:**

- Create: `src/cli/lib/resolve-cache-dir.ts`
- Create: `src/cli/lib/format-status.ts`
- Create: `src/cli/lib/format-overview.ts`
- Create: `src/cli/lib/format-coverage.ts`
- Create: test files for each

- [ ] **Step 1: Write test for resolve-cache-dir**

Test that it checks `.vitest-agent-reporter/manifest.json` first, then
`node_modules/.vite/vitest-agent-reporter/manifest.json`, returns the
first path containing a manifest.

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm vitest run src/cli/lib/resolve-cache-dir.test.ts
```

- [ ] **Step 3: Implement resolve-cache-dir.ts**

Uses `FileSystem` from `@effect/platform` to check existence. Returns
`Effect<string, CacheError>`.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Write test for format-status**

Test that it formats a `CacheManifest` into markdown table with
project names, last run times, results, and failing project details.

- [ ] **Step 6: Implement format-status.ts**

Pure function: `formatStatus(manifest, reports) => string`. Takes
manifest and optionally loaded failing reports. Returns markdown.

- [ ] **Step 7: Run test to verify it passes**

- [ ] **Step 8: Write test for format-overview**

Test file-to-test mapping output, project listing, run commands.

- [ ] **Step 9: Implement format-overview.ts**

Pure function: `formatOverview(manifest, testFiles, pm) => string`.

- [ ] **Step 10: Run test to verify it passes**

- [ ] **Step 11: Write test for format-coverage**

Test coverage gap table formatting with threshold filtering.

- [ ] **Step 12: Implement format-coverage.ts**

Pure function: `formatCoverage(reports, threshold) => string`.

- [ ] **Step 13: Run all CLI lib tests**

```bash
pnpm vitest run src/cli/lib/
```

Expected: All pass.

- [ ] **Step 14: Commit**

```bash
git add src/cli/lib/
git commit -m "feat: add CLI lib functions for status, overview, coverage formatting

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 15: CLI Commands and Bin

**Files:**

- Create: `src/cli/index.ts`
- Create: `src/cli/commands/status.ts`
- Create: `src/cli/commands/overview.ts`
- Create: `src/cli/commands/coverage.ts`

- [ ] **Step 1: Create status command**

Create `src/cli/commands/status.ts`:

```typescript
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { CacheReader } from "../../services/CacheReader.js";
import { formatStatus } from "../lib/format-status.js";
import { resolveCacheDir } from "../lib/resolve-cache-dir.js";

const cacheDirOption = Options.text("cache-dir").pipe(
  Options.withAlias("d"),
  Options.withDescription("Cache directory path"),
  Options.optional,
);

export const statusCommand = Command.make(
  "status",
  { cacheDir: cacheDirOption },
  ({ cacheDir }) =>
    Effect.gen(function* () {
      const reader = yield* CacheReader;
      const dir = cacheDir ?? (yield* resolveCacheDir);
      const manifest = yield* reader.readManifest(dir);
      // Load failing reports, format, print to stdout
      const output = formatStatus(/* ... */);
      yield* Effect.sync(() => process.stdout.write(output + "\n"));
    }),
);
```

- [ ] **Step 2: Create overview command**

Similar pattern. Uses `ProjectDiscovery` for file mapping and
`CacheReader` for manifest/reports. Delegates to `formatOverview`.

- [ ] **Step 3: Create coverage command**

Similar pattern with `--threshold` option. Delegates to
`formatCoverage`.

- [ ] **Step 4: Create CLI entry point**

Create `src/cli/index.ts`:

```typescript
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { CliLive } from "../layers/CliLive.js";
import { statusCommand } from "./commands/status.js";
import { overviewCommand } from "./commands/overview.js";
import { coverageCommand } from "./commands/coverage.js";

const rootCommand = Command.make("vitest-agent-reporter").pipe(
  Command.withSubcommands([
    statusCommand,
    overviewCommand,
    coverageCommand,
  ]),
);

const cli = Command.run(rootCommand, {
  name: "vitest-agent-reporter",
  version: "0.0.0",
});

export function runCli(): void {
  const main = Effect.suspend(() => cli(process.argv)).pipe(
    Effect.provide(CliLive),
  );
  NodeRuntime.runMain(main);
}
```

- [ ] **Step 5: Verify CLI runs**

```bash
npx tsx src/cli/index.ts --help
```

Expected: Shows help with status, overview, coverage subcommands.

- [ ] **Step 6: Commit**

```bash
git add src/cli/
git commit -m "feat: add CLI with status, overview, coverage commands

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

### Task 16: Integration Tests and Cleanup

**Files:**

- Modify: `src/reporter.test.ts` (integration scenarios)
- Modify: `src/plugin.test.ts` (integration scenarios)

- [ ] **Step 1: Run full test suite**

```bash
pnpm vitest run
```

Verify all tests pass.

- [ ] **Step 2: Run typecheck**

```bash
pnpm run typecheck
```

Verify no type errors.

- [ ] **Step 3: Run linter**

```bash
pnpm run lint:fix
```

Fix any lint issues.

- [ ] **Step 4: Run build**

```bash
pnpm run build
```

Verify build succeeds with new files and bin entry.

- [ ] **Step 5: Verify bin works after build**

```bash
node dist/dev/bin/vitest-agent-reporter.js --help
```

Or wherever the builder places the compiled bin.

- [ ] **Step 6: Update vitest.config.ts**

If the project's own `vitest.config.ts` uses `AgentPlugin()`, verify
it still works with the new options. No `consoleStrategy` change
needed (defaults to `"complement"`).

- [ ] **Step 7: Clean up any remaining old file references**

Search for any remaining imports of old paths:

```bash
grep -r "from.*schemas\.js" src/ --include="*.ts"
grep -r "from.*types\.js" src/ --include="*.ts"
grep -r "from.*coverage\.js" src/ --include="*.ts"
grep -r "from.*formatters/" src/ --include="*.ts"
```

Fix any found.

- [ ] **Step 8: Final test run**

```bash
pnpm vitest run
pnpm run typecheck
pnpm run lint
```

All must pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: integration tests and cleanup for Phase 2

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
