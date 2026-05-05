# CLAUDE.md

This file provides guidance to Claude Code when working with code in this
repository.

## Workspace Layout

This is a pnpm monorepo. Workspaces are defined in `pnpm-workspace.yaml`:

| Workspace | Path | Purpose |
| --------- | ---- | ------- |
| `vitest-agent-sdk` | `packages/sdk/` | Shared schemas, data layer, services, formatters, utilities (no internal deps) |
| `vitest-agent-plugin` | `packages/plugin/` | Vitest plugin (`AgentPlugin`), internal reporter class, `CoverageAnalyzer`, `ReporterLive` |
| `vitest-agent-reporter` | `packages/reporter/` | Named `VitestAgentReporterFactory` implementations (no Vitest-API code) |
| `vitest-agent-cli` | `packages/cli/` | CLI bin (`vitest-agent`) |
| `vitest-agent-mcp` | `packages/mcp/` | MCP server bin (`vitest-agent-mcp`) |
| `playground` | `playground/` | Dogfooding sandbox — intentionally imperfect code for agent demos |

The five publishable packages live under `packages/`. The `plugin/`
directory at the repo root is a file-based Claude Code plugin (NOT a pnpm
workspace). Root-level configs (`turbo.json`, `biome.jsonc`, etc.) apply
to all workspaces. To scope commands to a specific package, use
`--filter='./packages/<name>'`.

### Package boundaries and dependency direction

- `vitest-agent-sdk` -- carries everything multiple runtime
  packages need: Effect schemas, SQLite migrations + data layer
  (`DataStore` / `DataReader` and their live layers), output pipeline
  services and formatters, path resolution (`resolveDataPath`,
  workspace-key resolver, config-file loader), errors, public
  reporter contract types (`ReporterKit`, `VitestAgentReporterFactory`,
  etc.), and supporting utilities. Has no dependency on the other four
  packages.
- `vitest-agent-plugin` -- imports from `-sdk`. Owns `AgentPlugin`,
  the internal `AgentReporter` Vitest-API class, `CoverageAnalyzer`
  (the only service that needs Vitest's istanbul `CoverageMap`),
  `ReporterLive`, and reporter-side utilities (`build-reporter-kit`,
  `route-rendered-output`, `process-failure`, etc.). Declares
  `vitest-agent-reporter`, `vitest-agent-cli`, and `vitest-agent-mcp`
  as **required** peerDependencies (`peerDependenciesMeta.optional: false`).
- `vitest-agent-reporter` -- imports from `-sdk`. Owns named
  `VitestAgentReporterFactory` implementations only (`defaultReporter`,
  `markdownReporter`, `terminalReporter`, `jsonReporter`,
  `silentReporter`, `ciAnnotationsReporter`, `githubSummaryReporter`).
  No Vitest-API code.
- `vitest-agent-cli` -- imports from `-sdk`. Owns the
  `@effect/cli` commands and `CliLive`.
- `vitest-agent-mcp` -- imports from `-sdk`. Owns the MCP
  server, tRPC router, 50 tools, and `McpLive`.

The five packages release in lockstep; plugin, reporter, cli, and mcp
pin `-sdk` at `workspace:*` and plugin pins reporter/cli/mcp at
`workspace:*`.

## Project Status

`vitest-agent` 2.0 is a Vitest reporter, plugin, CLI, and MCP
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
3. **`vitest-agent` CLI** -- `@effect/cli`-based bin (shipped by
   the `vitest-agent-cli` package) with `status`, `overview`,
   `coverage`, `history`, `trends`, `cache`, and `doctor` subcommands.
   All commands support `--format`.
4. **Suggested actions & failure history** -- actionable suggestions in
   console output, per-test failure persistence across runs, and test
   classification (`stable`, `new-failure`, `persistent`, `flaky`,
   `recovered`) for regression vs flake detection.
5. **Coverage thresholds, baselines, and trends** -- Vitest-native
   `coverageThresholds` format, aspirational `coverageTargets`, and
   auto-ratcheting baselines with per-project trend tracking.
6. **MCP server & Claude Code plugin** -- 50 MCP tools via tRPC router
   (shipped by `vitest-agent-mcp`), including the three-tier
   Objective→Goal→Behavior CRUD surface (10 tools) added in 2.0,
   plus four MCP resources under two URI schemes (`vitest://docs/`
   and `vitest://docs/{+path}` for the vendored Vitest documentation
   snapshot at `packages/mcp/vendor/vitest-docs/`;
   `vitest-agent://patterns/` and `vitest-agent://patterns/{slug}`
   for the curated patterns library at `packages/mcp/patterns/`)
   and six framing-only prompts (`triage`, `why-flaky`,
   `regression-since-pass`, `explain-failure`, `tdd-resume`,
   `wrapup`) registered directly with `@modelcontextprotocol/sdk`
   alongside the tRPC router. A file-based Claude Code plugin at
   `plugin/` ships a `PreToolUse` hook that auto-allows the
   non-destructive MCP tools without per-call permission prompts.
   The two `tdd_*_delete` tools are intentionally omitted from the
   auto-allow list (main-agent deletes prompt for user confirmation),
   and a separate `pre-tool-use-tdd-restricted.sh` hook denies them
   outright when the TDD orchestrator subagent calls them. The
   plugin also ships an `update-vitest-snapshot` skill that wraps
   `pnpm run update-vitest-snapshot --tag <vN.M.K>` for refreshing
   the vendored documentation.

Effect service architecture: I/O encapsulated in Effect services
(DataStore, DataReader, EnvironmentDetector, ExecutorResolver,
FormatSelector, DetailResolver, OutputRenderer, ProjectDiscovery,
HistoryTracker in `-sdk`; CoverageAnalyzer in the plugin package)
with live and test layer implementations. All data structures use Effect
Schema definitions with `typeof Schema.Type` for TypeScript types.
Schemas are part of the public API and are re-exported from
`vitest-agent-sdk` for consumer use.

### Database location

The SQLite `data.db` lives at a deterministic XDG-derived path:

```text
$XDG_DATA_HOME/vitest-agent/<workspaceKey>/data.db
```

`<workspaceKey>` is the root `package.json` `name`, normalized for
filesystem safety (`@org/pkg` -> `@org__pkg`). On systems without
`XDG_DATA_HOME`, the path falls back to
`~/.local/share/vitest-agent/<workspaceKey>/data.db` per
`xdg-effect` `AppDirs` semantics. The directory is created on demand
via `appDirs.ensureData`.

Resolution precedence (highest first):

1. Programmatic `reporterOptions.cacheDir` option.
2. `cacheDir` field in `vitest-agent.config.toml` at the
   workspace root.
3. `projectKey` field in `vitest-agent.config.toml` (used as
   the `<workspaceKey>` segment under XDG).
4. Normalized workspace `name` (default).

If no workspace `name` is found and no `projectKey` override is set,
resolution fails loudly with a `WorkspaceRootNotFoundError` rather than
silently falling back to a path hash. **No backward-compat migration of
1.x JSON or `node_modules/.vite/...` databases** -- this is a 2.0
breaking change documented in the changeset and changelog.

### Optional config file

`vitest-agent.config.toml` at the workspace root supports two
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
3. Spawns `<pm exec> vitest-agent-mcp` with `stdio: 'inherit'`
   and `cwd: projectDir`. Forwards exit code and signals.
4. Exports `VITEST_AGENT_REPORTER_PROJECT_DIR=<projectDir>` to the child
   so the MCP server uses the correct workspace root for path
   resolution (Claude Code does not reliably propagate
   `CLAUDE_PROJECT_DIR` to MCP subprocesses).
5. On failure, prints PM-specific install instructions to stderr.

The agent's required peerDependency on `vitest-agent-mcp`
plus this loader replaces the old Decision 29 `file://` dynamic-import
plus `node_modules` walk approach.

### Source layout (per package)

`packages/sdk/src/` -- `services/` (Effect tags), `layers/` (live +
test, including `LoggerLive`, `ConfigLive`, `PathResolutionLive`,
`OutputPipelineLive`), `schemas/` (Effect Schema definitions;
`schemas/turns/` holds the seven `TurnPayload` discriminated-union
payloads; `schemas/Tdd.ts` and `schemas/ChannelEvent.ts` carry the
2.0 goal/behavior shapes and the 13-variant progress event union),
`contracts/reporter.ts` (public `ReporterKit` / `VitestAgentReporterFactory`
contract types), `utils/` (pure functions, including `resolve-data-path`,
`resolve-workspace-key`, `normalize-workspace-key`, `ensure-migrated`,
`function-boundary` (acorn AST walk),
`failure-signature` (deterministic 16-char sha256 hash), and
`validate-phase-transition` (TDD evidence-binding rules; the
`DenialReason` union was extended in 2.0 with `wrong_source_phase`
(blocks `spike→green` and `refactor→green` — the red phase must be
entered explicitly first) and the four `tdd_phase_transition_request`
goal/behavior pre-check literals (`goal_not_found`,
`goal_not_in_progress`, `behavior_not_found`, `behavior_not_in_goal`))),
`errors/` (tagged errors, including `TddErrors.ts` with
`GoalNotFoundError`, `BehaviorNotFoundError`,
`TddSessionNotFoundError`, `TddSessionAlreadyEndedError`,
`IllegalStatusTransitionError`), `formatters/` (markdown, gfm, json,
silent, ci-annotations), `migrations/` (5 migrations; `0002_comprehensive`
is the last drop-and-recreate, modified in place for 2.0 to add the
goal/behavior hierarchy; 43 tables total), `sql/` (row types +
assemblers).

`packages/plugin/src/` -- `plugin.ts` (`AgentPlugin`),
`reporter.ts` (internal `AgentReporter` Vitest-API class),
`services/CoverageAnalyzer.ts`, `layers/CoverageAnalyzerLive.ts`,
`layers/ReporterLive.ts`, `utils/` (`build-reporter-kit`,
`route-rendered-output`, `process-failure`, `capture-env`,
`capture-settings`, `resolve-thresholds`, `strip-console-reporters`).

`packages/reporter/src/` -- `default.ts` (`defaultReporter`),
`markdown.ts`, `terminal.ts`, `json.ts`, `silent.ts`,
`ci-annotations.ts`, `github-summary.ts` (named factory files),
`_kit-context.ts` (private `FormatterContext` builder).

`packages/cli/src/` -- `bin.ts` (entry), `commands/` (`status`,
`overview`, `coverage`, `history`, `trends`, `cache`, `doctor`,
`record`, `triage`, `wrapup`),
`lib/` (testable formatting logic), `layers/CliLive.ts`.

`packages/mcp/src/` -- `bin.ts` (entry), `index.ts`, `server.ts`
(calls `registerAllResources(server)` and
`registerAllPrompts(server)` before constructing
`StdioServerTransport`), `router.ts`, `context.ts`, `tools/`
(50 tool implementations, including the 10 new `tdd_goal_*` /
`tdd_behavior_*` CRUD tools and the private
`_tdd-error-envelope.ts` helper that surfaces tagged TDD errors
as success-shape responses; the 1.x
`decompose_goal_into_behaviors` tool was removed in 2.0),
`resources/` (registrar + path-traversal-safe path resolver +
two per-scheme readers + index renderers; surfaces four MCP
resources under `vitest://docs/...` and
`vitest-agent://patterns/...`), `prompts/` (registrar + six
framing-only prompts), `middleware/idempotency.ts`,
`layers/McpLive.ts`. Sibling content trees: `vendor/vitest-docs/`
(vendored upstream documentation snapshot with
`manifest.json` + `ATTRIBUTION.md`) and `patterns/` (curated
patterns library, three launch patterns shipped). The
`scripts/` directory holds zero-deps maintenance scripts:
`update-vitest-snapshot.mjs` (sparse-clone + `execFileSync`
fetcher, run via `pnpm run update-vitest-snapshot --tag
<vN.M.K>`) and `copy-vendor-to-dist.mjs` (postbuild copier
chained from `build:dev` / `build:prod`, mirrors `vendor/` and
`patterns/` into `dist/dev/` and `dist/npm/`).

`plugin/` -- `.claude-plugin/plugin.json` (manifest with inline
`mcpServers`), `bin/mcp-server.mjs` (PM-detect + spawn loader),
`hooks/` (`session-start.sh`, `post-test-run.sh`,
`pre-tool-use-mcp.sh`, `pre-tool-use-tdd-restricted.sh` (2.0;
denies `tdd_goal_delete`, `tdd_behavior_delete`,
`tdd_artifact_record` for the orchestrator subagent),
`lib/safe-mcp-vitest-agent-ops.txt`),
`skills/` (TDD, debugging, configuration, coverage-improvement,
update-vitest-snapshot;
`tdd/SKILL.md` owns the 2.0 channel-event handler section;
`update-vitest-snapshot/SKILL.md` is the new 2026-05-05 skill
that wraps `pnpm run update-vitest-snapshot --tag <vN.M.K>` for
refreshing the vendored upstream documentation snapshot at
`packages/mcp/vendor/vitest-docs/`),
`commands/` (setup, configure).

**Spec:** [GitHub Issue #1](https://github.com/spencerbeggs/vitest-agent/issues/1)

**For architecture details (progressive loading -- load only what you need):**

- `@./.claude/design/vitest-agent/architecture.md`
  Hub document with overview, diagram, and component summary.
- `@./.claude/design/vitest-agent/components.md`
  Load when working on specific components, need API details or interfaces.
- `@./.claude/design/vitest-agent/decisions.md`
  Load when you need to understand "why" a design choice was made.
- `@./.claude/design/vitest-agent/data-structures.md`
  Load when working with schemas, cache format, output, or data flow.
- `@./.claude/design/vitest-agent/testing-strategy.md`
  Load when writing tests or reviewing testing patterns and coverage.

## Build Pipeline

This project uses
[@savvy-web/rslib-builder](https://github.com/savvy-web/rslib-builder) to
produce dual build outputs via [Rslib](https://rslib.rs/) for each of the
five packages:

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

The `publishConfig.targets` array (identical across all five packages)
defines where packages are published:

- **GitHub Packages** -- `https://npm.pkg.github.com/` (from
  `dist/github/`).
- **npm registry** -- `https://registry.npmjs.org/` (from `dist/npm/`).

Both targets publish with provenance attestation enabled. The five
packages release in lockstep so the agent's required peerDependencies
on reporter, cli, and mcp always resolve to a matching version.

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
turbo run build:dev build:prod --filter='./packages/sdk'
turbo run build:dev build:prod --filter='./packages/cli'
turbo run build:dev build:prod --filter='./packages/mcp'
```

### Running a Specific Test

```bash
pnpm vitest run packages/sdk/src/utils/resolve-data-path.test.ts
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
  (`import { DataStore } from "vitest-agent-sdk"`),
  never relative paths across package boundaries.

### Commits

All commits require:

1. Conventional commit format (`feat`, `fix`, `chore`, etc.).
2. DCO signoff: `Signed-off-by: Name <email>`.

### Publishing

The five packages publish to both GitHub Packages and npm with
provenance via the [@savvy-web/changesets](https://github.com/savvy-web/changesets)
release workflow. The GitHub Action is at
[savvy-web/workflow-release-action](https://github.com/savvy-web/workflow-release-action).
Releases happen in lockstep -- `vitest-agent-plugin` declares
`vitest-agent-reporter`, `vitest-agent-cli`, and `vitest-agent-mcp`
as required peerDependencies, and all five depend on
`vitest-agent-sdk` at the same version.

## Testing

- **Framework**: [Vitest](https://vitest.dev/) `^4.1.5` with v8
  coverage provider.
- **Pool**: Uses `forks` (not threads) for broader compatibility.
- **Config**: `vitest.config.ts` at the repo root uses plain
  `defineConfig` from `vitest/config` with project-based filtering via
  `--project`.
- **CI**: `pnpm run ci:test` sets `CI=true` and enables coverage.
