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

```text
vitest-agent-reporter/
├── src/
│   ├── index.ts            # Public API re-exports
│   ├── schemas.ts          # Zod schemas, codecs, istanbul interfaces
│   ├── types.ts            # z.infer<> type aliases
│   ├── utils.ts            # Utility functions and environment detection
│   ├── detect-pm.ts        # Package manager detection
│   ├── coverage.ts         # Istanbul duck-typing coverage processor
│   ├── reporter.ts         # AgentReporter class
│   ├── plugin.ts           # AgentPlugin function
│   └── formatters/
│       ├── json.ts         # JSON report builder
│       ├── console.ts      # Console markdown formatter
│       └── gfm.ts          # GitHub Actions GFM formatter
├── docs/                   # User-facing documentation
├── lib/configs/            # Shared tool configuration
└── .claude/design/         # Architecture design documents
```

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
pnpm vitest run src/utils.test.ts
```

## TypeScript

- Extends `@savvy-web/rslib-builder/tsconfig/ecma/lib.json`
- Type-checking via `tsgo --noEmit`
- Strict mode with `exactOptionalPropertyTypes`

### Import Conventions

```typescript
// Use .js extensions for relative imports (ESM requirement)
import { compressLines } from "./utils.js";

// Use node: protocol for Node.js built-ins
import { mkdir } from "node:fs/promises";

// Separate type imports
import type { AgentReport } from "./types.js";
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
