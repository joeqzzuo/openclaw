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
  log?: { info?: (...args: unknown[]) => void };
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
        if (!text) return;
        if (params.msg.chatType === "group" && params.msg.groupId) {
          await sendGroup(params.account, params.msg.groupId, text);
        } else {
          await sendDm(params.account, params.msg.from, text);
        }
      },
      onReplyStart: () => {
        params.log?.info?.(`Agent reply started for ${params.msg.from}`);
      },
    },
  });

  return null;
}
