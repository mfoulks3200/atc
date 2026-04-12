/**
 * Factory for a project-scoped configuration store.
 *
 * Wires a LayeredConfigStore<ProjectMetadataConfig> to the canonical project
 * schema, defaults, file path, and channel. The daemon creates one per
 * registered project.
 *
 * @see RULE-CRAFT-1
 */

import { join } from "node:path";
import { LayeredConfigStore, type ConfigLogger } from "./layered-store.js";
import {
  PROJECT_METADATA_DEFAULTS,
  PROJECT_METADATA_SCHEMA,
  type ProjectMetadataConfig,
} from "./schema.js";

/**
 * Creates a project config store rooted at `<projectDir>/metadata.json`.
 *
 * The store's defaults include the project name so that a fresh project
 * with no metadata.json still reports its name correctly.
 *
 * @param projectName - The project name (used in defaults and channel name).
 * @param projectDir - Absolute path to the project directory.
 * @param publish - Channel-publish function (typically `ChannelRegistry.publish` bound).
 * @param logger - Logger for warnings and error reports.
 * @returns A ready-to-use LayeredConfigStore for project metadata.
 *
 * @see RULE-CRAFT-1
 */
export function createProjectConfigStore(
  projectName: string,
  projectDir: string,
  publish: (channel: string, data: unknown) => void,
  logger: ConfigLogger,
): LayeredConfigStore<ProjectMetadataConfig> {
  return new LayeredConfigStore<ProjectMetadataConfig>({
    schema: PROJECT_METADATA_SCHEMA,
    defaults: { ...PROJECT_METADATA_DEFAULTS, name: projectName },
    filePath: join(projectDir, "metadata.json"),
    channel: `config:project:${projectName}`,
    scope: "project",
    publish,
    logger,
  });
}
