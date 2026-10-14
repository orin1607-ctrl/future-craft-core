// Conservative helpers: only confirmed sent messages establish outbound ownership.
export function backfillPage(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("invalid_backfill");
  const input = value as Record<string, unknown>;
  const from = typeof input.from === "string" ? Date.parse(input.from) : NaN;
  const until = typeof input.until === "string" ? Date.parse(input.until) : NaN;
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || until - from > 31 * 86400000) throw new Error("invalid_backfill_range");
  if (input.mailbox !== "inbox" && input.mailbox !== "sent") throw new Error("invalid_backfill_mailbox");
  const pageToken = input.pageToken == null ? "" : String(input.pageToken);
  if (pageToken.length > 2048 || /[\r\n]/.test(pageToken)) throw new Error("invalid_backfill_cursor");
  return { mailbox: input.mailbox, q: `in:${input.mailbox} after:${Math.floor(from / 1000)} before:${Math.ceil(until / 1000)}`, pageToken, maxResults: 5 };
}

export function verifiedOutboundThreads(rows: Array<{
  claim_id?: string | null; gmail_thread_id?: string | null;
  gmail_message_id?: string | null; status?: string | null;
}>) {
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    if (row.status !== "sent" || !row.claim_id || !row.gmail_message_id || !row.gmail_thread_id) continue;
    (result[row.claim_id] ||= []).push(row.gmail_thread_id);
  }
  return result;
}

export function safeReplyHeaders(messageId: string, references: string): string[] {
  // Reject injected/folded headers and malformed IDs rather than repairing them.
  const validId = /^<[^<>\s@]+@[^<>\s@]+>$/;
  if (/[\r\n]/.test(messageId) || !validId.test(messageId) || messageId.length > 254) return [];
  const prior = /[\r\n]/.test(references) ? [] : references.trim().split(/\s+/).filter((id) => validId.test(id) && id.length <= 254);
  const chain = [...new Set([...prior, messageId])];
  // Keep the References header below the RFC line limit, retaining the parent.
  while (chain.join(" ").length > 900) chain.shift();
  return [`In-Reply-To: ${messageId}`, `References: ${chain.join(" ")}`];
}

export function existingSendBlock(row: { status?: string; gmail_message_id?: string | null } | null): string | null {
  if (!row) return null;
  if (row.gmail_message_id) return "already_sent";
  if (row.status === "pending") return "send_in_progress";
  // A failed/unknown request may have been accepted by Gmail before a timeout.
  // Preserve its audit record and require reconciliation, never delete and resend.
  return "send_requires_reconciliation";
}
