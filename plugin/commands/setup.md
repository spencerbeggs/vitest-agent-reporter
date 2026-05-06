---
description: Set up vitest-agent-plugin in the current project
disable-model-invocation: true
---

# Setup vitest-agent-plugin

Set up `vitest-agent-plugin` in this project. Follow these steps:

1. **Check if vitest.config.ts exists.** If not, inform the user they need a Vitest configuration first.

2. **Check if `vitest-agent-plugin` is installed.** Read the project's `package.json`. If `vitest-agent-plugin` is not in `dependencies` or `devDependencies`, install it as a dev dependency using the project's package manager. The plugin's MCP server loader requires the package to be present in the project's `node_modules`.

3. **Check if AgentPlugin is already imported.** Read the vitest config file and look for `AgentPlugin` or `vitest-agent-plugin` imports. If already present, inform the user it's already set up.

4. **Add the AgentPlugin import and configuration.** Edit the vitest config to add:

   ```typescript
   import { AgentPlugin } from "vitest-agent-plugin";
   ```

   And add `AgentPlugin()` to the `plugins` array.

5. **Run an initial test** to populate the database:

   ```bash
   pnpm test
   ```

6. **Verify MCP tools work** by calling `test_status`.

7. **Inform the user** that setup is complete and which MCP tools
   are now available.
