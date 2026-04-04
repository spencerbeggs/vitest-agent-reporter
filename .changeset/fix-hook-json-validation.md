---
"vitest-agent-reporter": patch
---

## Bug Fixes

Fix hook JSON output validation errors by outputting proper hookSpecificOutput JSON instead of plain markdown, using XML tags for additionalContext, and consuming stdin in SessionStart hook
