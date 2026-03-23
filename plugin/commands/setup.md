---
description: Set up vitest-agent-reporter in the current project
disable-model-invocation: true
---

# Setup vitest-agent-reporter

Set up the vitest-agent-reporter in this project. Follow these
steps:

1. **Check if vitest.config.ts exists.** If not, inform the user
   they need a Vitest configuration first.

2. **Check if AgentPlugin is already imported.** Read the vitest
   config file and look for `AgentPlugin` or
   `vitest-agent-reporter` imports. If already present, inform
   the user it's already set up.

3. **Add the AgentPlugin import and configuration.** Edit the
   vitest config to add:

   ```typescript
   import { AgentPlugin } from "vitest-agent-reporter";
   ```

   And add `AgentPlugin()` to the `plugins` array.

4. **Run an initial test** to populate the database:

   ```bash
   pnpm test
   ```

5. **Verify MCP tools work** by calling `test_status`.

6. **Inform the user** that setup is complete and which MCP tools
   are now available.
