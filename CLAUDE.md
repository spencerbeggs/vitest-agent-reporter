# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository.

## Workspace Layout

This is a pnpm monorepo. Workspaces are defined in `pnpm-workspace.yaml`:

| Workspace | Path | Purpose |
| --------- | ---- | ------- |
| `vitest-agent-reporter` | `package/` | Main package (reporter, plugin, CLI, schemas) |
| Examples | `examples/*` | Usage examples |

The publishable source lives under `package/`. Root-level configs
(`turbo.json`, `biome.jsonc`, etc.) apply to all workspaces. To scope
commands to the main package, use `--filter='./package'`.

## Project Status

`vitest-agent-reporter` is a Vitest reporter and plugin for LLM coding agents.
All phases (1-5) are complete. Six primary capabilities:

1. **`AgentReporter`** -- Vitest Reporter (>= 3.2.0) producing formatted
   output via pluggable formatters, persistent data to SQLite (`data.db`),
   and optional GFM (GitHub Actions)
2. **`AgentPlugin`** -- Vitest plugin that injects `AgentReporter` with
   four-environment detection (`agent-shell`/`terminal`/`ci-github`/
   `ci-generic`), reporter chain management, cache directory resolution,
   and coverage threshold/target extraction
3. **`vitest-agent-reporter` CLI** -- `@effect/cli`-based bin with `status`,
   `overview`, `coverage`, `history`, `trends`, `cache`, and `doctor`
   subcommands. All commands support `--format` flag
4. **Suggested actions & failure history** -- actionable suggestions in
   console output, per-test failure persistence across runs, and test
   classification (`stable`, `new-failure`, `persistent`, `flaky`,
   `recovered`) for regression vs flake detection
5. **Coverage thresholds, baselines, and trends** -- Vitest-native
   `coverageThresholds` format, aspirational `coverageTargets`, and
   auto-ratcheting baselines with per-project trend tracking
6. **MCP server & Claude Code plugin** -- 21 MCP tools via tRPC router
   for structured agent access to test data, plus file-based Claude Code
   plugin at `plugin/`

Effect service architecture: all I/O encapsulated in ten Effect services
(DataStore, DataReader, EnvironmentDetector, ExecutorResolver,
FormatSelector, DetailResolver, OutputRenderer, CoverageAnalyzer,
ProjectDiscovery, HistoryTracker) with live and test layer implementations.
All data structures use Effect Schema definitions (`package/src/schemas/`)
with `typeof Schema.Type` for TypeScript types. Schemas are part of the
public API.

Source layout: `package/src/services/` (Effect tags),
`package/src/layers/` (live + test),
`package/src/schemas/` (Effect Schema definitions),
`package/src/utils/` (pure functions),
`package/src/cli/` (commands + lib),
`package/src/errors/` (tagged errors),
`package/src/formatters/` (markdown, gfm, json, silent),
`package/src/mcp/` (MCP server + tRPC router + 21 tools),
`package/src/migrations/` (SQLite schema),
`package/src/sql/` (row types + assemblers).

**Spec:** [GitHub Issue #1](https://github.com/spencerbeggs/vitest-agent-reporter/issues/1)

**For architecture details (progressive loading -- load only what you need):**
→ @./.claude/design/vitest-agent-reporter/architecture.md
  Hub document with overview, diagram, and component summary.
→ @./.claude/design/vitest-agent-reporter/components.md
  Load when working on specific components, need API details or interfaces.
→ @./.claude/design/vitest-agent-reporter/decisions.md
  Load when you need to understand "why" a design choice was made.
→ @./.claude/design/vitest-agent-reporter/data-structures.md
  Load when working with schemas, cache format, output, or data flow.
→ @./.claude/design/vitest-agent-reporter/testing-and-phases.md
  Load when writing tests, reviewing coverage, or checking phase status.

## Build Pipeline

This project uses
[@savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) to
produce dual build outputs via [Rslib](https://rslib.rs/):

| Output | Directory | Purpose |
| ------ | --------- | ------- |
| Development | `dist/dev/` | Local development with source maps |
| Production | `dist/npm/` | Published to npm and GitHub Packages |

### How `private: true` Works

The source `package.json` is marked `"private": true` — **this is intentional
and correct**. During the build, rslib-builder reads the `publishConfig` field
and transforms the output `package.json`:

- Sets `"private": false` based on `publishConfig.access`
- Rewrites `exports` to point at compiled output
- Strips `devDependencies`, `scripts`, `publishConfig`, and `devEngines`

The `package/rslib.config.ts` `transform()` callback controls what gets
removed. Never manually set `"private": false` in the source `package.json`.

### Publish Targets

The `publishConfig.targets` array defines where packages are published:

- **GitHub Packages** — `https://npm.pkg.github.com/` (from `dist/npm/`)
- **npm registry** — `https://registry.npmjs.org/` (from `dist/npm/`)

Both targets publish with provenance attestation enabled.

### Turbo Orchestration

[Turbo](https://turbo.build/) manages build task dependencies and caching:

- `types:check` runs first (no dependencies)
- `build:dev` and `build:prod` both depend on `types:check`
- Cache excludes: `*.md`, `.changeset/**`, `.claude/**`, `.github/**`,
  `.husky/**`, `.vscode/**`
- Environment pass-through: `GITHUB_ACTIONS`, `CI`

## Savvy-Web Tool References

This template depends on several `@savvy-web/*` packages. These are in active
development — if behavior seems unexpected, explore both the GitHub docs and the
installed source.

| Package | Purpose | GitHub | Local Source |
| ------- | ------- | ------ | ------------ |
| rslib-builder | Build pipeline, dual output, package.json transform | [savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) | `node_modules/@savvy-web/rslib-builder/` |
| commitlint | Conventional commit + DCO enforcement | [savvy-web/commitlint](https://github.com/savvy-web/commitlint) | `node_modules/@savvy-web/commitlint/` |
| changesets | Versioning, changelogs, release management | [savvy-web/changesets](https://github.com/savvy-web/changesets) | `node_modules/@savvy-web/changesets/` |
| lint-staged | Pre-commit file linting via Biome | [savvy-web/lint-staged](https://github.com/savvy-web/lint-staged) | `node_modules/@savvy-web/lint-staged/` |
| vitest | Vitest config factory with project support | [savvy-web/vitest](https://github.com/savvy-web/vitest) | `node_modules/@savvy-web/vitest/` |

TypeScript configuration extends from rslib-builder:
`@savvy-web/rslib-builder/tsconfig/ecma/lib.json`

## Commands

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run lint:fix:unsafe   # Auto-fix including unsafe transforms
pnpm run lint:md           # Check markdown with markdownlint
pnpm run lint:md:fix       # Auto-fix markdown issues
pnpm run typecheck         # Type-check via Turbo (runs tsgo)
pnpm run test              # Run all tests
pnpm run test:watch        # Run tests in watch mode
pnpm run test:coverage     # Run tests with v8 coverage report
```

### Building

```bash
pnpm run build             # Build dev + prod outputs via Turbo
pnpm run build:dev         # Build development output only
pnpm run build:prod        # Build production/npm output only
pnpm run build:inspect     # Inspect production build config (verbose)
```

### Running a Specific Test

```bash
pnpm vitest run package/src/index.test.ts
```

## Code Quality and Hooks

### Biome

Unified linter and formatter replacing ESLint + Prettier. Configuration in
`biome.jsonc` extends `@savvy-web/lint-staged/biome/silk.jsonc`.

### Commitlint

Enforces conventional commit format with DCO signoff. Configuration in
`lib/configs/commitlint.config.ts` uses the `CommitlintConfig.silk()` preset.

### Husky Git Hooks

| Hook | Action |
| ---- | ------ |
| `pre-commit` | Runs lint-staged (Biome on staged files) |
| `commit-msg` | Validates commit message format via commitlint |
| `pre-push` | Runs tests for affected packages using Turbo |
| `post-checkout` | Package manager setup |
| `post-merge` | Package manager setup |

### Lint-Staged

Configuration in `lib/configs/lint-staged.config.ts` uses the `Preset.silk()`
preset from `@savvy-web/lint-staged`.

## Conventions

### Imports

- Use `.js` extensions for relative imports (ESM requirement)
- Use `node:` protocol for Node.js built-ins (e.g., `import fs from 'node:fs'`)
- Separate type imports: `import type { Foo } from './bar.js'`

### Commits

All commits require:

1. Conventional commit format (`feat`, `fix`, `chore`, etc.)
2. DCO signoff: `Signed-off-by: Name <email>`

### Publishing

Packages publish to both GitHub Packages and npm with provenance via the
[@savvy-web/changesets](https://github.com/savvy-web/changesets) release
workflow. The GitHub Action is at
[savvy-web/workflow-release-action](https://github.com/savvy-web/workflow-release-action).

## Testing

- **Framework**: [Vitest](https://vitest.dev/) with v8 coverage provider
- **Pool**: Uses `forks` (not threads) for broader compatibility
- **Config**: `vitest.config.ts` uses plain `defineConfig` from `vitest/config`
  with project-based filtering via `--project`
- **CI**: `pnpm run ci:test` sets `CI=true` and enables coverage
