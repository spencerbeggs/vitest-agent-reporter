---
"vitest-agent-reporter": minor
---

## Bug Fixes

### Fatal Error Stack Traces

Fixed fatal errors swallowing stack traces and producing unhelpful `defect: {}` output. All four entry points (reporter, plugin, CLI, MCP server) now use `Cause.pretty()` to extract full error details from Effect FiberFailure instances. Fatal error output includes a link to the issue tracker.

### Plugin Error Handling

The `configureVitest` hook now wraps its body in a try/catch, logging formatted errors to stderr before re-throwing so Vitest knows configuration failed.

## Features

### MCP Help Tool

New `help` MCP tool that returns a complete catalog of all 22 tools organized by category with parameter names and descriptions. Agents can call `help()` to explore available capabilities.

### Improved Session Context

The SessionStart hook now explains what vitest-agent-reporter does, encourages MCP tool usage over raw `vitest run` commands, lists all 22 tools (previously 11), and includes `run_tests` usage examples at different scopes.
