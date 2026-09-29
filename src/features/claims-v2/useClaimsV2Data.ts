import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClaimsApi, type MailFollowupRow } from '@/features/claims/claimsService';
import type { ClaimRecord, ClaimsActor } from '@/features/claims/claimsConstants';
import type { AlertContext } from '@/features/claims/claimWorkAlerts';
import type { ClaimContact } from '@/features/claims/claimContacts';
import type { ShareRow } from '@/features/claims/claimSecureShare';
import type { isImageFile } from '@/features/claims/ClaimsScreen';
import { createReadOnlyClaimsApi } from './readOnlyClaimsApi';

/** Same row shape the current claims screen uses for claim files. */
export type ClaimFileRow = Parameters<typeof isImageFile>[0];
export type DocRequestRow = { id: string; label: string; status: string; received_at?: string; doc_key?: string };

export type CardData = {
  claimId: string;
  history: ClaimRecord[];
  comm: ClaimRecord[];
  tasks: ClaimRecord[];
  reminders: ClaimRecord[];
  followups: MailFollowupRow[];
  imports: Array<Record<string, unknown>>;
  sends: Array<Record<string, unknown>>;
  files: ClaimFileRow[];
  requests: DocRequestRow[];
  shares: ShareRow[];
  contacts: ClaimContact[];
  uploadLink: { active: boolean; expires_at?: string; created_at?: string } | null;
  garage: Record<string, unknown> | null;
};

function rows<T = Record<string, unknown>>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Loads exactly what the current claims screen loads, through the same claimsService
 * and Edge Function read actions. Deliberately NOT called: stopRecurringIfReplied
 * (it writes) and status with probe (it refreshes the Gmail token).
 */
export function useClaimsV2Data(actor: ClaimsActor) {
  const api = useMemo(() => createReadOnlyClaimsApi(createClaimsApi(actor)), [actor.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [notifs, setNotifs] = useState<ClaimRecord[]>([]);
  const [tasks, setTasks] = useState<ClaimRecord[]>([]);
  const [reminders, setReminders] = useState<ClaimRecord[]>([]);
  const [pending, setPending] = useState<Array<Record<string, unknown>>>([]);
  const [followups, setFollowups] = useState<MailFollowupRow[]>([]);
  const [garageReviews, setGarageReviews] = useState<Record<string, { review_status?: string }>>({});
  const [ownMailbox, setOwnMailbox] = useState('');
  const [gmail, setGmail] = useState<{ connected: boolean; email: string; lastScanAt: string; sendEnabled: boolean | null }>({ connected: false, email: '', lastScanAt: '', sendEnabled: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [card, setCard] = useState<CardData | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const cardGen = useRef(0);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cr, nr, tr, rr, pr, fu, gr, st] = await Promise.all([
        api.getClaims(),
        api.getNotifications(),
        api.getTasks(null),
        api.getReminders(null),
        api.invokeGmail('list_pending').catch(() => ({ success: false })),
        api.listScheduledMailFollowups().catch(() => ({ success: false, data: [] })),
        api.invokeDocs('list_garage_reviews').catch(() => ({})),
        api.invokeGmail('status').catch(() => ({})),
      ]);
      setClaims(cr.data || []);
      setNotifs(nr.data || []);
      setTasks(tr.data || []);
      setReminders(rr.data || []);
      const p = pr as { success?: boolean; data?: unknown };
      setPending(p.success ? rows(p.data) : []);
      const f = fu as { success?: boolean; data?: MailFollowupRow[] };
      setFollowups(f.success ? f.data || [] : []);
      const map: Record<string, { review_status?: string }> = {};
      const g = gr as { success?: boolean; reviews?: Array<{ claim_id?: string; review_status?: string }> };
      if (g?.success && Array.isArray(g.reviews)) {
        for (const row of g.reviews) if (row?.claim_id) map[row.claim_id] = { review_status: String(row.review_status || '') };
      }
      setGarageReviews(map);
      const s = st as { email?: string | null; accountExpected?: string | null; connected?: boolean; lastScanAt?: string | null; sendEnabled?: boolean };
      setOwnMailbox(String(s?.email || s?.accountExpected || '').toLowerCase());
      setGmail({ connected: Boolean(s?.connected), email: String(s?.email || ''), lastScanAt: String(s?.lastScanAt || ''), sendEnabled: typeof s?.sendEnabled === 'boolean' ? s.sendEnabled : null });
      if (!cr.success && cr.error) setError(`טעינת תביעות נכשלה: ${cr.error}`);
    } catch (e) {
      setError(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const loadCard = useCallback(async (claimId: string) => {
    const gen = ++cardGen.current;
    setCardLoading(true);
    setCard(null);
    const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
    const [h, cl, t, r, fu, gi, gs, d, sh, lk, ga, ct] = await Promise.all([
      safe(api.getHistory(claimId), { success: false, data: [] as ClaimRecord[] }),
      safe(api.getCommLog(claimId), { success: false, data: [] as ClaimRecord[] }),
      safe(api.getTasks(claimId), { success: false, data: [] as ClaimRecord[] }),
      safe(api.getReminders(claimId), { success: false, data: [] as ClaimRecord[] }),
      safe(api.listMailFollowups(claimId), { success: false, data: [] as MailFollowupRow[] }),
      safe(api.invokeGmail('list_imports', { claim_id: claimId }), {} as Record<string, unknown>),
      safe(api.invokeGmail('list_sends', { claim_id: claimId }), {} as Record<string, unknown>),
      safe(api.invokeDocs('list_docs', { claim_id: claimId }), {} as Record<string, unknown>),
      safe(api.invokeDocs('list_shares', { claim_id: claimId }), {} as Record<string, unknown>),
      safe(api.invokeDocs('get_link', { claim_id: claimId }), {} as Record<string, unknown>),
      safe(api.invokeDocs('get_garage_assignment', { claim_id: claimId }), {} as Record<string, unknown>),
      safe(api.listClaimContacts(claimId), { success: false, data: [] as ClaimContact[] }),
    ]);
    if (gen !== cardGen.current) return;
    const link = (lk as { link?: { expires_at?: string; revoked_at?: string | null; created_at?: string } }).link;
    const active = Boolean(link && !link.revoked_at && link.expires_at && new Date(link.expires_at).getTime() > Date.now());
    setCard({
      claimId,
      history: (h as { data?: ClaimRecord[] }).data || [],
      comm: (cl as { data?: ClaimRecord[] }).data || [],
      tasks: (t as { data?: ClaimRecord[] }).data || [],
      reminders: (r as { data?: ClaimRecord[] }).data || [],
      followups: (fu as { data?: MailFollowupRow[] }).data || [],
      imports: rows((gi as { data?: unknown }).data),
      sends: rows((gs as { data?: unknown }).data),
      files: rows<ClaimFileRow>((d as { files?: unknown }).files),
      requests: rows<DocRequestRow>((d as { requests?: unknown }).requests),
      shares: rows<ShareRow>((sh as { shares?: unknown }).shares),
      contacts: (ct as { data?: ClaimContact[] }).data || [],
      uploadLink: link ? { active, expires_at: link.expires_at, created_at: link.created_at } : null,
      garage: ((ga as { assignment?: Record<string, unknown> | null }).assignment) || null,
    });
    setCardLoading(false);
  }, [api]);

  const signedUrls = useCallback(async (claimId: string, fileIds: string[]) => {
    const out: Record<string, string> = {};
    for (let i = 0; i < fileIds.length; i += 80) {
      const r = await api.invokeDocs('signed_urls', { claim_id: claimId, file_ids: fileIds.slice(i, i + 80) }).catch(() => ({}));
      const urls = (r as { urls?: Record<string, string> }).urls;
      if (urls && typeof urls === 'object') Object.entries(urls).forEach(([id, url]) => { if (url) out[id] = url; });
    }
    return out;
  }, [api]);

  const signedUrl = useCallback(async (claimId: string, fileId: string, download?: { filename: string }) => {
    const body: Record<string, unknown> = { claim_id: claimId, file_id: fileId };
    if (download) { body.purpose = 'download'; body.filename = download.filename || 'document'; }
    const r = await api.invokeDocs('signed_url', body).catch(() => ({}));
    return String((r as { url?: string }).url || '');
  }, [api]);

  /** Existing customer upload link only (reveal_link reads; it never creates or rotates). */
  const revealLink = useCallback(async (claimId: string) => {
    const r = await api.invokeDocs('reveal_link', { claim_id: claimId }).catch(() => ({}));
    const x = r as { success?: boolean; token?: string; url?: string; error?: string };
    return { ok: Boolean(x.success && (x.token || x.url)), token: String(x.token || ''), url: String(x.url || ''), error: String(x.error || '') };
  }, [api]);

  const reports = useMemo(() => ({
    data: () => api.getReportData(),
    inactive: (days: number) => api.getInactiveClaims(days),
    templates: () => api.getTemplates(),
    fill: (key: string, claim: Record<string, string>) => api.fillTemplate(key, claim),
    internalSummary: (claimId: string) => api.exportClaimSummary(claimId),
    externalSummary: (claimId: string, extra?: { mailBody?: string; docNames?: string[] }) => api.exportExternalSummary(claimId, extra),
  }), [api]);

  const alertCtx = useMemo<AlertContext>(() => {
    const merged = new Map<string, ClaimRecord>();
    for (const t of tasks) merged.set(t.id, t);
    for (const t of card?.tasks || []) merged.set(t.id, t);
    return {
      tasks: [...merged.values()],
      notifs,
      gmailPending: pending,
      scheduledFollowups: followups as AlertContext['scheduledFollowups'],
      garageReviews,
    };
  }, [tasks, card, notifs, pending, followups, garageReviews]);

  return {
    claims, notifs, tasks, reminders, pending, followups, ownMailbox,
    loading, error, loadAll,
    card, cardLoading, loadCard,
    signedUrls, signedUrl, revealLink, reports, gmail,
    alertCtx,
  };
}
