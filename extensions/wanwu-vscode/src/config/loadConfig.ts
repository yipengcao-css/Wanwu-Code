import { loadWanwuConfig, type LoadedConfig } from "../../../packages/wanwu-config/src/load";
import { findExtensionWorkspaceRoot } from "../workspaceRoot";

/** Load the same merged Wanwu config used by the CLI. */
export function loadExtensionConfig(): LoadedConfig {
  return loadWanwuConfig(findExtensionWorkspaceRoot());
}