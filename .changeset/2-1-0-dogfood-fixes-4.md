---
"vitest-agent-reporter-mcp": patch
---

## Bug Fixes

### `post-tool-use-tdd-artifact.sh` now correctly classifies MCP `run_tests` failures

The hook's MCP-namespaced branch extracted the tool response via the jq path `.tool_response.content[].text`, but Claude Code surfaces MCP tool results with `tool_response` as a top-level array of `{type, text}` content blocks — not a `tool_response.content[]` object. The path always evaluated to an empty string, the classification regex never matched, and `kind` defaulted to `test_passed_run`. Every MCP-invoked failing test was silently recorded as a passing run, so red→green phase transitions failed validation with a misleading `missing_artifact_evidence` denial.

The hook now reads the array shape directly, classifies strictly on the `## ✅ Vitest` and `## ❌ Vitest` headline tokens emitted by `formatReportMarkdown`, and skips the artifact write entirely when neither pattern matches. Silent misclassification breaks evidence-based phase transitions far worse than a missing artifact does.

### Pinning tests for the MCP `run_tests` markdown headline

`formatReportMarkdown` is the contract the hook depends on: if its first-line tokens ever change, the hook regex needs to follow. Two new tests in `run-tests.test.ts` lock the `## ✅ Vitest` and `## ❌ Vitest` first-line tokens with a comment cross-referencing the hook so future formatter changes can't silently re-break this.
