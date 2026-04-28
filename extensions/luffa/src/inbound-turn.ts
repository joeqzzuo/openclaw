import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import { sendDm, sendGroup } from "./client.js";
import { buildLuffaInboundContext, type LuffaInboundMessage } from "./inbound-context.js";
import { getLuffaRuntime } from "./runtime.js";
import { buildLuffaInboundSessionKey } from "./session-key.js";
import type { ResolvedLuffaAccount } from "./types.js";

const CHANNEL_ID = "luffa";

function resolveLuffaInboundRoute(params: {
  cfg: OpenClawConfig;
  account: ResolvedLuffaAccount;
  msg: LuffaInboundMessage;
}) {
  const rt = getLuffaRuntime();
  const peerId = params.msg.chatType === "group" ? params.msg.groupId! : params.msg.from;
  const route = rt.channel.routing.resolveAgentRoute({
    cfg: params.cfg,
    channel: CHANNEL_ID,
    accountId: params.account.accountId,
    peer: {
      kind: params.msg.chatType === "group" ? "group" : "direct",
      id: peerId,
    },
  });
  return {
    rt,
    route,
    sessionKey: buildLuffaInboundSessionKey({
      agentId: route.agentId,
      accountId: params.account.accountId,
      peerId,
      chatType: params.msg.chatType,
      identityLinks: params.cfg.session?.identityLinks,
    }),
  };
}

export async function dispatchLuffaInboundTurn(params: {
  account: ResolvedLuffaAccount;
  msg: LuffaInboundMessage;
  log?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
}): Promise<null> {
  const rt = getLuffaRuntime();
  const currentCfg = await rt.config.loadConfig();

  const resolved = resolveLuffaInboundRoute({
    cfg: currentCfg,
    account: params.account,
    msg: params.msg,
  });
  const msgCtx = buildLuffaInboundContext({
    finalizeInboundContext: resolved.rt.channel.reply.finalizeInboundContext,
    account: params.account,
    msg: params.msg,
    sessionKey: resolved.sessionKey,
  });

  await resolved.rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: msgCtx,
    cfg: currentCfg,
    dispatcherOptions: {
      deliver: async (payload: { text?: string; body?: string }) => {
        const text = payload.text ?? payload.body;
        if (!text?.trim()) {
          params.log?.warn?.(`[luffa] deliver called with empty payload for ${params.msg.from}`);
          return;
        }
        params.log?.info?.(`[luffa] delivering reply to ${params.msg.from}: ${text.slice(0, 80)}`);
        try {
          let ok: boolean;
          if (params.msg.chatType === "group" && params.msg.groupId) {
            ok = await sendGroup(params.account, params.msg.groupId, text, params.log);
          } else {
            ok = await sendDm(params.account, params.msg.from, text, params.log);
          }
          if (!ok) {
            params.log?.error?.(`[luffa] send failed for ${params.msg.from}`);
          }
        } catch (err) {
          params.log?.error?.(`[luffa] send error: ${err instanceof Error ? err.message : err}`);
        }
      },
      onReplyStart: () => {
        params.log?.info?.(`Agent reply started for ${params.msg.from}`);
      },
    },
  });

  return null;
}
