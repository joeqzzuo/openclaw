/**
 * Luffa message poller.
 *
 * Polls POST /robot/receive every N ms and dispatches inbound messages.
 * The Luffa receive API may return the same messages across consecutive polls
 * until they are "consumed", so robust deduplication is critical.
 */

import { isDuplicate, parseMessageContent, receiveMessages } from "./client.js";
import { dispatchLuffaInboundTurn } from "./inbound-turn.js";
import type { LuffaParsedMessage, ResolvedLuffaAccount } from "./types.js";

type PollerLog = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

// Track in-flight dispatches to avoid re-dispatching while agent is still
// processing a previous message from the same sender.
const inFlight = new Set<string>();

/**
 * Build a stable dedup key when msgId is missing.
 * Uses uid + first 100 chars of text so the same message content from the
 * same user is not processed twice across polls.
 */
function buildFallbackMsgId(uid: string, text: string): string {
  return `${uid}:${text.slice(0, 100)}`;
}

export function startPolling(params: {
  account: ResolvedLuffaAccount;
  signal: AbortSignal;
  log?: PollerLog;
}): void {
  const { account, signal, log } = params;
  let polling = false;

  async function poll(): Promise<void> {
    if (signal.aborted) return;
    // Prevent overlapping polls if a previous one hasn't finished.
    if (polling) return;
    polling = true;
    try {
      const entries = await receiveMessages(account);
      for (const entry of entries) {
        const isGroup = entry.type === "1";
        for (const rawMsg of entry.message) {
          const parsed: LuffaParsedMessage | null = parseMessageContent(rawMsg);
          if (!parsed?.text?.trim()) continue;

          const msgId = parsed.msgId ?? buildFallbackMsgId(entry.uid, parsed.text);
          if (isDuplicate(msgId)) continue;

          const senderId = isGroup ? String(parsed.uid ?? entry.uid) : entry.uid;

          // Skip if we're already processing a message for this sender to
          // avoid the "Agent reply started" spam from duplicate polls.
          const flightKey = `${entry.uid}:${senderId}`;
          if (inFlight.has(flightKey)) continue;
          inFlight.add(flightKey);

          log?.info?.(`[luffa] ${isGroup ? "group" : "dm"} from ${senderId}: ${parsed.text.slice(0, 80)}`);

          dispatchLuffaInboundTurn({
            account,
            msg: {
              body: parsed.text,
              from: senderId,
              senderName: senderId,
              chatType: isGroup ? "group" : "direct",
              groupId: isGroup ? entry.uid : undefined,
              accountId: account.accountId,
              msgId,
            },
            log,
          })
            .catch((err) => {
              log?.error?.(`[luffa] dispatch error: ${err instanceof Error ? err.message : err}`);
            })
            .finally(() => {
              inFlight.delete(flightKey);
            });
        }
      }
    } catch (err) {
      log?.warn?.(`[luffa] poll error: ${err instanceof Error ? err.message : err}`);
    } finally {
      polling = false;
    }
  }

  const interval = setInterval(() => void poll(), account.pollIntervalMs);
  signal.addEventListener("abort", () => clearInterval(interval), { once: true });

  // Kick off an immediate first poll.
  void poll();
}
