---
"vitest-agent-reporter": minor
---

## Features

- Add `project_list` MCP tool to list all known projects with latest run status
- Add `test_list` MCP tool to list test cases with optional state/module/limit filters
- Add `module_list` MCP tool to list test modules (files) for a project
- Add `suite_list` MCP tool to list test suites (describe blocks) for a project
- Add `settings_list` MCP tool to list available settings hashes for the configure tool

All discovery tools return markdown tables with ID columns for use in other tool calls.

## Bug Fixes

- Fix `test_coverage` returning "no data" by reading from `file_coverage` table via new `getCoverage()` DataReader method
- Fix `test_for_file` returning empty by wiring up `writeSourceMap()` in the reporter
- Fix `configure` to default to latest settings when no hash provided
- Fix `note_list` and `note_search` to return markdown instead of raw JSON
- Fix `run_tests` to return formatted text instead of JSON object

Closes #15, closes #16
