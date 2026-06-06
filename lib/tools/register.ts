import "./shell";
import "./web-search";
import "./subagent";
import "./subagent-team";
import "./todo";
import "./skill-invoker";
import "./project-flow";

import { toolRegistry } from "../../lib/tools/registry";

let nativeToolsRegistered = false;

export function registerNativeTools() {
  nativeToolsRegistered = true;
  return toolRegistry.getAllTools();
}

export function areNativeToolsRegistered() {
  return nativeToolsRegistered;
}

registerNativeTools();
