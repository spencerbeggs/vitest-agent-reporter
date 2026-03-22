# CLI Commands

The `vitest-agent-reporter` CLI reads cached test data for on-demand
queries. It does not run tests or call AI providers.

All commands accept `--cache-dir, -d` to specify the cache directory.
When omitted, the CLI checks common locations automatically.

## cache

Manage the reporter cache directory.

### cache path

Print the resolved cache directory path and exit.

```bash
npx vitest-agent-reporter cache path
```

Useful for scripting or verifying which directory the CLI resolves to.

### cache clean

Delete the entire cache directory.

```bash
npx vitest-agent-reporter cache clean
```

Removes all cached reports, history, baselines, and trend data. Run
tests again to regenerate.

## doctor

Diagnose cache health. Runs a series of checks and reports pass/fail
for each:

```bash
npx vitest-agent-reporter doctor
```

Checks performed:

- **Cache found** -- can the cache directory be resolved?
- **Manifest valid** -- is `manifest.json` present and parseable?
- **Reports** -- do all referenced report files exist and decode?
- **History** -- do all referenced history files exist and decode?
- **Last run** -- is the cache stale (older than 24 hours)?

Exits with code 1 if any check fails. When issues are found, suggests
running `vitest-agent-reporter cache clean` and re-running tests.

## status

Show per-project pass/fail state from the most recent test run.

```bash
npx vitest-agent-reporter status
```

Output includes a summary table with project names, last run timestamps,
results, and report file paths. Failing projects show additional detail
with failure counts and affected files.

## overview

Test landscape summary with file-to-test mapping and project discovery.

```bash
npx vitest-agent-reporter overview
```

Discovers test files via glob patterns, maps them to source files using
naming conventions (strip `.test.`/`.spec.`), and shows the full test
landscape. Useful for agents exploring an unfamiliar codebase.

## coverage

Coverage gap analysis from cached report data.

```bash
npx vitest-agent-reporter coverage
```

Reads the coverage threshold from each project's cached report (no CLI
`--threshold` option). Shows files below threshold sorted by worst
metric, with uncovered line ranges.

## history

Failure trend analysis across runs.

```bash
npx vitest-agent-reporter history
```

Reads per-project history files and groups tests by classification:

- **Flaky tests** -- mixed pass/fail across recent runs, sorted by fail
  rate. Shows a P/F visualization (e.g., `PPFPPFPPFP`) with oldest
  runs on the left
- **Persistent failures** -- consecutive failures from the most recent
  run backward. Shows how many consecutive runs have failed
- **Recently recovered** -- tests that are now passing but had failures
  in the recent window

Stable tests and new failures (first-time) are omitted since they have
no interesting history to display.

The history command is most useful when the console output hints at
flaky or persistent failures. The console "Next steps" section includes
a pointer to run this command when classifications are present.

## trends

Coverage trend analysis across runs.

```bash
npx vitest-agent-reporter trends
```

Reads per-project trend files and displays:

- **Direction** -- whether coverage is improving, regressing, or stable
  over recent runs
- **Metrics table** -- current value, 5-run average, and (if targets are
  configured) the target value and gap for each metric
- **Recent trajectory** -- line coverage values over the last 10 runs,
  showing the progression

Trend data is recorded automatically on each full test run and stored in
`{cacheDir}/trends/{project}.trends.json` with a 50-entry sliding window.

The trends command is most useful when you want to verify whether a
coverage change is a one-time dip or part of a pattern. The console
output includes a pointer to this command when trend data is available.
