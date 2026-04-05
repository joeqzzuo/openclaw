import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setLuffaRuntime, getRuntime: getLuffaRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Luffa runtime not initialized - plugin not registered");
export { getLuffaRuntime, setLuffaRuntime };
