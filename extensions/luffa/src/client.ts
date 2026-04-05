/**
 * Luffa Bot HTTP API client.
 *
 * Endpoints:
 *   POST /robot/receive  — poll for incoming messages
 *   POST /robot/send     — send DM
 *   POST /robot/sendGroup — send group message
 */

import type { LuffaParsedMessage, LuffaReceivedMessage, ResolvedLuffaAccount } from "./types.js";

const REQUEST_TIMEOUT_MS = 15_000;

// Track seen msgIds to deduplicate across polls.
const seenMsgIds = new Set<string>();
const MAX_SEEN_MSG_IDS = 10_000;

function trimSeenMsgIds(): void {
  if (seenMsgIds.size > MAX_SEEN_MSG_IDS) {
    const toRemove = seenMsgIds.size - MAX_SEEN_MSG_IDS / 2;
    let removed = 0;
    for (const id of seenMsgIds) {
      if (removed >= toRemove) break;
      seenMsgIds.delete(id);
      removed++;
    }
  }
}

export function isDuplicate(msgId: string): boolean {
  if (seenMsgIds.has(msgId)) return true;
  seenMsgIds.add(msgId);
  trimSeenMsgIds();
  return false;
}

async function postJson(url: string, body: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Luffa API ${res.status}: ${await res.text().catch(() => "")}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Poll the Luffa receive API for new messages.
 */
export async function receiveMessages(account: ResolvedLuffaAccount): Promise<LuffaReceivedMessage[]> {
  const url = `${account.apiBaseUrl}/robot/receive`;
  const data = await postJson(url, { secret: account.secret });
  if (!Array.isArray(data)) return [];
  return data as LuffaReceivedMessage[];
}

/**
 * Parse a raw message JSON string from the receive API.
 */
export function parseMessageContent(raw: string): LuffaParsedMessage | null {
  try {
    return JSON.parse(raw) as LuffaParsedMessage;
  } catch {
    return null;
  }
}

/**
 * Send a DM reply to a Luffa user.
 */
export async function sendDm(
  account: ResolvedLuffaAccount,
  uid: string,
  text: string,
): Promise<boolean> {
  const url = `${account.apiBaseUrl}/robot/send`;
  try {
    await postJson(url, {
      secret: account.secret,
      uid,
      msg: JSON.stringify({ text }),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Send a group message.
 */
export async function sendGroup(
  account: ResolvedLuffaAccount,
  uid: string,
  text: string,
): Promise<boolean> {
  const url = `${account.apiBaseUrl}/robot/sendGroup`;
  try {
    await postJson(url, {
      secret: account.secret,
      uid,
      msg: JSON.stringify({ text }),
      type: "1",
    });
    return true;
  } catch {
    return false;
  }
}
