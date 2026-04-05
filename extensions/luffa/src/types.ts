/** Raw channel config from openclaw.json channels.luffa */
export interface LuffaChannelConfig {
  enabled?: boolean;
  /** Bot secret key for the Luffa Bot API. */
  secret?: string;
  /** Base URL for the Luffa Bot API (default: https://apibot.luffa.im). */
  apiBaseUrl?: string;
  /** Polling interval in milliseconds (default: 1000). */
  pollIntervalMs?: number;
  /** DM policy: open | allowlist | disabled. */
  dmPolicy?: "open" | "allowlist" | "disabled";
  /** Allowed Luffa user IDs for DM. */
  allowedUserIds?: string | string[];
  /** Per-account overrides. */
  accounts?: Record<string, LuffaAccountRaw>;
}

/** Raw per-account config (overrides base config). */
export interface LuffaAccountRaw {
  enabled?: boolean;
  secret?: string;
  apiBaseUrl?: string;
  pollIntervalMs?: number;
  dmPolicy?: "open" | "allowlist" | "disabled";
  allowedUserIds?: string | string[];
}

/** Fully resolved account config with defaults applied. */
export interface ResolvedLuffaAccount {
  accountId: string;
  enabled: boolean;
  secret: string;
  apiBaseUrl: string;
  pollIntervalMs: number;
  dmPolicy: "open" | "allowlist" | "disabled";
  allowedUserIds: string[];
}

/** A single message entry from the Luffa receive API. */
export interface LuffaReceivedMessage {
  uid: string;
  count: string;
  message: string[];
  type: string; // "0" = DM, "1" = group
}

/** Parsed content of a single message JSON string. */
export interface LuffaParsedMessage {
  uid?: number; // sender uid (group messages only)
  atList?: Array<{ did?: string; name?: string }>;
  text?: string;
  urlLink?: string | null;
  msgId?: string;
}
