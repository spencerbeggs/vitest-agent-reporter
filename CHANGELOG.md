# vitest-agent-reporter

## 0.2.1

### Bug Fixes

* [`1f951fd`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/1f951fd916f3d8f98e3dedcbccc282b8f35d0b60) Execute the cli with `@efffect/platform-node`

## 0.2.0

### Bug Fixes

* [`73b0c82`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/73b0c82388780520ae91b6d81996c41953e68b03) Forgot to link the cli correctly, my bad

## 0.1.0

### Features

* [`3ef80f9`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/3ef80f926388a296442f0488782381d13e02df5f) **AgentReporter** -- Vitest Reporter producing structured markdown to
  console, persistent JSON to disk per project, and optional GFM for
  GitHub Actions check runs. Groups results by project natively via the
  Reporter v2 API. Uses Effect services for file I/O and coverage
  processing via `Effect.runPromise` with scoped layers.
* **AgentPlugin** -- Vitest plugin that auto-injects AgentReporter with
  three-environment detection (agent/CI/human) via `std-env`. Two console
  strategies: `"complement"` (default) layers on Vitest's built-in agent
  reporter, adding JSON cache and manifest; `"own"` takes over console
  output entirely, stripping built-in reporters.
* **CLI bin** (`vitest-agent-reporter`) with four on-demand commands:
  * `status` -- per-project pass/fail state from cached results
  * `overview` -- test landscape summary with file-to-test mapping
  * `coverage` -- coverage gap analysis using thresholds from cached reports
  * `history` -- failure trend analysis with P/F visualization, flaky
    detection, and persistent failure tracking
* **Agent detection** via `std-env` (covers Claude Code, Cursor, Gemini
  CLI, Codex, Devin, Augment, Goose, Kiro, and more)
* **Coverage integration** with istanbul duck-typing (works with both
  `@vitest/coverage-v8` and `@vitest/coverage-istanbul`)
* **Scoped coverage** for partial test runs -- only flags threshold
  violations for files related to the tests that were run
* **Manifest-first cache** -- agents read `manifest.json` once to find
  failing projects, then selectively read only those report files
* **Effect Schema** for all data structures (reports, manifests, options)
  with `CacheReader` and `CacheReaderLive` exported for programmatic
  cache access
* **GitHub Actions GFM** -- auto-detected, writes structured summaries to
  `GITHUB_STEP_SUMMARY` with collapsible per-project details
* **Cache directory resolution** -- derives from Vite's cacheDir by default,
  configurable via explicit option or `outputFile` config
* **Coverage thresholds** read from Vitest config automatically
* **Compact console output** with failure details, error diffs, coverage
  gaps with uncovered line ranges, and re-run commands
* **Failure history** -- per-test pass/fail tracking across runs in a
  10-run sliding window with automatic classification: `new-failure`,
  `persistent`, `flaky`, `recovered`, `stable`
* **Classification-driven suggestions** -- console output labels failed
  tests with their classification and provides prioritized next steps
  (new failures first, then persistent, then flaky)
