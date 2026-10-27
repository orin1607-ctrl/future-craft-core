/**
 * "שתף לדליה" — Staging only. Files arrive from the Android share sheet (public/dalia-share-sw.js)
 * or from the pickers on this page, are matched to a claim, and are saved through the existing
 * claims-docs staff_upload (same permissions, same dedupe by SHA-256). No new backend.
 * One certain match → saved straight away. Anything else → the user picks the claim.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClaimsApi } from '@/features/claims/claimsService';
import type { ClaimRecord } from '@/features/claims/claimsConstants';
import { claimMatchesSearch } from '@/features/claims/claimSearch';
import { readPdfText } from '@/features/claims/claimDocumentRead';
import { deleteShareBatch, listShareBatches } from '@/features/claims/shareInbox/shareStore';
import { isShareTargetEnabled } from '@/features/claims/shareInbox/registerShareTarget';
import { checkSharedFile, claimLabel, matchSharedFile, shareNote } from '@/features/claims/shareInbox/shareMatch';

type ItemStatus = 'reading' | 'saving' | 'saved' | 'duplicate' | 'choose' | 'failed' | 'invalid';

type Item = {
  key: string;
  batchId: string;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  sharedText: string;
  status: ItemStatus;
  claimId?: string;
  reason?: string;
  candidates: string[];
  error?: string;
  picked: boolean;
  thumb?: string;
};

const DONE: ItemStatus[] = ['saved', 'duplicate', 'invalid'];

const STATUS_LABEL: Record<ItemStatus, string> = {
  reading: 'מזהה…',
  saving: 'שומר…',
  saved: 'נשמר',
  duplicate: 'כבר קיים בתיק',
  choose: 'צריך לבחור תיק',
  failed: 'השמירה נכשלה',
  invalid: 'לא נקלט',
};

let seq = 0;
function makeItem(file: { name: string; type: string; size: number; blob: Blob }, batchId: string, sharedText: string): Item {
  seq += 1;
  const isImage = /^image\/(jpeg|png|webp)$/i.test(file.type);
  return {
    key: `i${seq}`,
    batchId,
    name: file.name,
    type: file.type,
    size: file.size,
    blob: file.blob,
    sharedText,
    status: 'reading',
    candidates: [],
    picked: true,
    thumb: isImage ? URL.createObjectURL(file.blob) : undefined,
  };
}

export default function ClaimsShareInboxPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const enabled = isShareTargetEnabled({ killed: false });
  const api = useMemo(() => createClaimsApi({
    id: user?.id || '',
    full_name: user?.full_name || '',
    email: user?.email,
    role: user?.role,
    hasClaimsAccess: user?.hasClaimsAccess,
  }), [user?.id, user?.full_name, user?.email, user?.role, user?.hasClaimsAccess]);

  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [claimsError, setClaimsError] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState('');
  const claimsRef = useRef<ClaimRecord[]>([]);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  const patch = useCallback((key: string, p: Partial<Item>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...p } : it)));
  }, []);

  const save = useCallback(async (item: Item, claimId: string, auto: boolean, reason: string) => {
    patch(item.key, { status: 'saving', claimId, reason, error: undefined });
    const file = new File([item.blob], item.name, { type: item.type || item.blob.type });
    const r = await api.staffUpload(claimId, '', file);
    if (!r.success) {
      patch(item.key, { status: 'failed', error: r.error === 'forbidden' ? 'אין הרשאה לתיק הזה' : String(r.error || 'שגיאה') });
      return;
    }
    if (r.reused) {
      patch(item.key, { status: 'duplicate' });
      return;
    }
    await api.invokeDocs('update_doc_meta', { claim_id: claimId, file_id: r.file_id, staff_note: shareNote(auto, reason) });
    await api.logHistory(claimId, 'מסמך נקלט בשיתוף לדליה', `${item.name}${auto ? ` · ${reason}` : ''}`, 'docs');
    patch(item.key, { status: 'saved' });
  }, [api, patch]);

  const identify = useCallback(async (item: Item) => {
    const check = checkSharedFile(item);
    if (!check.ok) {
      patch(item.key, { status: 'invalid', error: check.error });
      return;
    }
    let text = '';
    if (check.isPdf) {
      try {
        text = await readPdfText(new Uint8Array(await item.blob.arrayBuffer()));
      } catch {
        text = '';
      }
    }
    const m = matchSharedFile({ name: item.name, text, sharedText: item.sharedText }, claimsRef.current);
    if (m.decision === 'auto' && m.claimId) {
      await save(item, m.claimId, true, m.reason);
      return;
    }
    patch(item.key, { status: 'choose', reason: m.reason, candidates: m.candidates });
  }, [patch, save]);

  const addItems = useCallback(async (next: Item[]) => {
    setItems((prev) => [...prev, ...next]);
    for (const it of next) await identify(it);
  }, [identify]);

  // Runs once: shared batches must not be read twice if the auth user object is refreshed.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!user || !enabled || startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const res = await api.getClaims();
      if (!res.success) setClaimsError(String(res.error || 'טעינת התיקים נכשלה'));
      claimsRef.current = res.data || [];
      setClaims(claimsRef.current);
      let batches: Awaited<ReturnType<typeof listShareBatches>> = [];
      try {
        batches = await listShareBatches();
      } catch {
        batches = [];
      }
      setLoading(false);
      const fresh = batches.flatMap((b) => b.files.map((f) => makeItem(f, b.id, `${b.title}\n${b.text}`)));
      await addItems(fresh);
    })();
  }, [user, enabled, api, addItems]);

  // A shared batch leaves the device once every file in it is saved, a duplicate, or rejected.
  useEffect(() => {
    const ids = [...new Set(items.map((i) => i.batchId).filter(Boolean))];
    for (const id of ids) {
      if (items.filter((i) => i.batchId === id).every((i) => DONE.includes(i.status))) {
        void deleteShareBatch(id).catch(() => undefined);
      }
    }
  }, [items]);

  useEffect(() => () => { itemsRef.current.forEach((i) => i.thumb && URL.revokeObjectURL(i.thumb)); }, []);

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...list].map((f) => makeItem({ name: f.name, type: f.type, size: f.size, blob: f }, '', ''));
    void addItems(next);
  };

  const waiting = items.filter((i) => i.status === 'choose' || i.status === 'failed');
  const pickedWaiting = waiting.filter((i) => i.picked);
  const candidateKey = [...new Set(waiting.flatMap((i) => i.candidates))].join('|');
  const byId = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims]);
  const results = useMemo(() => {
    if (!query.trim()) return candidateKey.split('|').map((id) => byId.get(id)).filter((c): c is ClaimRecord => !!c);
    return claims.filter((c) => claimMatchesSearch(c, query)).slice(0, 8);
  }, [query, claims, byId, candidateKey]);

  const saveChosen = async () => {
    if (!chosen) return;
    for (const it of pickedWaiting) await save(it, chosen, false, '');
    setChosen('');
    setQuery('');
  };

  const discardWaiting = () => {
    const keys = new Set(waiting.map((i) => i.key));
    setItems((prev) => prev.map((i) => (keys.has(i.key) ? { ...i, status: 'invalid', error: 'הוסר ללא שמירה' } : i)));
  };

  if (!enabled) {
    return <div dir="rtl" className="p-6 text-center text-muted-foreground">שיתוף לדליה זמין כרגע בסביבת הבדיקות בלבד.</div>;
  }

  return (
    <div dir="rtl" className="mx-auto max-w-xl space-y-4 p-4">
      <header className="space-y-1">
        <h1 className="text-xl font-bold">שתף לדליה</h1>
        <p className="text-sm text-muted-foreground">
          קבצים ששותפו מהטלפון נשמרים בתיק התביעה. אם הזיהוי לא ודאי — בוחרים תיק פעם אחת.
        </p>
      </header>

      {params.get('share_error') && (
        <div className="rounded-md border border-destructive p-3 text-sm text-destructive">השיתוף לא נקלט. נסה לשתף שוב.</div>
      )}
      {claimsError && <div className="rounded-md border border-destructive p-3 text-sm text-destructive">{claimsError}</div>}

      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
          בחר תמונות או PDF
          <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { onPick(e.target.files); e.target.value = ''; }} />
        </label>
        <label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent">
          צלם
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPick(e.target.files); e.target.value = ''; }} />
        </label>
      </div>

      {loading && <p className="text-sm text-muted-foreground">טוען…</p>}
      {!loading && items.length === 0 && (
        <p className="text-sm text-muted-foreground">אין קבצים ממתינים. שתף קובץ מ-WhatsApp, מהגלריה או מהמייל ובחר ״דליה״.</p>
      )}

      {items.length > 0 && (
        <ul className="divide-y rounded-md border" data-testid="share-items">
          {items.map((it) => {
            const claim = it.claimId ? byId.get(it.claimId) : undefined;
            const selectable = it.status === 'choose' || it.status === 'failed';
            return (
              <li key={it.key} className="flex items-center gap-3 p-3">
                {selectable && (
                  <input type="checkbox" checked={it.picked} onChange={(e) => patch(it.key, { picked: e.target.checked })} aria-label={`בחר ${it.name}`} />
                )}
                {it.thumb
                  ? <img src={it.thumb} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                  : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-xs">{/pdf/i.test(it.type) || /\.pdf$/i.test(it.name) ? 'PDF' : 'קובץ'}</div>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" dir="auto">{it.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {STATUS_LABEL[it.status]}
                    {(it.status === 'saved' || it.status === 'duplicate' || it.status === 'saving') && claim ? ` · ${claimLabel(claim)}` : ''}
                    {it.status === 'saved' && it.reason ? ` · ${it.reason}` : ''}
                    {it.status === 'choose' && it.reason ? ` · ${it.reason}` : ''}
                    {it.error ? ` · ${it.error}` : ''}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {waiting.length > 0 && (
        <section className="space-y-3 rounded-md border p-3" data-testid="share-choose">
          <h2 className="font-semibold">בחר תיק עבור {pickedWaiting.length} קבצים</h2>
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setChosen(''); }}
            placeholder="חיפוש לפי מספר רכב, מספר תביעה או שם לקוח"
            inputMode="search"
          />
          {results.length > 0 ? (
            <ul className="space-y-1">
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(c.id)}
                    className={`w-full rounded-md border px-3 py-2 text-right text-sm ${chosen === c.id ? 'border-primary bg-primary/10' : 'hover:bg-accent'}`}
                  >
                    <span className="font-medium">{c.claimNum || c.id}</span>
                    {c.plate ? <span> · {c.plate}</span> : null}
                    {c.clientName ? <span> · {c.clientName}</span> : null}
                    {c.insCompany ? <span className="text-muted-foreground"> · {c.insCompany}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{query.trim() ? 'לא נמצא תיק מתאים' : 'הקלד מספר רכב או מספר תביעה'}</p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void saveChosen()} disabled={!chosen || pickedWaiting.length === 0} className="flex-1">
              {chosen ? `שמור בתיק ${claimLabel(byId.get(chosen))}` : 'בחר תיק'}
            </Button>
            <Button variant="outline" onClick={discardWaiting}>הסר</Button>
          </div>
        </section>
      )}
    </div>
  );
}
