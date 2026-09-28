import type { ClaimRecord } from '@/features/claims/claimsConstants';
import { groupMailThreads, unifyCorrespondence, type MailCard } from '@/features/claims/claimMailThread';
import { untreatedMailIds, type AlertContext } from '@/features/claims/claimWorkAlerts';
import { parseFromAddr, type ClaimContact } from '@/features/claims/claimContacts';
import { isOpenTreatment, isTreatmentItem } from '@/features/claims/treatmentCenter';

/**
 * Display-only view of the existing claim correspondence.
 * Everything is derived from the same rows the current claims screen loads
 * (list_imports, list_sends, tasks, notifications, docs). Nothing here writes.
 */

export type MailViewState =
  | 'need'      // untreatedMailIds says the mail still needs attention
  | 'reply'     // same, and it answers a mail we sent
  | 'treating'  // linked to an open treatment ("המשך כטיפול")
  | 'handled'   // "קראתי" was used (tableAlert off / notification read)
  | 'received'  // incoming, never flagged
  | 'waiting'   // our last mail, tracked on the send journal, due not passed
  | 'overdue'   // our last mail, tracked, due passed
  | 'sent';     // outgoing without open tracking

export type ThreadViewState = 'act' | 'treating' | 'wait' | 'overdue' | 'done';

export type MailFilter = 'all' | 'need' | 'in' | 'out';

export type MailRowView = {
  mail: MailCard;
  state: MailViewState;
  who: string;
  to: string;
  snippet: string;
  attachCount: number;
  due: string;
};

export type ThreadView = {
  key: string;
  subject: string;
  mails: MailRowView[];
  state: ThreadViewState;
  last: MailRowView;
  participants: string[];
  inCount: number;
  outCount: number;
};

export type MailViewInput = {
  claim: ClaimRecord;
  imports: Array<Record<string, unknown>>;
  sends: Array<Record<string, unknown>>;
  ownMailbox: string;
  ctx: AlertContext;
  contacts: ClaimContact[];
  files: Array<{ gmail_message_id?: string | null }>;
  now?: number;
};

const OPEN_TRACK = new Set(['sent', 'waiting_reply', 'needs_action', '']);

function ms(v: unknown) {
  return new Date(String(v || '')).getTime() || 0;
}

function contactNameFor(email: string, contacts: ClaimContact[]) {
  if (!email) return '';
  const hit = contacts.find((c) => c.channels.some((ch) => ch.kind === 'email' && ch.value_norm === email));
  return hit?.full_name || '';
}

export function displayAddress(raw: string, contacts: ClaimContact[]) {
  const first = String(raw || '').split(',')[0] || '';
  const parsed = parseFromAddr(first);
  return contactNameFor(parsed.email, contacts) || parsed.name || parsed.email || first.trim() || '—';
}

/** First readable lines of the body, without the quoted original. */
export function mailSnippet(body: string, max = 140) {
  const text = String(body || '').replace(/\r/g, '');
  const cut = text.split(/\n>|\nOn .{0,200}wrote:|\n-{2,}\s*Original Message|\n-{2,}\s*Forwarded message|\nב[^\n]{0,120}כתב\/?ה?:/)[0];
  const flat = cut.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function buildMailView(input: MailViewInput): { threads: ThreadView[]; missingNeedIds: string[]; total: number } {
  const { claim, imports, sends, ownMailbox, ctx, contacts, files } = input;
  const now = input.now ?? Date.now();
  const unified = unifyCorrespondence(imports, sends, ownMailbox);
  const untreated = new Set(untreatedMailIds(claim, ctx));
  const tasks = ctx.tasks.filter((t) => t.claimId === claim.id);
  const sendByMid = new Map<string, Record<string, unknown>>();
  for (const s of sends) {
    const mid = String(s.gmail_message_id || '');
    if (mid) sendByMid.set(mid, s);
  }

  const groups = groupMailThreads(unified);
  const threads: ThreadView[] = groups.map((g) => {
    const rows: MailRowView[] = g.mails.map((m, idx) => {
      const mid = String(m.gmail_message_id || '');
      const prev = idx > 0 ? g.mails[idx - 1] : null;
      const isLast = idx === g.mails.length - 1;
      let state: MailViewState;
      let due = '';
      if (m.direction === 'incoming') {
        if (mid && untreated.has(mid)) state = prev?.direction === 'outgoing' ? 'reply' : 'need';
        else if (mid && tasks.some((t) => t.gmailMessageId === mid && isOpenTreatment(t))) state = 'treating';
        else if (mid && (
          tasks.some((t) => t.gmailMessageId === mid && !isTreatmentItem(t) && (t.tableAlert === 'off' || t.done === 'true'))
          || ctx.notifs.some((n) => n.claimId === claim.id && n.read === 'true' && String(n.gmail_message_id || n.gmailMessageId || '') === mid)
        )) state = 'handled';
        else state = 'received';
      } else {
        const send = sendByMid.get(mid);
        const track = String(send?.track_status || '');
        due = String(send?.track_due || '');
        const tracked = track === 'waiting_reply' || (Boolean(due) && OPEN_TRACK.has(track));
        if (isLast && tracked) state = due && ms(due) < now ? 'overdue' : 'waiting';
        else state = 'sent';
      }
      const attachCount = files.filter((f) => mid && f.gmail_message_id === mid).length || (m.file_names?.length || 0);
      const snippet = mailSnippet(m.body_text)
        || (m.direction === 'outgoing' ? `נשלח אל ${displayAddress(m.to_addr, contacts)}${attachCount ? ` · ${attachCount} קבצים` : ''}` : '(ללא תוכן)');
      return {
        mail: m,
        state,
        who: m.direction === 'outgoing' ? 'אני' : displayAddress(m.from_addr, contacts),
        to: displayAddress(m.to_addr, contacts),
        snippet,
        attachCount,
        due,
      };
    });
    const last = rows[rows.length - 1];
    const states = new Set(rows.map((r) => r.state));
    const state: ThreadViewState = states.has('need') || states.has('reply')
      ? 'act'
      : states.has('treating')
        ? 'treating'
        : last.state === 'overdue'
          ? 'overdue'
          : last.state === 'waiting'
            ? 'wait'
            : 'done';
    const participants = [...new Set(rows.map((r) => (r.mail.direction === 'outgoing' ? r.to : r.who)).filter((x) => x && x !== '—'))];
    return {
      key: g.thread,
      subject: rows.find((r) => r.mail.subject)?.mail.subject || '(ללא נושא)',
      mails: rows,
      state,
      last,
      participants,
      inCount: rows.filter((r) => r.mail.direction === 'incoming').length,
      outCount: rows.filter((r) => r.mail.direction === 'outgoing').length,
    };
  });

  const listed = new Set(unified.map((m) => String(m.gmail_message_id || '')));
  const missingNeedIds = [...untreated].filter((id) => id && !listed.has(id));
  return { threads, missingNeedIds, total: unified.length };
}

export function rowMatches(row: MailRowView, filter: MailFilter, query: string) {
  if (filter === 'need' && row.state !== 'need' && row.state !== 'reply') return false;
  if (filter === 'in' && row.mail.direction !== 'incoming') return false;
  if (filter === 'out' && row.mail.direction !== 'outgoing') return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.mail.subject, row.mail.body_text, row.mail.from_addr, row.mail.to_addr, row.who, row.to]
    .some((v) => String(v || '').toLowerCase().includes(q));
}

export function sectionOf(t: ThreadView): 'act' | 'wait' | 'rest' {
  if (t.state === 'act') return 'act';
  if (t.state === 'wait' || t.state === 'overdue') return 'wait';
  return 'rest';
}

export function mailViewCounts(threads: ThreadView[], now = Date.now()) {
  const rows = threads.flatMap((t) => t.mails);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return {
    total: rows.length,
    threads: threads.length,
    act: rows.filter((r) => r.state === 'need' || r.state === 'reply').length,
    waitThreads: threads.filter((t) => t.state === 'wait' || t.state === 'overdue').length,
    overdueThreads: threads.filter((t) => t.state === 'overdue').length,
    incoming: rows.filter((r) => r.mail.direction === 'incoming').length,
    outgoing: rows.filter((r) => r.mail.direction === 'outgoing').length,
    newToday: rows.filter((r) => r.mail.direction === 'incoming' && ms(r.mail.sent_at) >= today.getTime()).length,
  };
}
