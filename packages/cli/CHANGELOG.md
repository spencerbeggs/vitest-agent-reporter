# vitest-agent-cli

## 2.0.0

### Features

* [`0a196c0`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/0a196c04f78a84eb31d69d09156d014f9433ed73) Introduces the 2.0 CLI: session-start/end/turn record subcommands, triage and wrapup generators, and run-trigger association.

- [`0a196c0`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/0a196c04f78a84eb31d69d09156d014f9433ed73) `DataStore` gains `backfillTestCaseTurns(ccSessionId)`, which resolves `test_cases.created_turn_id` for any test cases in the current session that were authored via file edits but whose turn link was not yet persisted.
- `DataReader` gains `getLatestTestCaseForSession(ccSessionId)`, which returns the most recently created test case id for a given Claude Code session as `Option<number>`.
- `vitest-agent-cli` adds a `record test-case-turns` subcommand that calls both methods in sequence and writes `{ updated, latestTestCaseId }` as JSON to stdout — enabling post-tool-use hooks to link TDD artifacts to the correct test case.

### Bug Fixes

* [`0a196c0`](https://github.com/spencerbeggs/vitest-agent-reporter/commit/0a196c04f78a84eb31d69d09156d014f9433ed73) `validatePhaseTransition` D2 binding rule 1 (authoring-window check) is now scoped to `test_failed_run` artifacts only. Previously the check ran for all artifact kinds, causing spurious `evidence_not_in_phase_window` denials on `green→refactor` transitions where the passing test was correctly written in the preceding red phase. Run-level artifacts with no `test_case_id` now return `missing_artifact_evidence` with a clearer remediation hint directing the agent to use `run_tests` so the resulting artifact carries a resolvable test case.
  | Dependency       | Type       | Action  | From  | To    |
  | ---------------- | ---------- | ------- | ----- | ----- |
  | vitest-agent-sdk | dependency | updated | 1.3.1 | 2.0.0 |
