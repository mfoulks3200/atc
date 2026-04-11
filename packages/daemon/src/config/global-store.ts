/**
 * Factory for the daemon's global configuration store.
 *
 * Wires a LayeredConfigStore<GlobalConfig> to the canonical global schema,
 * defaults, file path, and channel. The daemon bootstrap constructs one
 * instance and passes it to the HTTP/WS layer.
 *
 * @see RULE-CONF-1
 */

import { join } from "node:path";
import { LayeredConfigStore, type ConfigLogger } from "./layered-store.js";
import {
  GLOBAL_CONFIG_DEFAULTS,
  GLOBAL_CONFIG_SCHEMA,
  type GlobalConfig,
} from "./schema.js";

/**
 * Creates a global config store rooted at `<atcDir>/config.json`.
 *
 * @param atcDir - Absolute path to the `.atc` directory.
 * @param publish - Channel-publish function (typically `ChannelRegistry.publish` bound).
 * @param logger - Logger for warnings and error reports.
 * @returns A ready-to-use LayeredConfigStore for global configuration.
 */
export function createGlobalConfigStore(
  atcDir: string,
  publish: (channel: string, data: unknown) => void,
  logger: ConfigLogger,
): LayeredConfigStore<GlobalConfig> {
  return new LayeredConfigStore<GlobalConfig>({
    schema: GLOBAL_CONFIG_SCHEMA,
    defaults: GLOBAL_CONFIG_DEFAULTS,
    filePath: join(atcDir, "config.json"),
    channel: "config:global",
    scope: "global",
    publish,
    logger,
  });
}
