# Zod Schemas and Codecs

All data structures in `vitest-agent-reporter` are defined as
[Zod v4](https://zod.dev/) schemas. TypeScript types are inferred from
schemas via `z.infer<>`. Codecs provide JSON string encode/decode for
reading and writing report files.

## Available Schemas

| Schema | Description |
| --- | --- |
| `AgentReportSchema` | Complete per-project test report |
| `ReportSummarySchema` | Aggregate test run statistics |
| `ModuleReportSchema` | Test module (file) and its test cases |
| `TestReportSchema` | Individual test case result |
| `ReportErrorSchema` | Error with message, stack, and diff |
| `CoverageReportSchema` | Coverage report with totals and low-coverage files |
| `CoverageTotalsSchema` | Aggregate coverage percentages |
| `FileCoverageReportSchema` | Per-file coverage with uncovered line ranges |
| `CacheManifestSchema` | Root manifest indexing all project reports |
| `CacheManifestEntrySchema` | Single project entry in the manifest |
| `TestClassificationSchema` | Failure classification enum |
| `AgentReporterOptionsSchema` | Reporter configuration options |
| `AgentPluginOptionsSchema` | Plugin configuration options |

## Available Codecs

| Codec | Input | Output |
| --- | --- | --- |
| `AgentReportCodec` | JSON string | Validated `AgentReport` |
| `CacheManifestCodec` | JSON string | Validated `CacheManifest` |

## Using Codecs

Codecs provide bidirectional transformation between JSON strings on disk
and validated TypeScript objects.

### Decoding (reading a report file)

```typescript
import { readFile } from "node:fs/promises";
import { AgentReportCodec } from "vitest-agent-reporter";
import type { AgentReport } from "vitest-agent-reporter";

const json = await readFile(".vitest-agent-reporter/reports/default.json", "utf-8");
const report: AgentReport = AgentReportCodec.decode(json);

console.log(report.summary.failed); // number of failed tests
console.log(report.failedFiles);    // array of failing file paths
```

### Encoding (writing a report file)

```typescript
import { writeFile } from "node:fs/promises";
import { AgentReportCodec } from "vitest-agent-reporter";
import type { AgentReport } from "vitest-agent-reporter";

const report: AgentReport = {
  timestamp: new Date().toISOString(),
  reason: "passed",
  summary: { total: 5, passed: 5, failed: 0, skipped: 0, duration: 120 },
  failed: [],
  unhandledErrors: [],
  failedFiles: [],
};

const json: string = AgentReportCodec.encode(report);
await writeFile("report.json", json);
```

### Reading the manifest

```typescript
import { readFile } from "node:fs/promises";
import { CacheManifestCodec } from "vitest-agent-reporter";
import type { CacheManifest } from "vitest-agent-reporter";

const json = await readFile(
  "node_modules/.cache/vitest-agent-reporter/manifest.json",
  "utf-8",
);
const manifest: CacheManifest = CacheManifestCodec.decode(json);

// Find projects with failures
const failing = manifest.projects.filter((p) => p.lastResult === "failed");
for (const entry of failing) {
  console.log(`${entry.project}: ${entry.reportFile}`);
}
```

## Type Inference

All TypeScript types are inferred from schemas. Import them as types:

```typescript
import type {
  AgentReport,
  AgentReporterOptions,
  CacheManifest,
  CacheManifestEntry,
  CoverageReport,
  CoverageTotals,
  FileCoverageReport,
  ModuleReport,
  ReportError,
  ReportSummary,
  TestClassification,
  TestReport,
} from "vitest-agent-reporter";
```

You can also infer types directly from schemas:

```typescript
import { z } from "zod/v4";
import { AgentReportSchema } from "vitest-agent-reporter";

type AgentReport = z.infer<typeof AgentReportSchema>;
```

## Validating Report Files

Use schemas directly for custom validation:

```typescript
import { readFile } from "node:fs/promises";
import { AgentReportSchema } from "vitest-agent-reporter";

const raw = await readFile(".vitest-agent-reporter/reports/default.json", "utf-8");
const data = JSON.parse(raw);

const result = AgentReportSchema.safeParse(data);
if (result.success) {
  console.log("Valid report:", result.data.summary);
} else {
  console.error("Invalid report:", result.error.issues);
}
```

## Schema Reference

### AgentReport

The top-level report written per project:

```typescript
{
  timestamp: string;          // ISO 8601
  project?: string;           // project name (monorepo only)
  reason: "passed" | "failed" | "interrupted";
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;         // wall-clock milliseconds
  };
  failed: ModuleReport[];    // only modules with failures
  unhandledErrors: ReportError[];
  failedFiles: string[];     // quick index of relative paths
  coverage?: CoverageReport; // present when coverage enabled
}
```

### ModuleReport

A test file and its contained tests:

```typescript
{
  file: string;              // project-relative path
  state: "passed" | "failed" | "skipped" | "pending";
  duration?: number;
  errors?: ReportError[];    // module-level errors (syntax, top-level)
  tests: TestReport[];
}
```

### TestReport

An individual test case:

```typescript
{
  name: string;              // test name
  fullName: string;          // "Suite > nested > test name"
  state: "passed" | "failed" | "skipped" | "pending";
  duration?: number;
  flaky?: boolean;           // passed after retry
  slow?: boolean;            // exceeded slowTestThreshold
  errors?: ReportError[];
  classification?: TestClassification;  // Phase 3
}
```

### ReportError

```typescript
{
  message: string;
  stack?: string;            // Vitest internals stripped
  diff?: string;             // expected/received comparison
}
```

### CoverageReport

```typescript
{
  totals: {
    statements: number;      // percentage 0-100
    branches: number;
    functions: number;
    lines: number;
  };
  threshold: number;         // configured threshold
  lowCoverage: FileCoverageReport[];  // files below threshold
  lowCoverageFiles: string[];         // quick index of paths
}
```

### FileCoverageReport

```typescript
{
  file: string;
  summary: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  uncoveredLines: string;    // compressed range: "1-3,5,10-12"
}
```

### CacheManifest

```typescript
{
  updatedAt: string;         // ISO 8601
  cacheDir: string;
  projects: CacheManifestEntry[];
}
```

### CacheManifestEntry

```typescript
{
  project: string;           // project name
  reportFile: string;        // relative path: "reports/default.json"
  historyFile?: string;      // Phase 3
  lastRun: string | null;    // ISO 8601 or null before first run
  lastResult: "passed" | "failed" | "interrupted" | null;
}
```

### TestClassification

Failure history classification (Phase 3):

```typescript
"stable" | "new-failure" | "persistent" | "flaky" | "recovered"
```
