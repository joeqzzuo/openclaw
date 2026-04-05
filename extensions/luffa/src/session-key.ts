import { buildAgentSessionKey } from "openclaw/plugin-sdk/core";

const CHANNEL_ID = "luffa";

export function buildLuffaInboundSessionKey(params: {
  agentId: string;
  accountId: string;
  peerId: string;
  chatType: "direct" | "group";
  identityLinks?: Record<string, string[]>;
}): string {
  return buildAgentSessionKey({
    agentId: params.agentId,
    channel: CHANNEL_ID,
    accountId: params.accountId,
    peer: {
      kind: params.chatType === "group" ? "group" : "direct",
      id: params.peerId,
    },
    dmScope: "per-account-channel-peer",
    identityLinks: params.identityLinks,
  });
}
