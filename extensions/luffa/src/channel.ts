/**
 * Luffa Channel Plugin for OpenClaw.
 *
 * Uses HTTP polling to receive messages and POST to send replies.
 */

import type { OpenClawConfig } from "openclaw/plugin-sdk/account-resolution";
import {
  createHybridChannelConfigAdapter,
  createScopedDmSecurityResolver,
} from "openclaw/plugin-sdk/channel-config-helpers";
import { waitUntilAbort } from "openclaw/plugin-sdk/channel-lifecycle";
import {
  composeWarningCollectors,
  createConditionalWarningCollector,
  projectAccountWarningCollector,
} from "openclaw/plugin-sdk/channel-policy";
import { attachChannelToResult } from "openclaw/plugin-sdk/channel-send-result";
import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import { createEmptyChannelDirectoryAdapter } from "openclaw/plugin-sdk/directory-runtime";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/setup";
import { listAccountIds, resolveAccount } from "./accounts.js";
import { sendDm, sendGroup } from "./client.js";
import { LuffaChannelConfigSchema } from "./config-schema.js";
import { startPolling } from "./poller.js";
import { luffaSetupAdapter, luffaSetupWizard } from "./setup-surface.js";
import type { ResolvedLuffaAccount } from "./types.js";

const CHANNEL_ID = "luffa";

const resolveLuffaDmPolicy = createScopedDmSecurityResolver<ResolvedLuffaAccount>({
  channelKey: CHANNEL_ID,
  resolvePolicy: (account) => account.dmPolicy,
  resolveAllowFrom: (account) => account.allowedUserIds,
  policyPathSuffix: "dmPolicy",
  defaultPolicy: "open",
  approveHint: "openclaw pairing approve luffa <code>",
  normalizeEntry: (raw) => raw.trim(),
});

const luffaConfigAdapter = createHybridChannelConfigAdapter<ResolvedLuffaAccount>({
  sectionKey: CHANNEL_ID,
  listAccountIds,
  resolveAccount,
  defaultAccountId: () => DEFAULT_ACCOUNT_ID,
  clearBaseFields: ["secret", "apiBaseUrl", "pollIntervalMs", "dmPolicy", "allowedUserIds"],
  resolveAllowFrom: (account) => account.allowedUserIds,
  formatAllowFrom: (allowFrom) =>
    allowFrom.map((entry) => String(entry).trim()).filter(Boolean),
});

const collectLuffaSecurityWarnings = createConditionalWarningCollector<ResolvedLuffaAccount>(
  (account) =>
    !account.secret && "- Luffa: bot secret is not configured. Polling will fail.",
  (account) =>
    account.dmPolicy === "allowlist" &&
    account.allowedUserIds.length === 0 &&
    '- Luffa: dmPolicy="allowlist" with empty allowedUserIds blocks all senders.',
);

type LuffaGatewayContext = {
  cfg: OpenClawConfig;
  accountId: string;
  abortSignal: AbortSignal;
  log?: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
  };
};

type LuffaOutboundContext = {
  cfg: OpenClawConfig;
  to: string;
  text?: string;
  mediaUrl?: string;
  accountId?: string | null;
};

function resolveOutboundAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): ResolvedLuffaAccount {
  return resolveAccount(cfg ?? {}, accountId);
}

/**
 * Parse the target string to determine if this is a group or DM send.
 * Group targets look like "group:xxx" or "luffa:group:xxx".
 * DM targets are plain uid or "luffa:xxx".
 */
function parseTarget(target: string): { uid: string; isGroup: boolean } {
  const cleaned = target.replace(/^luffa:/i, "");
  if (cleaned.startsWith("group:")) {
    return { uid: cleaned.replace(/^group:/, ""), isGroup: true };
  }
  return { uid: cleaned, isGroup: false };
}

export function createLuffaPlugin() {
  return createChatChannelPlugin({
    base: {
      id: CHANNEL_ID,
      meta: {
        id: CHANNEL_ID,
        label: "Luffa",
        selectionLabel: "Luffa (Bot API)",
        detailLabel: "Luffa (Bot API)",
        docsPath: "/channels/luffa",
        blurb: "Connect Luffa IM to OpenClaw",
        order: 91,
      },
      capabilities: {
        chatTypes: ["direct" as const, "group" as const],
        media: false,
        threads: false,
        reactions: false,
        edit: false,
        unsend: false,
        reply: false,
        effects: false,
        blockStreaming: false,
      },
      reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },
      configSchema: LuffaChannelConfigSchema,
      setup: luffaSetupAdapter,
      setupWizard: luffaSetupWizard,
      config: { ...luffaConfigAdapter },
      messaging: {
        normalizeTarget: (target: string) => {
          const trimmed = target.trim();
          if (!trimmed) return undefined;
          return trimmed.replace(/^luffa:/i, "").trim();
        },
        targetResolver: {
          looksLikeId: (id: string) => {
            const trimmed = id?.trim();
            if (!trimmed) return false;
            return /^(luffa:)?(group:)?\w+$/i.test(trimmed);
          },
          hint: "<userId> or group:<groupId>",
        },
      },
      directory: createEmptyChannelDirectoryAdapter(),
      gateway: {
        startAccount: async (ctx: LuffaGatewayContext) => {
          const { cfg, accountId, log, abortSignal } = ctx;
          const account = resolveAccount(cfg, accountId);

          if (!account.enabled) {
            log?.info?.(`Luffa account ${accountId} is disabled, skipping`);
            return waitUntilAbort(abortSignal);
          }
          if (!account.secret) {
            log?.warn?.(`Luffa account ${accountId} has no secret configured`);
            return waitUntilAbort(abortSignal);
          }

          log?.info?.(
            `Starting Luffa channel (account: ${accountId}, poll: ${account.pollIntervalMs}ms)`,
          );
          startPolling({ account, signal: abortSignal, log });

          return waitUntilAbort(abortSignal, () => {
            log?.info?.(`Stopping Luffa channel (account: ${accountId})`);
          });
        },
        stopAccount: async (ctx: LuffaGatewayContext) => {
          ctx.log?.info?.(`Luffa account ${ctx.accountId} stopped`);
        },
      },
      agentPrompt: {
        messageToolHints: () => [
          "",
          "### Luffa Formatting",
          "Luffa supports plain text messages only.",
          "- No markdown, bold, italic, or code blocks",
          "- No inline buttons or interactive elements",
          "- Use line breaks for readability",
          "- Keep messages concise",
        ],
      },
    },
    pairing: {
      text: {
        idLabel: "luffaUserId",
        message: "OpenClaw: your access has been approved.",
        notify: async ({ cfg, id, message }) => {
          const account = resolveAccount(cfg);
          if (!account.secret) return;
          await sendDm(account, id, message);
        },
      },
    },
    security: {
      resolveDmPolicy: resolveLuffaDmPolicy,
      collectWarnings: composeWarningCollectors(
        projectAccountWarningCollector<ResolvedLuffaAccount, { cfg: OpenClawConfig; account: ResolvedLuffaAccount }>(
          collectLuffaSecurityWarnings,
        ),
      ),
    },
    outbound: {
      deliveryMode: "gateway" as const,
      textChunkLimit: 4000,

      sendText: async ({ to, text, accountId, cfg }: LuffaOutboundContext & { text: string }) => {
        const account = resolveOutboundAccount(cfg, accountId);
        const { uid, isGroup } = parseTarget(to);
        const ok = isGroup
          ? await sendGroup(account, uid, text)
          : await sendDm(account, uid, text);
        if (!ok) {
          throw new Error(`Failed to send message to Luffa ${isGroup ? "group" : "user"} ${uid}`);
        }
        return attachChannelToResult(CHANNEL_ID, {
          messageId: `luffa-${Date.now()}`,
          chatId: uid,
        });
      },

      sendMedia: async ({ to, mediaUrl, accountId, cfg }: LuffaOutboundContext) => {
        // Luffa API does not support media attachments; send URL as text fallback.
        const account = resolveOutboundAccount(cfg, accountId);
        const { uid, isGroup } = parseTarget(to);
        const text = mediaUrl ?? "";
        const ok = isGroup
          ? await sendGroup(account, uid, text)
          : await sendDm(account, uid, text);
        if (!ok) {
          throw new Error(`Failed to send media to Luffa ${uid}`);
        }
        return attachChannelToResult(CHANNEL_ID, {
          messageId: `luffa-${Date.now()}`,
          chatId: uid,
        });
      },
    },
  }) as any;
}

export const luffaPlugin = createLuffaPlugin();