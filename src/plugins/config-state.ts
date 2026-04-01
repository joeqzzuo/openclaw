import type { OpenClawConfig } from "../config/config.js";
import {
  BUNDLED_LEGACY_PLUGIN_ID_ALIASES,
  BUNDLED_PROVIDER_PLUGIN_ID_ALIASES,
} from "./bundled-capability-metadata.js";
import {
  hasExplicitPluginConfig,
  isBundledChannelEnabledByChannelConfig,
  normalizePluginsConfigWithResolver,
  resolveEffectiveEnableState,
  resolveEffectivePluginActivationState,
  resolveEnableState,
  resolveMemorySlotDecision,
  resolvePluginActivationState,
} from "./config-policy.js";

export type {
  NormalizedPluginsConfig,
  PluginActivationSource,
  PluginActivationState,
} from "./config-policy.js";

export function normalizePluginId(id: string): string {
  const trimmed = id.trim();
  return (
    BUNDLED_LEGACY_PLUGIN_ID_ALIASES[trimmed] ??
    BUNDLED_PROVIDER_PLUGIN_ID_ALIASES[trimmed] ??
    trimmed
  );
}

export const normalizePluginsConfig = (config?: OpenClawConfig["plugins"]) => {
  return normalizePluginsConfigWithResolver(config, normalizePluginId);
};

const hasExplicitMemorySlot = (plugins?: OpenClawConfig["plugins"]) =>
  Boolean(plugins?.slots && Object.prototype.hasOwnProperty.call(plugins.slots, "memory"));

const hasExplicitMemoryEntry = (plugins?: OpenClawConfig["plugins"]) =>
  Boolean(plugins?.entries && Object.prototype.hasOwnProperty.call(plugins.entries, "memory-core"));

export function applyTestPluginDefaults(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): OpenClawConfig {
  if (!env.VITEST) {
    return cfg;
  }
  const plugins = cfg.plugins;
  const explicitConfig = hasExplicitPluginConfig(plugins);
  if (explicitConfig) {
    if (hasExplicitMemorySlot(plugins) || hasExplicitMemoryEntry(plugins)) {
      return cfg;
    }
    return {
      ...cfg,
      plugins: {
        ...plugins,
        slots: {
          ...plugins?.slots,
          memory: "none",
        },
      },
    };
  }

  return {
    ...cfg,
    plugins: {
      ...plugins,
      enabled: false,
      slots: {
        ...plugins?.slots,
        memory: "none",
      },
    },
  };
}

export function isTestDefaultMemorySlotDisabled(
  cfg: OpenClawConfig,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!env.VITEST) {
    return false;
  }
  const plugins = cfg.plugins;
  if (hasExplicitMemorySlot(plugins) || hasExplicitMemoryEntry(plugins)) {
    return false;
  }
  return true;
}

export {
  isBundledChannelEnabledByChannelConfig,
  resolveEffectiveEnableState,
  resolveEffectivePluginActivationState,
  resolveEnableState,
  resolveMemorySlotDecision,
  resolvePluginActivationState,
};
