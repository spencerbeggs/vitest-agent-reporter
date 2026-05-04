# Contributing to vitest-agent-reporter

Thank you for your interest in contributing! This document provides guidelines
and instructions for development.

## Prerequisites

- Node.js 22+ (the development environment uses 24.x; published
  packages declare `node >= 22`)
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

This is a pnpm monorepo. As of 2.0 the publishable code is split into
four packages under `packages/`, with example workspaces under
`examples/` and a Claude Code plugin under `plugin/`.

```text
vitest-agent-reporter/
├── packages/
│   ├── reporter/               # vitest-agent-reporter (Vitest plugin + reporter)
│   │   └── src/
│   │       ├── index.ts            # Public API (re-exports from shared)
│   │       ├── reporter.ts         # AgentReporter class
│   │       ├── plugin.ts           # AgentPlugin function
│   │       └── layers/             # Reporter-specific Effect layers
│   ├── shared/                 # vitest-agent-sdk (data layer + services)
│   │   └── src/
│   │       ├── schemas/            # Effect Schema definitions
│   │       ├── services/           # Effect Context.Tag definitions
│   │       ├── layers/             # Live + test layer implementations
│   │       ├── errors/             # Tagged error types
│   │       ├── formatters/         # markdown, gfm, json, silent
│   │       ├── migrations/         # SQLite migrations
│   │       ├── sql/                # Row types + assemblers
│   │       └── utils/              # Pure utilities
│   ├── cli/                    # vitest-agent-cli (CLI bin)
│   │   └── src/
│   │       ├── index.ts            # @effect/cli entry point
│   │       ├── commands/           # Thin command wrappers
│   │       └── lib/                # Testable formatting logic
│   └── mcp/                    # vitest-agent-mcp (MCP server bin)
│       └── src/
│           ├── index.ts            # MCP stdio entry point
│           ├── server.ts           # @modelcontextprotocol/sdk server
│           ├── router.ts           # tRPC router
│           ├── context.ts          # ManagedRuntime context
│           └── tools/              # 24 MCP tool implementations
├── plugin/                     # Claude Code plugin (NOT a pnpm workspace)
│   ├── .claude-plugin/plugin.json  # Manifest with inline mcpServers
│   ├── bin/mcp-server.mjs          # PM-detect + spawn loader
│   ├── hooks/                      # SessionStart, PreToolUse, PostToolUse
│   ├── skills/                     # tdd, debugging, configuration, coverage-improvement
│   └── commands/                   # setup, configure
├── examples/                   # Example workspaces
├── docs/                       # User-facing documentation
├── lib/configs/                # Shared tool configuration
├── pnpm-workspace.yaml         # Workspace definitions
└── .claude/design/             # Architecture design documents
```

`vitest-agent-sdk` is the dependency hub — `reporter`,
`cli`, and `mcp` all import from it. The `reporter` package declares
`cli` and `mcp` as required peer dependencies so they auto-install
together for end users.

## Architecture Patterns

### Effect Services

The project uses [Effect](https://effect.website/) for dependency injection
and service composition. Key patterns:

- **Services** (`packages/shared/src/services/`) define interfaces via
  `Context.Tag`
- **Live layers** (`packages/shared/src/layers/*Live.ts`) provide
  production implementations using `@effect/platform` for file I/O and
  `@effect/sql-sqlite-node` for the database
- **Test layers** (`packages/shared/src/layers/*Test.ts`) provide mock
  implementations with state containers for assertions
- **Schemas** (`packages/shared/src/schemas/`) use Effect Schema (not
  Zod) for data validation and serialization. Zod is used only inside
  `packages/mcp/` for tRPC procedure input schemas

### Reporter Integration

The `AgentReporter` class implements Vitest's Reporter interface. Each
lifecycle hook (`onTestRunEnd`) builds a scoped effect and runs it with
`Effect.runPromise`, providing the `ReporterLive` layer inline. This avoids
managed runtime lifecycle concerns.

### Pure Functions

Formatters (`packages/shared/src/formatters/`) and small utilities
(`packages/shared/src/utils/compress-lines.ts`,
`packages/shared/src/utils/safe-filename.ts`, etc.) are plain
functions, not Effect services. They are trivially testable without
layers.

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
pnpm vitest run packages/shared/src/utils/compress-lines.test.ts
```

### Testing Effect Services

Service tests use the state-container pattern with test layers:

```typescript
import { Effect } from "effect";
import { DataReader } from "../services/DataReader.js";
import { DataStoreTest } from "../layers/DataStoreTest.js";

// Provide a test layer wired to an in-memory or fixture-backed state
const testLayer = DataStoreTest.layer(/* mock state */);

const run = <A, E>(effect: Effect.Effect<A, E, DataReader>) =>
  Effect.runPromise(Effect.provide(effect, testLayer));

it("returns the latest run for a project", async () => {
  const result = await run(
    Effect.flatMap(DataReader, (svc) => svc.getLatestRun("my-app", null)),
  );
  // assertions...
});
```

Reporter integration tests compose test layers:

```typescript
const TestReporterLive = Layer.mergeAll(
  DataStoreTest.layer(writeState),
  CoverageAnalyzerTest.layer(),
  HistoryTrackerTest.layer(),
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
