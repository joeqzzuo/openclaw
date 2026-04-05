/**
 * Account resolution for the Luffa channel plugin.
 */

import {
  DEFAULT_ACCOUNT_ID,
  listCombinedAccountIds,
  resolveMergedAccountConfig,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/account-resolution";
import type { LuffaChannelConfig, ResolvedLuffaAccount } from "./types.js";

const DEFAULT_API_BASE_URL = "https://apibot.luffa.im";
const DEFAULT_POLL_INTERVAL_MS = 1000;

function getChannelConfig(cfg: OpenClawConfig): LuffaChannelConfig | undefined {
  return cfg?.channels?.luffa;
}

function resolveImplicitAccountId(channelCfg: LuffaChannelConfig): string | undefined {
  return channelCfg.secret || process.env.LUFFA_BOT_SECRET ? DEFAULT_ACCOUNT_ID : undefined;
}

function parseAllowedUserIds(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function listAccountIds(cfg: OpenClawConfig): string[] {
  const channelCfg = getChannelConfig(cfg);
  if (!channelCfg) return [];
  return listCombinedAccountIds({
    configuredAccountIds: Object.keys(channelCfg.accounts ?? {}),
    implicitAccountId: resolveImplicitAccountId(channelCfg),
  });
}

export function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedLuffaAccount {
  const channelCfg = getChannelConfig(cfg) ?? {};
  const id = accountId || DEFAULT_ACCOUNT_ID;
  const merged = resolveMergedAccountConfig<Record<string, unknown> & LuffaChannelConfig>({
    channelConfig: channelCfg as Record<string, unknown> & LuffaChannelConfig,
    accounts: channelCfg.accounts as
      | Record<string, Partial<Record<string, unknown> & LuffaChannelConfig>>
      | undefined,
    accountId: id,
  });

  const envSecret = process.env.LUFFA_BOT_SECRET ?? "";

  return {
    accountId: id,
    enabled: merged.enabled ?? true,
    secret: merged.secret ?? envSecret,
    apiBaseUrl: merged.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    pollIntervalMs: merged.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    dmPolicy: merged.dmPolicy ?? "open",
    allowedUserIds: parseAllowedUserIds(merged.allowedUserIds),
  };
}
