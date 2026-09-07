/** Unify imported + sent mail for one thread view. Dedup by Gmail message id. */

export type MailCard = {
  id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  subject: string;
  from_addr: string;
  to_addr: string;
  cc_addr: string;
  sent_at: string;
  body_text: string;
  direction: 'incoming' | 'outgoing';
  source: 'import' | 'send' | 'both';
  send_no?: string;
  file_names?: string[];
  staff_note?: string;
};

function whenMs(v: unknown) {
  return new Date(String(v || '')).getTime() || 0;
}

export function mailLooksOutgoing(fromAddr: string, ownMailbox: string) {
  const from = String(fromAddr || '').toLowerCase();
  const own = String(ownMailbox || '').toLowerCase();
  return Boolean(own && from && from.includes(own));
}

export function unifyCorrespondence(
  imports: Array<Record<string, unknown>>,
  sends: Array<Record<string, unknown>>,
  ownMailbox: string,
): MailCard[] {
  const byMid = new Map<string, MailCard>();
  for (const im of imports) {
    const mid = String(im.gmail_message_id || im.id || '');
    if (!mid) continue;
    const from = String(im.from_addr || '');
    byMid.set(mid, {
      id: String(im.id || mid),
      gmail_message_id: mid,
      gmail_thread_id: String(im.gmail_thread_id || mid),
      subject: String(im.subject || ''),
      from_addr: from,
      to_addr: String(im.to_addr || ''),
      cc_addr: String(im.cc_addr || ''),
      sent_at: String(im.sent_at || ''),
      body_text: String(im.body_text || ''),
      direction: mailLooksOutgoing(from, ownMailbox) ? 'outgoing' : 'incoming',
      source: 'import',
      staff_note: String(im.staff_note || ''),
    });
  }
  for (const s of sends) {
    const mid = String(s.gmail_message_id || s.id || '');
    if (!mid) continue;
    const prev = byMid.get(mid);
    const outgoing: MailCard = {
      id: prev?.id || String(s.id || mid),
      gmail_message_id: mid,
      gmail_thread_id: String(s.gmail_thread_id || prev?.gmail_thread_id || mid),
      subject: prev?.subject || String(s.subject || ''),
      from_addr: prev?.from_addr || String(s.from_addr || ownMailbox),
      to_addr: prev?.to_addr || String(s.to_addr || ''),
      cc_addr: prev?.cc_addr || String(s.cc_addr || ''),
      sent_at: prev?.sent_at || String(s.sent_at || ''),
      body_text: prev?.body_text || '',
      direction: 'outgoing',
      source: prev ? 'both' : 'send',
      send_no: String(s.send_no || ''),
      file_names: Array.isArray(s.file_names) ? s.file_names as string[] : prev?.file_names,
      staff_note: prev?.staff_note || '',
    };
    byMid.set(mid, outgoing);
  }
  return [...byMid.values()].sort((a, b) => whenMs(a.sent_at) - whenMs(b.sent_at));
}

export function groupMailThreads(mails: MailCard[]) {
  const groups: Array<{ thread: string; mails: MailCard[] }> = [];
  const idx = new Map<string, number>();
  for (const m of mails) {
    const thread = m.gmail_thread_id || m.gmail_message_id || m.id;
    if (!idx.has(thread)) {
      idx.set(thread, groups.length);
      groups.push({ thread, mails: [] });
    }
    groups[idx.get(thread)!].mails.push(m);
  }
  for (const g of groups) g.mails.sort((a, b) => whenMs(a.sent_at) - whenMs(b.sent_at));
  return groups.sort((a, b) => {
    const last = (g: typeof a) => Math.max(0, ...g.mails.map((m) => whenMs(m.sent_at)));
    return last(b) - last(a);
  });
}
