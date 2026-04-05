import type { ResolvedLuffaAccount } from "./types.js";

const CHANNEL_ID = "luffa";

export type LuffaInboundMessage = {
  body: string;
  from: string;
  senderName: string;
  chatType: "direct" | "group";
  groupId?: string;
  accountId: string;
  msgId: string;
};

export function buildLuffaInboundContext<TContext>(params: {
  finalizeInboundContext: (ctx: Record<string, unknown>) => TContext;
  account: ResolvedLuffaAccount;
  msg: LuffaInboundMessage;
  sessionKey: string;
}): TContext {
  const { account, msg, sessionKey } = params;
  const to = msg.chatType === "group" ? `luffa:group:${msg.groupId}` : `luffa:${msg.from}`;
  return params.finalizeInboundContext({
    Body: msg.body,
    RawBody: msg.body,
    CommandBody: msg.body,
    From: `luffa:${msg.from}`,
    To: to,
    SessionKey: sessionKey,
    AccountId: account.accountId,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: to,
    ChatType: msg.chatType,
    SenderName: msg.senderName,
    SenderId: msg.from,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    ConversationLabel: msg.senderName || msg.from,
    Timestamp: Date.now(),
    CommandAuthorized: true,
  });
}
