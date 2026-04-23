---
"vitest-agent-reporter": minor
---

## Features

- The `run_tests` MCP tool now uses Vitest's programmatic API (`createVitest()` + `start()` from `vitest/node`) instead of `spawnSync`. Tests run in-process, results flow through the full reporter pipeline into SQLite, and stdout/stderr are redirected to a null writable to protect the MCP stdio transport. Closes #23.
- Added `test_get` MCP tool for single-test drill-down. Returns the test's current state, error messages, classification badge (`[new-failure]`, `[persistent]`, `[flaky]`, `[stable]`, `[recovered]`), and run history.
- Added `file_coverage` MCP tool for per-file coverage data, returning line, branch, function, and statement percentages along with uncovered line ranges.
- `run_tests` output now includes classification badges and a Next Steps section after the run completes.
- Reporter now captures suite hierarchy via `allSuites()`, writes test tags to the `tags` and `test_case_tags` tables, and parses error stacks into structured `stack_frames` rows.
- Added a `coverage-improvement` skill to the Claude Code plugin with guidance on reading coverage gaps and writing tests to close them.

## Bug Fixes

- Fixed a crash when Vitest's `TestCase.diagnostic()` or `TestCase.result()` returns `undefined` for skipped, pending, or todo tests. Null guards have been added at all call sites in the report builder and reporter.
- Fixed `note_get` to return a structured response instead of `null` when a note is found.
- Fixed classification queries passing the wrong `subProject` parameter.
- Fixed nested suite `parentSuiteId` tracking so suite hierarchies are stored correctly in the database.

## Maintenance

- Status icons in MCP tool output replaced with Unicode symbols.
- `help.ts` updated to document all 24 current MCP tools.
- Session-start hook trimmed from 63 lines to 15 lines, removing redundant context.
- State enum validation added to the `test_list` discovery tool.
