---
name: tdd
description: Guide test-driven development workflow using vitest-agent-reporter MCP tools. Use when implementing features with TDD, writing tests first, or following red-green-refactor cycle.
---

# Test-Driven Development Workflow

Follow the red-green-refactor cycle using MCP tools for test
intelligence.

## Before Writing Code

1. **Check existing coverage:** Use `test_for_file` to see which
   tests already cover the file you're modifying
2. **Review test history:** Use `test_history` to identify flaky
   tests in the area you're working on
3. **Check coverage gaps:** Use `test_coverage` to find uncovered
   lines that need tests

## Red Phase (Write Failing Test)

1. Write a test that describes the desired behavior
2. Run with `run_tests({ files: ["path/to/test.ts"] })` to confirm
   the test fails. Always use the MCP tool, not vitest via Bash
3. Verify the failure message is clear and specific

## Green Phase (Make It Pass)

1. Write the minimal code to make the test pass
2. Run with `run_tests({ files: ["path/to/test.ts"] })` targeting
   your specific test file
3. Confirm the test passes

## Refactor Phase

1. Clean up the implementation
2. Run the full test suite with `run_tests({})`
3. Check `test_coverage` to verify coverage didn't drop
4. Use `test_trends` to confirm coverage direction

All `run_tests` calls use Vitest's programmatic API in-process,
so results automatically persist to the database and all query
tools reflect the latest run immediately.

## Recording Decisions

Use `note_create` to document:

- Why you chose a particular test approach
- Edge cases you considered but deferred
- Design decisions that affect testability
