# vitest-agent-reporter

## 0.3.0

### Breaking Changes

* [`32a01ac`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/32a01ac771e87500c7411e47b31cefacd07df9c4) `coverageThreshold: number` replaced by `coverageThresholds` (Vitest
  `coverage.thresholds` format)
* `CoverageReport.threshold` replaced by `CoverageReport.thresholds`
  object with `global` and `patterns` fields

### Features

* [`32a01ac`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/32a01ac771e87500c7411e47b31cefacd07df9c4) Restructure as pnpm monorepo with publishable package in `package/`
  and example workspaces in `examples/`
* Replace `coverageThreshold` with Vitest-native `coverageThresholds`
  format supporting per-metric, per-glob, and negative number semantics
* Add `coverageTargets` for aspirational coverage goals with
  auto-ratcheting baselines stored in the cache
* Add per-project coverage trend tracking with 50-entry sliding window
* Add tiered console output: green (targets met), yellow (below
  targets), red (failures or threshold violations)
* Add `trends` CLI command for coverage trajectory analysis
* Add `cache path` and `cache clean` commands for cache management
* Add `doctor` command for cache health diagnostics

### Bug Fixes

* [`32a01ac`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/32a01ac771e87500c7411e47b31cefacd07df9c4) Fix CLI cache directory resolution for Vite's hash-based vitest
  subdirectory (`node_modules/.vite/vitest/<hash>/`)
