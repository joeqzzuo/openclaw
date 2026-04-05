import {
  createStandardChannelSetupStatus,
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  normalizeAccountId,
  setSetupChannelEnabled,
  type ChannelSetupAdapter,
  type ChannelSetupWizard,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/setup";
import { listAccountIds, resolveAccount } from "./accounts.js";
import type { LuffaChannelConfig } from "./types.js";

const channel = "luffa" as const;

function getChannelConfig(cfg: OpenClawConfig): LuffaChannelConfig {
  return (cfg.channels?.[channel] as LuffaChannelConfig | undefined) ?? {};
}

function patchLuffaAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  patch: Record<string, unknown>;
  clearFields?: string[];
  enabled?: boolean;
}): OpenClawConfig {
  const channelConfig = getChannelConfig(params.cfg);
  if (params.accountId === DEFAULT_ACCOUNT_ID) {
    const nextChannelConfig = { ...channelConfig } as Record<string, unknown>;
    for (const field of params.clearFields ?? []) {
      delete nextChannelConfig[field];
    }
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        [channel]: {
          ...nextChannelConfig,
          ...(params.enabled ? { enabled: true } : {}),
          ...params.patch,
        },
      },
    };
  }
  const nextAccounts = { ...(channelConfig.accounts ?? {}) } as Record<
    string,
    Record<string, unknown>
  >;
  nextAccounts[params.accountId] = {
    ...(nextAccounts[params.accountId] ?? {}),
    ...(params.enabled ? { enabled: true } : {}),
    ...params.patch,
  };
  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [channel]: { ...channelConfig, accounts: nextAccounts },
    },
  };
}

function isLuffaConfigured(cfg: OpenClawConfig, accountId: string): boolean {
  const account = resolveAccount(cfg, accountId);
  return Boolean(account.secret.trim());
}

export const luffaSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID,
  validateInput: ({ input }) => {
    if (!input.useEnv && !input.token?.trim()) {
      return "Luffa requires --token (bot secret) or --use-env (LUFFA_BOT_SECRET).";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) =>
    patchLuffaAccountConfig({
      cfg,
      accountId,
      enabled: true,
      clearFields: input.useEnv ? ["secret"] : undefined,
      patch: {
        ...(input.useEnv ? {} : { secret: input.token?.trim() }),
      },
    }),
};

export const luffaSetupWizard: ChannelSetupWizard = {
  channel,
  status: createStandardChannelSetupStatus({
    channelLabel: "Luffa",
    configuredLabel: "configured",
    unconfiguredLabel: "needs bot secret",
    configuredHint: "configured",
    unconfiguredHint: "needs bot secret",
    configuredScore: 1,
    unconfiguredScore: 0,
    includeStatusLine: true,
    resolveConfigured: ({ cfg }) =>
      listAccountIds(cfg).some((id) => isLuffaConfigured(cfg, id)),
    resolveExtraStatusLines: ({ cfg }) => [`Accounts: ${listAccountIds(cfg).length || 0}`],
  }),
  introNote: {
    title: "Luffa bot setup",
    lines: [
      "1) Get your bot secret from the Luffa bot platform",
      "2) Provide the secret key to OpenClaw",
      "3) The bot will poll for messages automatically",
    ],
  },
  credentials: [
    {
      inputKey: "token",
      providerHint: channel,
      credentialLabel: "bot secret",
      preferredEnvVar: "LUFFA_BOT_SECRET",
      helpTitle: "Luffa bot secret",
      helpLines: ["The bot secret is used to authenticate with the Luffa Bot API."],
      envPrompt: "LUFFA_BOT_SECRET detected. Use env var?",
      keepPrompt: "Luffa bot secret already configured. Keep it?",
      inputPrompt: "Enter Luffa bot secret",
      allowEnv: ({ accountId }) => accountId === DEFAULT_ACCOUNT_ID,
      inspect: ({ cfg, accountId }) => {
        const account = resolveAccount(cfg, accountId);
        const raw = getChannelConfig(cfg);
        return {
          accountConfigured: isLuffaConfigured(cfg, accountId),
          hasConfiguredValue: Boolean(raw.secret?.trim()),
          resolvedValue: account.secret.trim() || undefined,
          envValue:
            accountId === DEFAULT_ACCOUNT_ID
              ? process.env.LUFFA_BOT_SECRET?.trim() || undefined
              : undefined,
        };
      },
      applyUseEnv: async ({ cfg, accountId }) =>
        patchLuffaAccountConfig({
          cfg,
          accountId,
          enabled: true,
          clearFields: ["secret"],
          patch: {},
        }),
      applySet: async ({ cfg, accountId, resolvedValue }) =>
        patchLuffaAccountConfig({
          cfg,
          accountId,
          enabled: true,
          patch: { secret: resolvedValue },
        }),
    },
  ],
  completionNote: {
    title: "Luffa channel ready",
    lines: [
      "The bot will poll for new messages every second.",
      "DM policy defaults to open. Set channels.luffa.dmPolicy to restrict.",
    ],
  },
  disable: (cfg) => setSetupChannelEnabled(cfg, channel, false),
};