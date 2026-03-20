---
"vitest-agent-reporter": minor
---

## Features

- **AgentReporter** -- Vitest Reporter producing structured markdown to
  console, persistent JSON to disk, and optional GFM for GitHub Actions
  check runs. Groups results by project natively via the Reporter v2 API.
- **AgentPlugin** -- Vitest plugin that auto-injects AgentReporter with
  three-environment detection (agent/CI/human). Suppresses console reporters
  in agent mode, adds GFM in CI mode, runs silently for humans.
- Auto-detects 9+ LLM coding agents (Claude Code, Gemini CLI, Cursor,
  Cline, Codex, Augment, Goose, Amp, and the AI_AGENT standard)
- Coverage integration with istanbul duck-typing (v8 and istanbul providers)
- Zod 4 schemas with codecs for JSON encode/decode of reports and manifests
- Cache directory derived from Vite's cacheDir by default
- Coverage thresholds read from Vitest config automatically
- Compact console output with failure details, coverage gaps, and re-run
  commands
