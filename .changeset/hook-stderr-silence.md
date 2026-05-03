---
"vitest-agent-reporter": patch
---

## Bug Fixes

### Plugin hooks no longer flood Claude Code's debug log

When a record-CLI invocation inside a hook failed (most commonly because the active session is a subagent without a `sessions` row — e.g. any non-orchestrator subagent firing PostToolUse), the hook's `|| echo "...failed (non-fatal)" >&2` fallback emitted a stderr line for every Edit / Write / MultiEdit / Bash tool call. Claude Code reads hook stderr alongside stdout and logs each non-JSON line as `Hook output does not start with {, treating as plain text`, producing 3-5 noisy debug entries per tool invocation under normal operation.

Replaced the stderr fallbacks across all 13 record-driving hooks with silent `|| true`. The hooks still emit their final `{"continue": true}` JSON on stdout; the natural symptom of a real recording failure (missing rows in `sessions` / `turns` / `tdd_artifacts`) remains observable via the database. The `WARNING: detected weakening token` stderr line in `post-tool-use-test-quality.sh` is preserved because it fires only on actual anti-pattern detection by the orchestrator and is intended as transcript signal, not debug telemetry.
