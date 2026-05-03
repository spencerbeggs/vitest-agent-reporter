# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository.

## Workspace Layout

This is a pnpm monorepo. Workspaces are defined in `pnpm-workspace.yaml`:

| Workspace | Path | Purpose |
| --------- | ---- | ------- |
| `vitest-agent-reporter-shared` | `packages/shared/` | Shared schemas, data layer, services, formatters, utilities (no internal deps) |
| `vitest-agent-reporter` | `packages/reporter/` | Vitest reporter and plugin |
| `vitest-agent-reporter-cli` | `packages/cli/` | CLI bin (`vitest-agent-reporter`) |
| `vitest-agent-reporter-mcp` | `packages/mcp/` | MCP server bin (`vitest-agent-reporter-mcp`) |
| `examples/*` | `examples/` | Usage examples |

The four publishable packages live under `packages/`. The `plugin/`
directory at the repo root is a file-based Claude Code plugin (NOT a pnpm
workspace). Root-level configs (`turbo.json`, `biome.jsonc`, etc.) apply
to all workspaces. To scope commands to a specific package, use
`--filter='./packages/<name>'`.

### Package boundaries and dependency direction

- `vitest-agent-reporter-shared` -- carries everything both runtime
  packages need: Effect schemas, SQLite migrations + data layer
  (`DataStore` / `DataReader` and their live layers), output pipeline
  services and formatters, path resolution (`resolveDataPath`,
  workspace-key resolver, config-file loader), errors, and supporting
  utilities. Has no dependency on the other three packages.
- `vitest-agent-reporter` -- imports from `-shared`. Owns
  `AgentReporter`, `AgentPlugin`, and `CoverageAnalyzer` (the only
  service that needs Vitest's istanbul `CoverageMap`). Declares
  `vitest-agent-reporter-cli` and `vitest-agent-reporter-mcp` as
  **required** peerDependencies (`peerDependenciesMeta.optional: false`).
- `vitest-agent-reporter-cli` -- imports from `-shared`. Owns the
  `@effect/cli` commands and `CliLive`.
- `vitest-agent-reporter-mcp` -- imports from `-shared`. Owns the MCP
  server, tRPC router, 24 tools, and `McpLive`.

The four packages release in lockstep; reporter, cli, and mcp pin
`-shared` at `workspace:*` and the reporter pins cli/mcp at
`workspace:*`.

## Project Status

`vitest-agent-reporter` 2.0 is a Vitest reporter, plugin, CLI, and MCP
server family for LLM coding agents. Six primary capabilities:

1. **`AgentReporter`** -- Vitest Reporter (>= 4.1.0) producing formatted
   output via pluggable formatters, persistent data to SQLite (`data.db`),
   and optional GFM (GitHub Actions). `onInit` is async (resolves the
   XDG-based `dbPath` and ensures the parent directory exists before any
   write happens).
2. **`AgentPlugin`** -- Vitest plugin that injects `AgentReporter` with
   four-environment detection (`agent-shell`/`terminal`/`ci-github`/
   `ci-generic`), reporter chain management, cache directory resolution,
   and coverage threshold/target extraction.
3. **`vitest-agent-reporter` CLI** -- `@effect/cli`-based bin (shipped by
   the `vitest-agent-reporter-cli` package) with `status`, `overview`,
   `coverage`, `history`, `trends`, `cache`, and `doctor` subcommands.
   All commands support `--format`.
4. **Suggested actions & failure history** -- actionable suggestions in
   console output, per-test failure persistence across runs, and test
   classification (`stable`, `new-failure`, `persistent`, `flaky`,
   `recovered`) for regression vs flake detection.
5. **Coverage thresholds, baselines, and trends** -- Vitest-native
   `coverageThresholds` format, aspirational `coverageTargets`, and
   auto-ratcheting baselines with per-project trend tracking.
6. **MCP server & Claude Code plugin** -- 24 MCP tools via tRPC router
   (shipped by `vitest-agent-reporter-mcp`), plus a file-based Claude
   Code plugin at `plugin/` with a `PreToolUse` hook that auto-allows
   all 24 MCP tools without per-call permission prompts.

Effect service architecture: I/O encapsulated in Effect services
(DataStore, DataReader, EnvironmentDetector, ExecutorResolver,
FormatSelector, DetailResolver, OutputRenderer, ProjectDiscovery,
HistoryTracker in `-shared`; CoverageAnalyzer in the reporter package)
with live and test layer implementations. All data structures use Effect
Schema definitions with `typeof Schema.Type` for TypeScript types.
Schemas are part of the public API and are re-exported from
`vitest-agent-reporter` for backward-compatible consumer use.

### Database location

The SQLite `data.db` lives at a deterministic XDG-derived path:

```text
$XDG_DATA_HOME/vitest-agent-reporter/<workspaceKey>/data.db
```

`<workspaceKey>` is the root `package.json` `name`, normalized for
filesystem safety (`@org/pkg` -> `@org__pkg`). On systems without
`XDG_DATA_HOME`, the path falls back to
`~/.local/share/vitest-agent-reporter/<workspaceKey>/data.db` per
`xdg-effect` `AppDirs` semantics. The directory is created on demand
via `appDirs.ensureData`.

Resolution precedence (highest first):

1. Programmatic `reporter.cacheDir` option.
2. `cacheDir` field in `vitest-agent-reporter.config.toml` at the
   workspace root.
3. `projectKey` field in `vitest-agent-reporter.config.toml` (used as
   the `<workspaceKey>` segment under XDG).
4. Normalized workspace `name` (default).

If no workspace `name` is found and no `projectKey` override is set,
resolution fails loudly with a `WorkspaceRootNotFoundError` rather than
silently falling back to a path hash. **No backward-compat migration of
1.x JSON or `node_modules/.vite/...` databases** -- this is a 2.0
breaking change documented in the changeset and changelog.

### Optional config file

`vitest-agent-reporter.config.toml` at the workspace root supports two
optional fields:

```toml
# Override the entire data directory (highest precedence after
# the programmatic option).
cacheDir = "/abs/path/to/data-dir"

# Override the workspace key segment under XDG. Use this when two
# unrelated projects share a package.json name on one machine.
projectKey = "my-stable-key"
```

Loaded via `config-file-effect`'s resolver chain (workspace root ->
git root -> upward walk).

### Plugin MCP loader

`plugin/bin/mcp-server.mjs` is now a zero-deps Node script that:

1. Resolves `projectDir` from `CLAUDE_PROJECT_DIR` (falling back to
   `process.cwd()`).
2. Detects the user's package manager via `packageManager` field +
   lockfile inspection (npm, pnpm, yarn, bun).
3. Spawns `<pm exec> vitest-agent-reporter-mcp` with `stdio: 'inherit'`
   and `cwd: projectDir`. Forwards exit code and signals.
4. Exports `VITEST_AGENT_REPORTER_PROJECT_DIR=<projectDir>` to the child
   so the MCP server uses the correct workspace root for path
   resolution (Claude Code does not reliably propagate
   `CLAUDE_PROJECT_DIR` to MCP subprocesses).
5. On failure, prints PM-specific install instructions to stderr.

The reporter's required peerDependency on `vitest-agent-reporter-mcp`
plus this loader replaces the old Decision 29 `file://` dynamic-import
plus `node_modules` walk approach.

### Source layout (per package)

`packages/shared/src/` -- `services/` (Effect tags), `layers/` (live +
test, including `LoggerLive`, `ConfigLive`, `PathResolutionLive`,
`OutputPipelineLive`), `schemas/` (Effect Schema definitions; `schemas/turns/`
holds the seven `TurnPayload` discriminated-union payloads),
`utils/` (pure functions, including `resolve-data-path`,
`resolve-workspace-key`, `normalize-workspace-key`, `ensure-migrated`,
`function-boundary` (acorn AST walk),
`failure-signature` (deterministic 16-char sha256 hash), and
`validate-phase-transition` (TDD evidence-binding rules)),
`errors/` (tagged errors), `formatters/` (markdown, gfm, json, silent,
ci-annotations), `migrations/` (5 migrations; `0002_comprehensive` is
the last drop-and-recreate, 41 tables total), `sql/` (row types + assemblers).

`packages/reporter/src/` -- `reporter.ts` (`AgentReporter`),
`plugin.ts` (`AgentPlugin`), `services/CoverageAnalyzer.ts`,
`layers/CoverageAnalyzerLive.ts`, `layers/ReporterLive.ts`,
`utils/`.

`packages/cli/src/` -- `bin.ts` (entry), `commands/` (`status`,
`overview`, `coverage`, `history`, `trends`, `cache`, `doctor`),
`lib/` (testable formatting logic), `layers/CliLive.ts`.

`packages/mcp/src/` -- `bin.ts` (entry), `index.ts`, `server.ts`,
`router.ts`, `context.ts`, `tools/` (41 tool implementations),
`middleware/idempotency.ts`, `layers/McpLive.ts`.

`plugin/` -- `.claude-plugin/plugin.json` (manifest with inline
`mcpServers`), `bin/mcp-server.mjs` (PM-detect + spawn loader),
`hooks/` (`session-start.sh`, `post-test-run.sh`,
`pre-tool-use-mcp.sh`, `lib/safe-mcp-vitest-agent-reporter-ops.txt`),
`skills/` (TDD, debugging, configuration, coverage-improvement),
`commands/` (setup, configure).

**Spec:** [GitHub Issue #1](https://github.com/spencerbeggs/vitest-agent-reporter/issues/1)

**For architecture details (progressive loading -- load only what you need):**

- `@./.claude/design/vitest-agent-reporter/architecture.md`
  Hub document with overview, diagram, and component summary.
- `@./.claude/design/vitest-agent-reporter/components.md`
  Load when working on specific components, need API details or interfaces.
- `@./.claude/design/vitest-agent-reporter/decisions.md`
  Load when you need to understand "why" a design choice was made.
- `@./.claude/design/vitest-agent-reporter/data-structures.md`
  Load when working with schemas, cache format, output, or data flow.
- `@./.claude/design/vitest-agent-reporter/testing-strategy.md`
  Load when writing tests or reviewing testing patterns and coverage.

## Build Pipeline

This project uses
[@savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) to
produce dual build outputs via [Rslib](https://rslib.rs/) for each of the
four packages:

| Output | Directory | Purpose |
| ------ | --------- | ------- |
| Development | `packages/<name>/dist/dev/` | Local development with source maps |
| Production | `packages/<name>/dist/npm/` | Published to npm and GitHub Packages |

The root `pnpm run build` script currently builds the reporter package
only (`turbo run build:dev build:prod --filter='./packages/reporter'`).
To build a different package, use `turbo run build:dev build:prod
--filter='./packages/<name>'`.

### How `private: true` Works

Each source `package.json` is marked `"private": true` -- **this is
intentional and correct**. During the build, rslib-builder reads the
`publishConfig` field and transforms the output `package.json`:

- Sets `"private": false` based on `publishConfig.access`.
- Rewrites `exports` to point at compiled output.
- Strips `devDependencies`, `scripts`, `publishConfig`, and
  `devEngines`.

Each package has its own `rslib.config.ts` `transform()` callback that
controls what gets removed. Never manually set `"private": false` in a
source `package.json`.

### Publish Targets

The `publishConfig.targets` array (identical across all four packages)
defines where packages are published:

- **GitHub Packages** -- `https://npm.pkg.github.com/` (from
  `dist/github/`).
- **npm registry** -- `https://registry.npmjs.org/` (from `dist/npm/`).

Both targets publish with provenance attestation enabled. The four
packages release in lockstep so the reporter's required peerDependencies
on cli and mcp always resolve to a matching version.

### Turbo Orchestration

[Turbo](https://turbo.build/) manages build task dependencies and
caching:

- `types:check` runs first (no dependencies).
- `build:dev` and `build:prod` both depend on `types:check`.
- Cache excludes: `*.md`, `.changeset/**`, `.claude/**`, `.github/**`,
  `.husky/**`, `.vscode/**`.
- Environment pass-through: `GITHUB_ACTIONS`, `CI`.

## Savvy-Web Tool References

This template depends on several `@savvy-web/*` packages. These are in
active development -- if behavior seems unexpected, explore both the
GitHub docs and the installed source.

| Package | Purpose | GitHub | Local Source |
| ------- | ------- | ------ | ------------ |
| rslib-builder | Build pipeline, dual output, package.json transform | [savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) | `node_modules/@savvy-web/rslib-builder/` |
| commitlint | Conventional commit + DCO enforcement | [savvy-web/commitlint](https://github.com/savvy-web/commitlint) | `node_modules/@savvy-web/commitlint/` |
| changesets | Versioning, changelogs, release management | [savvy-web/changesets](https://github.com/savvy-web/changesets) | `node_modules/@savvy-web/changesets/` |
| lint-staged | Pre-commit file linting via Biome | [savvy-web/lint-staged](https://github.com/savvy-web/lint-staged) | `node_modules/@savvy-web/lint-staged/` |

TypeScript configuration in each package extends from rslib-builder:
`@savvy-web/rslib-builder/tsconfig/ecma/lib.json`.

## Commands

### Development

```bash
pnpm run lint              # Check code with Biome
pnpm run lint:fix          # Auto-fix lint issues
pnpm run lint:fix:unsafe   # Auto-fix including unsafe transforms
pnpm run lint:md           # Check markdown with markdownlint
pnpm run lint:md:fix       # Auto-fix markdown issues
pnpm run typecheck         # Type-check all packages via Turbo (runs tsgo per package)
pnpm run test              # Run all tests across all packages
pnpm run test:watch        # Run tests in watch mode
pnpm run test:coverage     # Run tests with v8 coverage report
```

### Building

```bash
pnpm run build             # Build the reporter package (dev + prod) via Turbo
pnpm run ci:build          # Same with CI=true and grouped output
```

To build a specific package, use the Turbo filter:

```bash
turbo run build:dev build:prod --filter='./packages/shared'
turbo run build:dev build:prod --filter='./packages/cli'
turbo run build:dev build:prod --filter='./packages/mcp'
```

### Running a Specific Test

```bash
pnpm vitest run packages/shared/src/utils/resolve-data-path.test.ts
```

## Code Quality and Hooks

### Biome

Unified linter and formatter replacing ESLint + Prettier. Configuration
in `biome.jsonc` extends `@savvy-web/lint-staged/biome/silk.jsonc`.

### Commitlint

Enforces conventional commit format with DCO signoff. Configuration in
`lib/configs/commitlint.config.ts` uses the `CommitlintConfig.silk()`
preset.

### Husky Git Hooks

| Hook | Action |
| ---- | ------ |
| `pre-commit` | Runs lint-staged (Biome on staged files) |
| `commit-msg` | Validates commit message format via commitlint |
| `pre-push` | Runs tests for affected packages using Turbo |
| `post-checkout` | Package manager setup |
| `post-merge` | Package manager setup |

### Lint-Staged

Configuration in `lib/configs/lint-staged.config.ts` uses the
`Preset.silk()` preset from `@savvy-web/lint-staged`.

## Conventions

### Imports

- Use `.js` extensions for relative imports (ESM requirement).
- Use `node:` protocol for Node.js built-ins (e.g.,
  `import fs from 'node:fs'`).
- Separate type imports: `import type { Foo } from './bar.js'`.
- Cross-package imports use the package name
  (`import { DataStore } from "vitest-agent-reporter-shared"`),
  never relative paths across package boundaries.

### Commits

All commits require:

1. Conventional commit format (`feat`, `fix`, `chore`, etc.).
2. DCO signoff: `Signed-off-by: Name <email>`.

### Publishing

The four packages publish to both GitHub Packages and npm with
provenance via the [@savvy-web/changesets](https://github.com/savvy-web/changesets)
release workflow. The GitHub Action is at
[savvy-web/workflow-release-action](https://github.com/savvy-web/workflow-release-action).
Releases happen in lockstep -- `vitest-agent-reporter` declares
`vitest-agent-reporter-cli` and `vitest-agent-reporter-mcp` as required
peerDependencies, and all three depend on
`vitest-agent-reporter-shared` at the same version.

## Testing

- **Framework**: [Vitest](https://vitest.dev/) `^4.1.5` with v8
  coverage provider.
- **Pool**: Uses `forks` (not threads) for broader compatibility.
- **Config**: `vitest.config.ts` at the repo root uses plain
  `defineConfig` from `vitest/config` with project-based filtering via
  `--project`.
- **CI**: `pnpm run ci:test` sets `CI=true` and enables coverage.
