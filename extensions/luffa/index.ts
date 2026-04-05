import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { luffaPlugin } from "./src/channel.js";
import { setLuffaRuntime } from "./src/runtime.js";

export { luffaPlugin } from "./src/channel.js";
export { setLuffaRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "luffa",
  name: "Luffa",
  description: "Luffa IM channel plugin for OpenClaw",
  plugin: luffaPlugin,
  setRuntime: setLuffaRuntime,
});
