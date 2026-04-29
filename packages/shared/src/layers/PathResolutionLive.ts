import { Layer } from "effect";
import { WorkspacesLive } from "workspaces-effect";
import { AppDirsConfig, XdgLive } from "xdg-effect";
import { ConfigLive } from "./ConfigLive.js";

const APP_NAMESPACE = "vitest-agent-reporter";

/**
 * Composite layer providing every service `resolveDataPath` requires:
 * `AppDirs` (XDG path resolution), `VitestAgentReporterConfigFile` (TOML
 * config loader), `WorkspaceDiscovery` and `WorkspaceRoot` (workspace name
 * lookup).
 *
 * Callers still need to provide `FileSystem` and `Path` from
 * `@effect/platform-node`'s `NodeContext.layer` (or the equivalent on Bun).
 *
 * @param projectDir - Absolute path inside the user's workspace, used to
 *   anchor the config file resolvers.
 */
export const PathResolutionLive = (projectDir: string) =>
	Layer.mergeAll(XdgLive(new AppDirsConfig({ namespace: APP_NAMESPACE })), ConfigLive(projectDir), WorkspacesLive);
