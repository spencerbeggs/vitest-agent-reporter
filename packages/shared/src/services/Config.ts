import type { ConfigFileService } from "config-file-effect";
import { ConfigFile } from "config-file-effect";
import type { VitestAgentReporterConfig } from "../schemas/Config.js";

/**
 * Service shape that `ConfigLive(projectDir)` provides to downstream
 * consumers. Re-exported so callers can spell out the concrete service
 * type without referencing the `ConfigFileService<A>` generic directly.
 */
export type VitestAgentReporterConfigFileService = ConfigFileService<VitestAgentReporterConfig>;

/**
 * Typed `Context.Tag` for the vitest-agent-reporter config file service.
 *
 * Both runtime packages (reporter, MCP) yield this tag to access the loaded
 * `VitestAgentReporterConfig`. The live layer is built per `projectDir` via
 * `ConfigLive(projectDir)`.
 */
export const VitestAgentReporterConfigFile = ConfigFile.Tag<VitestAgentReporterConfig>("vitest-agent-reporter/Config");
