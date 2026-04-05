/**
 * Luffa message poller.
 *
 * Polls POST /robot/receive every N ms and dispatches inbound messages.
 */

import { isDuplicate, parseMessageContent, receiveMessages } from "./client.js";
import { dispatchLuffaInboundTurn } from "./inbound-turn.js";
import type { LuffaParsedMessage, ResolvedLuffaAccount } from "./types.js";

type PollerLog = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

export function startPolling(params: {
  account: ResolvedLuffaAccount;
  signal: AbortSignal;
  log?: PollerLog;
}): void {
  const { account, signal, log } = params;

  async function poll(): Promise<void> {
    if (signal.aborted) return;
    try {
      const entries = await receiveMessages(account);
      for (const entry of entries) {
        const isGroup = entry.type === "1";
        for (const rawMsg of entry.message) {
          const parsed: LuffaParsedMessage | null = parseMessageContent(rawMsg);
          if (!parsed?.text?.trim()) continue;
          const msgId = parsed.msgId ?? `${entry.uid}-${Date.now()}`;
          if (isDuplicate(msgId)) continue;

          const senderId = isGroup ? String(parsed.uid ?? entry.uid) : entry.uid;
          const senderName = senderId;

          log?.info?.(`[luffa] ${isGroup ? "group" : "dm"} from ${senderId}: ${parsed.text.slice(0, 80)}`);

          dispatchLuffaInboundTurn({
            account,
            msg: {
              body: parsed.text,
              from: senderId,
              senderName,
              chatType: isGroup ? "group" : "direct",
              groupId: isGroup ? entry.uid : undefined,
              accountId: account.accountId,
              msgId,
            },
            log,
          }).catch((err) => {
            log?.error?.(`[luffa] dispatch error: ${err instanceof Error ? err.message : err}`);
          });
        }
      }
    } catch (err) {
      log?.warn?.(`[luffa] poll error: ${err instanceof Error ? err.message : err}`);
    }
  }

  const interval = setInterval(() => void poll(), account.pollIntervalMs);
  signal.addEventListener("abort", () => clearInterval(interval), { once: true });

  // Kick off an immediate first poll.
  void poll();
}
