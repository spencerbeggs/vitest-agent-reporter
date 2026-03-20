# Contributing to Claude Design Coordinator

Thank you for your interest in contributing to Claude Design Coordinator! This
document provides guidelines and instructions for development.

## Prerequisites

- Node.js 20+
- pnpm 10+

## Development Setup

```bash
# Clone the repository
git clone https://github.com/spencerbeggs/claude-design-coordinator.git
cd claude-design-coordinator

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run tests
pnpm run test
```

## Running Locally

```bash
# Start the server (from built output)
node pkgs/claude-coordinator-server/dist/dev/bin/cli.js

# In another terminal, test the MCP bridge
node pkgs/claude-coordinator-mcp/dist/dev/bin/cli.js
```

## Project Structure

```text
claude-design-coordinator/
├── pkgs/
│   ├── claude-coordinator-core/    # Zod schemas and TypeScript types
│   ├── claude-coordinator-server/  # tRPC WebSocket server
│   └── claude-coordinator-mcp/     # MCP stdio bridge
├── lib/
│   └── configs/                    # Shared configuration files
└── ...
```

## Available Scripts

| Script | Description |
| ------ | ----------- |
| `pnpm run build` | Build all packages (dev + prod) |
| `pnpm run test` | Run all tests |
| `pnpm run lint` | Check code with Biome |
| `pnpm run lint:fix` | Auto-fix lint issues |
| `pnpm run typecheck` | Type-check all workspaces |

## Code Quality

This project uses:

- **Biome** for linting and formatting
- **Commitlint** for enforcing conventional commits
- **Husky** for Git hooks

### Commit Format

All commits must follow the [Conventional Commits](https://conventionalcommits.org)
specification and include a DCO signoff:

```text
feat: add new coordinator tool

Signed-off-by: Your Name <your.email@example.com>
```

### Pre-commit Hooks

The following checks run automatically:

- **pre-commit**: Runs lint-staged
- **commit-msg**: Validates commit message format
- **pre-push**: Runs tests for affected packages

## Testing

Tests use [Vitest](https://vitest.dev) with v8 coverage.

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage

# Run tests for a specific package
pnpm run test -- --filter=@spencerbeggs/claude-coordinator-core
```

## TypeScript

- Composite builds with project references
- Strict mode enabled
- ES2022/ES2023 targets
- Import extensions required (`.js` for ESM)

### Import Conventions

```typescript
// Use .js extensions for relative imports (ESM requirement)
import { AgentSchema } from "./schemas/agent.js";

// Use node: protocol for Node.js built-ins
import { EventEmitter } from "node:events";

// Separate type imports
import type { Agent } from "./schemas/agent.js";
```

## Submitting Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `pnpm run test`
5. Run linting: `pnpm run lint:fix`
6. Commit with conventional format and DCO signoff
7. Push and open a pull request

## License

By contributing, you agree that your contributions will be licensed under the
MIT License.
