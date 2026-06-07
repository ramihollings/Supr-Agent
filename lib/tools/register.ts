import "./shell";
import "./web-search";
import "./subagent";
import "./subagent-team";
import "./initiate-mission";
import "./todo";
import "./skill-invoker";
import "./project-flow";
import "./browser";
import "./filesystem";
import "./github";

import { toolRegistry } from "../../lib/tools/registry";
import { registerNativeToolAdapters } from "../../lib/integrations/native-tools";
import { registerGithubAdapters } from "./github";

let nativeToolsRegistered = false;

export function registerNativeTools() {
  nativeToolsRegistered = true;
  const tools = toolRegistry.getAllTools();
  registerNativeToolAdapters(tools);
  registerGithubAdapters();
  return tools;
}

export function areNativeToolsRegistered() {
  return nativeToolsRegistered;
}

registerNativeTools();
