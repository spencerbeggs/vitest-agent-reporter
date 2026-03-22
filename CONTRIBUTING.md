# Contributing to vitest-agent-reporter

Thank you for your interest in contributing! This document provides guidelines
and instructions for development.

## Prerequisites

- Node.js 24+
- pnpm 10+

## Development Setup

```bash
# Clone the repository
git clone https://github.com/spencerbeggs/vitest-agent-reporter.git
cd vitest-agent-reporter

# Install dependencies
pnpm install

# Build all outputs
pnpm run build

# Run tests
pnpm run test
```

## Project Structure

This is a pnpm monorepo. The publishable package lives under `package/`,
with example workspaces under `examples/`.

```text
vitest-agent-reporter/
├── package/                    # Main package workspace
│   ├── src/
│   │   ├── index.ts                # Public API re-exports
│   │   ├── reporter.ts             # AgentReporter class (Vitest adapter)
│   │   ├── plugin.ts               # AgentPlugin function
│   │   ├── cli/
│   │   │   ├── index.ts            # CLI entry point (runCli)
│   │   │   ├── commands/           # Thin command wrappers (status, overview, coverage, history)
│   │   │   └── lib/                # Testable formatting logic for each command
│   │   ├── services/
│   │   │   ├── AgentDetection.ts   # std-env wrapper for environment detection
│   │   │   ├── CacheWriter.ts      # Write reports, manifest, and history to disk
│   │   │   ├── CacheReader.ts      # Read reports, manifest, and history from disk
│   │   │   ├── CoverageAnalyzer.ts # Coverage processing with scoped support
│   │   │   ├── HistoryTracker.ts   # Test classification from failure history
│   │   │   └── ProjectDiscovery.ts # Test file discovery via globs
│   │   ├── layers/
│   │   │   ├── *Live.ts            # Production implementations (Node.js I/O)
│   │   │   ├── *Test.ts            # Test implementations (mock state containers)
│   │   │   ├── ReporterLive.ts     # Merged layer for reporter runtime
│   │   │   └── CliLive.ts          # Merged layer for CLI runtime
│   │   ├── errors/
│   │   │   ├── CacheError.ts       # Data.TaggedError for file I/O failures
│   │   │   └── DiscoveryError.ts   # Data.TaggedError for project discovery
│   │   ├── schemas/
│   │   │   ├── AgentReport.ts      # Report, module, and test schemas
│   │   │   ├── CacheManifest.ts    # Manifest and entry schemas
│   │   │   ├── Coverage.ts         # Coverage report and totals schemas
│   │   │   ├── History.ts          # History record, test history, test run schemas
│   │   │   ├── Options.ts          # Reporter and plugin option schemas
│   │   │   └── Common.ts           # Shared literals (TestState, TestRunReason, etc.)
│   │   └── utils/
│   │       ├── compress-lines.ts   # Line range compression
│   │       ├── safe-filename.ts    # Filename sanitization
│   │       ├── ansi.ts             # ANSI color helpers
│   │       ├── strip-console-reporters.ts
│   │       ├── detect-pm.ts        # Package manager detection
│   │       ├── build-report.ts     # Report builder (pure function)
│   │       ├── format-console.ts   # Console markdown formatter (pure function)
│   │       └── format-gfm.ts       # GitHub Actions GFM formatter (pure function)
│   ├── bin/
│   │   └── vitest-agent-reporter.js  # CLI shebang wrapper
│   ├── rslib.config.ts            # Rslib build configuration
│   └── package.json               # Package manifest
├── examples/                   # Example workspaces
├── docs/                       # User-facing documentation
├── lib/configs/                # Shared tool configuration
├── pnpm-workspace.yaml         # Workspace definitions
└── .claude/design/             # Architecture design documents
```

## Architecture Patterns

### Effect Services

The project uses [Effect](https://effect.website/) for dependency injection
and service composition. Key patterns:

- **Services** (`package/src/services/`) define interfaces via `Context.Tag`
- **Live layers** (`package/src/layers/*Live.ts`) provide production
  implementations using `@effect/platform` for file I/O
- **Test layers** (`package/src/layers/*Test.ts`) provide mock
  implementations with state containers for assertions
- **Schemas** (`package/src/schemas/`) use Effect Schema (not Zod) for data
  validation and serialization

### Reporter Integration

The `AgentReporter` class implements Vitest's Reporter interface. Each
lifecycle hook (`onTestRunEnd`) builds a scoped effect and runs it with
`Effect.runPromise`, providing the `ReporterLive` layer inline. This avoids
managed runtime lifecycle concerns.

### Pure Functions

Formatters (`format-console.ts`, `format-gfm.ts`) and utilities
(`compress-lines.ts`, `safe-filename.ts`) are plain functions, not Effect
services. They are trivially testable without layers.

## Available Scripts

| Script | Description |
| --- | --- |
| `pnpm run build` | Build dev + prod outputs via Turbo |
| `pnpm run test` | Run all tests |
| `pnpm run test:watch` | Run tests in watch mode |
| `pnpm run test:coverage` | Run tests with v8 coverage |
| `pnpm run lint` | Check code with Biome |
| `pnpm run lint:fix` | Auto-fix lint issues |
| `pnpm run lint:md` | Check markdown with markdownlint |
| `pnpm run lint:md:fix` | Auto-fix markdown issues |
| `pnpm run typecheck` | Type-check via Turbo (runs tsgo) |

## Code Quality

This project uses:

- **Biome** for linting and formatting (config in `biome.jsonc`)
- **Commitlint** for enforcing conventional commits with DCO signoff
- **Husky** for Git hooks
- **markdownlint** for markdown formatting

### Commit Format

All commits must follow
[Conventional Commits](https://conventionalcommits.org) and include a DCO
signoff:

```text
feat: add new formatter option

Signed-off-by: Your Name <your.email@example.com>
```

### Pre-commit Hooks

| Hook | Action |
| --- | --- |
| `pre-commit` | Runs lint-staged (Biome on staged files) |
| `commit-msg` | Validates commit message format via commitlint |
| `pre-push` | Runs tests for affected packages |

## Testing

Tests use [Vitest](https://vitest.dev) with v8 coverage and the `forks` pool.

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage

# Run a specific test file
pnpm vitest run package/src/utils/compress-lines.test.ts
```

### Testing Effect Services

Service tests use the state-container pattern with test layers:

```typescript
import { Effect } from "effect";
import { CacheReader } from "../services/CacheReader.js";
import { CacheReaderTest } from "../layers/CacheReaderTest.js";

const testLayer = CacheReaderTest.layer(/* mock state */);

const run = <A, E>(effect: Effect.Effect<A, E, CacheReader>) =>
  Effect.runPromise(Effect.provide(effect, testLayer));

it("reads manifest from cache dir", async () => {
  const result = await run(
    Effect.flatMap(CacheReader, (svc) => svc.readManifest("/tmp/cache")),
  );
  // assertions...
});
```

Reporter integration tests compose test layers:

```typescript
const TestReporterLive = Layer.mergeAll(
  CacheWriterTest.layer(writeState),
  CoverageAnalyzerTest.layer(),
);
```

CLI commands are thin wrappers -- logic lives in `cli/lib/` and is tested
as pure functions.

## TypeScript

- Extends `@savvy-web/rslib-builder/tsconfig/ecma/lib.json`
- Type-checking via `tsgo --noEmit`
- Strict mode with `exactOptionalPropertyTypes`

### Import Conventions

```typescript
// Use .js extensions for relative imports (ESM requirement)
import { compressLines } from "./utils/compress-lines.js";

// Use node: protocol for Node.js built-ins
import { mkdir } from "node:fs/promises";

// Separate type imports
import type { AgentReport } from "./schemas/AgentReport.js";
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes following TDD (write tests first)
4. Run tests: `pnpm run test`
5. Run linting: `pnpm run lint:fix`
6. Run typecheck: `pnpm run typecheck`
7. Commit with conventional format and DCO signoff
8. Push and open a pull request

## License

By contributing, you agree that your contributions will be licensed under the
MIT License.
