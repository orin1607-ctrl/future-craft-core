/**
 * ClaimQuoteEditor.tsx
 * הצעת מחיר בתוך תיק תביעה — עבודות לפי קטגוריות, חלקים וחומרים, מחשבון הצבע הקיים,
 * קליטת חשבוניות עם אישור ידני, סיכום כספי, גרסאות, PDF ושליחה. STAGING.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClaimRecord } from './claimsConstants';
import PaintCalculator from './PaintCalculator';
import { loadPaintCalcDraft, loadPaintCalcHistory, type PaintCalcData, type PaintCalcRow } from './claimPaintCalc';
import { extractClaimDocumentText } from './claimDocumentRead';
import { waMeHref, waPhoneError } from './claimWhatsApp';
import { downloadFileInBrowser, loadGarageShopBranding } from '@/modules/garage-management/garageQuoteDoc';
import {
  ALL_CATEGORIES,
  CORE_CATEGORIES,
  EXTRA_CATEGORIES,
  PART_TYPES,
  applyInvoiceMatches,
  applyPaintCalc,
  categoryLabel,
  claimSnapshotOf,
  compareToPart,
  computeTotals,
  formatIls,
  matchInvoiceLines,
  mergeLibrary,
  newPartLine,
  newQuoteData,
  newWorkLine,
  normalizeQuoteData,
  parseInvoiceText,
  partPricing,
  sha256Hex,
  swapSide,
  workPricing,
  type DiscountType,
  type InvoiceLine,
  type InvoiceMatch,
  type LibraryItem,
  type QuoteData,
  type QuoteInvoice,
  type QuotePartLine,
  type QuoteWorkLine,
} from './claimQuoteModel';
import {
  addQuoteLibraryItem,
  createClaimQuote,
  listClaimQuotes,
  listQuoteVersions,
  loadQuoteLibrary,
  patchClaimQuoteData,
  saveClaimQuoteVersion,
  type ClaimQuoteRow,
  type ClaimQuoteVersionRow,
} from './claimQuoteService';
import { buildClaimQuotePdf } from './claimQuotePdf';
import './claim-quote.css';

export type QuoteRecipient = { key: string; label: string; name: string; email: string; phone: string };

type UploadResult = { success: boolean; file_id?: string; reused?: boolean; error?: string };

export interface ClaimQuoteEditorProps {
  claim: ClaimRecord;
  actor: { id: string; full_name: string; company_name: string };
  recipients: QuoteRecipient[];
  initialQuoteId?: string | null;
  uploadFile: (file: File, extra: { doc_kind?: string; staff_type?: string; staff_title?: string }) => Promise<UploadResult>;
  getSignedUrl: (fileId: string) => Promise<string>;
  logHistory: (action: string, note: string) => Promise<unknown>;
  /** Opens the claim's Gmail composer with the PDF attached. Sending is recorded there, only when it really goes out. */
  onOpenEmail: (seed: { to: string; subject: string; body: string; file_ids: string[] }) => void;
  toast: (msg: string, type?: string) => void;
  onClose: (changed: boolean) => void;
}

type InvoiceReview = { invoice: QuoteInvoice; rows: Array<{ match: InvoiceMatch; line: InvoiceLine; approved: boolean }> };

const n = (v: string) => {
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : 0;
};

function DiscountInputs({ type, value, onChange }: { type: DiscountType; value: number; onChange: (type: DiscountType, value: number) => void }) {
  return (
    <span className="cq-disc">
      <select className="cq-in cq-in-sm" value={type} aria-label="סוג הנחה" onChange={(e) => onChange(e.target.value as DiscountType, e.target.value === 'none' ? 0 : value)}>
        <option value="none">ללא הנחה</option>
        <option value="percent">הנחה %</option>
        <option value="amount">הנחה ₪</option>
      </select>
      {type !== 'none' && (
        <input className="cq-in cq-in-num" type="number" min={0} step="any" inputMode="decimal" value={value || ''} aria-label="ערך הנחה"
          onChange={(e) => onChange(type, n(e.target.value))} />
      )}
    </span>
  );
}

export default function ClaimQuoteEditor(props: ClaimQuoteEditorProps) {
  const { claim, actor, recipients, uploadFile, getSignedUrl, logHistory, onOpenEmail, toast, onClose } = props;
  const [quotes, setQuotes] = useState<ClaimQuoteRow[]>([]);
  const [quote, setQuote] = useState<ClaimQuoteRow | null>(null);
  const [data, setData] = useState<QuoteData>(() => newQuoteData(claim));
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [changedSomething, setChangedSomething] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>(() => mergeLibrary([]));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addWork, setAddWork] = useState<{ category: string; label: string; saveToLib: boolean } | null>(null);
  const [paintOpen, setPaintOpen] = useState(false);
  const [paintPick, setPaintPick] = useState<PaintCalcRow[] | null>(null);
  const [paintConfirm, setPaintConfirm] = useState<{ calc: PaintCalcData; ref: { id: string; version: number } } | null>(null);
  const [review, setReview] = useState<InvoiceReview | null>(null);
  const [versions, setVersions] = useState<ClaimQuoteVersionRow[] | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [recipientKey, setRecipientKey] = useState(recipients[0]?.key || '');
  const [manualTo, setManualTo] = useState({ email: '', phone: '' });
  const pdfCache = useRef<{ version: number; file: File; fileId: string } | null>(null);
  /** Latest data for steps that run back to back in one click (PDF → send), before React re-renders. */
  const dataRef = useRef(data);
  dataRef.current = data;
  const commitData = (next: QuoteData) => {
    dataRef.current = next;
    setData(next);
  };
  const invoiceInput = useRef<HTMLInputElement | null>(null);

  const totals = useMemo(() => computeTotals(data), [data]);
  const workLabels = useMemo(() => library.filter((l) => l.kind === 'work'), [library]);
  const partLabels = useMemo(() => library.filter((l) => l.kind === 'part').map((l) => l.label), [library]);
  const recipient = recipients.find((r) => r.key === recipientKey) || null;
  const toEmail = (manualTo.email || recipient?.email || '').trim();
  const toPhone = (manualTo.phone || recipient?.phone || '').trim();

  // ─── Load ────────────────────────────────────────────────────────────────
  const openQuote = (row: ClaimQuoteRow | null) => {
    pdfCache.current = null;
    setQuote(row);
    setVersions(null);
    // Customer and vehicle details always come fresh from the claim.
    const fresh = claimSnapshotOf(claim);
    const base = row ? normalizeQuoteData(row.data, claim) : newQuoteData(claim);
    const claimSnap = { ...base.claim };
    (Object.keys(fresh) as Array<keyof typeof fresh>).forEach((k) => { if (fresh[k]) claimSnap[k] = fresh[k]; });
    setData({ ...base, claim: claimSnap });
    setDirty(!row);
  };

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [rows, lib] = await Promise.all([listClaimQuotes(claim.id), loadQuoteLibrary()]);
        if (!live) return;
        setQuotes(rows);
        setLibrary(mergeLibrary(lib));
        const pick = rows.find((r) => r.id === props.initialQuoteId) || rows[0] || null;
        openQuote(pick);
      } catch (e) {
        if (live) toast(`טעינת הצעות המחיר נכשלה: ${(e as Error).message}`, 'err');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claim.id]);

  const update = (fn: (d: QuoteData) => QuoteData) => {
    setData((d) => fn(d));
    setDirty(true);
  };
  const setWork = (id: string, patch: Partial<QuoteWorkLine>) => update((d) => ({ ...d, works: d.works.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  const setPart = (id: string, patch: Partial<QuotePartLine>) => update((d) => ({ ...d, parts: d.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));

  // ─── Save ────────────────────────────────────────────────────────────────
  const persistLibrary = async (d: QuoteData) => {
    const known = new Set(library.map((l) => `${l.kind}|${l.category}|${l.label.trim()}`));
    const fresh: LibraryItem[] = [];
    for (const w of d.works) {
      if (w.source === 'paint_calc' || !w.label.trim()) continue;
      const it: LibraryItem = { kind: 'work', category: w.category, label: w.label.trim(), default_hours: w.pricing === 'hours' ? w.hours || null : null, default_price: w.pricing === 'global' ? w.globalPrice || null : null };
      if (!known.has(`work|${it.category}|${it.label}`)) fresh.push(it);
    }
    for (const p of d.parts) {
      if (p.source === 'paint_materials' || !p.name.trim()) continue;
      if (!known.has(`part|parts|${p.name.trim()}`)) fresh.push({ kind: 'part', category: 'parts', label: p.name.trim() });
    }
    const seen = new Set<string>();
    for (const it of fresh) {
      const k = `${it.kind}|${it.category}|${it.label}`;
      if (seen.has(k)) continue;
      seen.add(k);
      await addQuoteLibraryItem(it, actor.company_name, actor).catch(() => null);
    }
    if (fresh.length) setLibrary((prev) => mergeLibrary([...prev, ...fresh]));
  };

  const save = async (): Promise<ClaimQuoteRow | null> => {
    setBusy('save');
    try {
      let row = quote;
      if (!row) row = await createClaimQuote(claim.id, actor.company_name, data, actor);
      const note = changeNote.trim() || `${data.works.length} עבודות · ${data.parts.filter((p) => p.name.trim()).length} חלקים`;
      const saved = await saveClaimQuoteVersion(row, data, note, actor);
      await logHistory('הצעת מחיר נשמרה', `הצעת מחיר ${saved.quote_no} · גרסה ${saved.version} · סה״כ כולל מע״מ ${formatIls(saved.total_amount)}${changeNote.trim() ? ` · ${changeNote.trim()}` : ''}`).catch(() => null);
      await persistLibrary(data);
      setQuote(saved);
      setQuotes((prev) => [saved, ...prev.filter((q) => q.id !== saved.id)].sort((a, b) => b.quote_no - a.quote_no));
      setDirty(false);
      setChangeNote('');
      setChangedSomething(true);
      if (versions) setVersions(await listQuoteVersions(saved.id));
      toast(`הצעת המחיר נשמרה (גרסה ${saved.version})`);
      return saved;
    } catch (e) {
      toast(`השמירה נכשלה: ${(e as Error).message}`, 'err');
      return null;
    } finally {
      setBusy('');
    }
  };

  const newQuote = () => {
    if (dirty && !window.confirm('יש שינויים שלא נשמרו. לפתוח הצעה חדשה בלי לשמור?')) return;
    openQuote(null);
  };

  // ─── Work picker ─────────────────────────────────────────────────────────
  const visibleCats = useMemo(() => {
    const used = new Set([...data.categories, ...data.works.map((w) => w.category)]);
    return ALL_CATEGORIES.filter((c) => c.core || used.has(c.key));
  }, [data.categories, data.works]);

  const confirmAddWork = async () => {
    if (!addWork) return;
    const label = addWork.label.trim();
    if (!label) { toast('יש לבחור או להקליד עבודה', 'err'); return; }
    const lib = workLabels.find((l) => l.category === addWork.category && l.label === label);
    const line = newWorkLine(addWork.category, label, data.hourRate, lib?.default_price ? { pricing: 'global', globalPrice: Number(lib.default_price) } : { hours: Number(lib?.default_hours || 0) });
    update((d) => ({ ...d, categories: [...new Set([...d.categories, addWork.category])], works: [...d.works, line] }));
    setCollapsed((c) => ({ ...c, [addWork.category]: false }));
    if (addWork.saveToLib && !lib) {
      const it: LibraryItem = { kind: 'work', category: addWork.category, label };
      setLibrary((prev) => mergeLibrary([...prev, it]));
      await addQuoteLibraryItem(it, actor.company_name, actor).catch(() => null);
    }
    setAddWork(null);
  };

  // ─── Paint ───────────────────────────────────────────────────────────────
  const openSavedPaint = async () => {
    setBusy('paint');
    try {
      const [hist, draft] = await Promise.all([loadPaintCalcHistory(claim.id), loadPaintCalcDraft(claim.id)]);
      const list = [...hist, ...(draft ? [draft] : [])];
      if (!list.length) { toast('אין חישוב צבע שמור בתיק הזה', 'err'); return; }
      setPaintPick(list);
    } finally {
      setBusy('');
    }
  };

  const applyPaint = () => {
    if (!paintConfirm) return;
    update((d) => applyPaintCalc(d, paintConfirm.calc, paintConfirm.ref));
    setPaintConfirm(null);
    setPaintPick(null);
    toast('חישוב הצבע עודכן בהצעה: עבודת צבע + חומרי צבע');
  };

  // ─── Invoices ────────────────────────────────────────────────────────────
  const startReview = (invoice: QuoteInvoice, parts: QuotePartLine[]) => {
    const matches = matchInvoiceLines(parts, invoice.lines);
    // New lines are pre-checked only when they carry a catalogue number; anything else waits for an explicit tick.
    setReview({ invoice, rows: matches.map((m) => ({ match: m, line: { ...m.line }, approved: m.kind === 'new' && !!m.line.sku })) });
  };

  const onInvoiceFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('invoice');
    try {
      for (const file of Array.from(files)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const sha = await sha256Hex(bytes);
        const already = data.invoices.find((i) => i.sha === sha);
        if (already) {
          toast(`החשבונית "${file.name}" כבר נקלטה בהצעה — לא נוצרה כפילות`, 'err');
          continue;
        }
        const up = await uploadFile(file, { doc_kind: 'garage_invoice', staff_type: 'garage_invoice', staff_title: `חשבונית חלקים – ${file.name}`.slice(0, 120) });
        if (!up.success || !up.file_id) { toast(`העלאת החשבונית נכשלה: ${up.error || ''}`, 'err'); continue; }
        toast(up.reused ? 'הקובץ כבר קיים בתיק — קושר להצעה בלי לשכפל' : 'החשבונית נשמרה בתיק. קורא את השורות…');
        const read = await extractClaimDocumentText({ bytes, mimeType: file.type, fileName: file.name });
        const invoice: QuoteInvoice = {
          docId: up.file_id,
          sha,
          fileName: file.name,
          uploadedAt: new Date().toISOString(),
          readSource: read.source,
          lines: parseInvoiceText(read.text),
        };
        update((d) => ({ ...d, invoices: [...d.invoices.filter((i) => i.sha !== sha), invoice] }));
        await logHistory('חשבונית חלקים נקלטה להצעת מחיר', `${file.name} · ${invoice.lines.length} שורות זוהו`).catch(() => null);
        startReview(invoice, data.parts);
        // One review at a time; further files wait for the next upload.
        break;
      }
    } finally {
      setBusy('');
      if (invoiceInput.current) invoiceInput.current.value = '';
    }
  };

  const approveReview = () => {
    if (!review) return;
    // Differences are recomputed from the (possibly edited) line, against the part as it is now.
    const approved: InvoiceMatch[] = review.rows.filter((r) => r.approved).flatMap((r): InvoiceMatch[] => {
      if (r.match.kind === 'new') return [{ kind: 'new', line: r.line }];
      const partId = r.match.partId;
      const part = data.parts.find((p) => p.id === partId);
      return part ? [compareToPart(part, r.line)] : [{ kind: 'new', line: r.line }];
    });
    update((d) => {
      const next = applyInvoiceMatches(d, review.invoice, approved);
      return { ...next, invoices: next.invoices.map((i) => (i.sha === review.invoice.sha ? { ...i, lines: review.rows.map((r) => r.line), reviewedAt: new Date().toISOString() } : i)) };
    });
    toast(`עודכנו ${approved.length} שורות מהחשבונית`);
    setReview(null);
  };

  // ─── PDF & sending ───────────────────────────────────────────────────────
  const ensurePdf = async (): Promise<{ row: ClaimQuoteRow; fileId: string; file: File | null } | null> => {
    let row = quote;
    if (!row || dirty || !row.version) {
      row = await save();
      if (!row) return null;
    }
    if (pdfCache.current && pdfCache.current.version === row.version) return { row, fileId: pdfCache.current.fileId, file: pdfCache.current.file };
    const existing = normalizeQuoteData(row.data, claim).documents.find((doc) => doc.version === row!.version);
    if (existing) return { row, fileId: existing.fileId, file: null };
    setBusy('pdf');
    try {
      const branding = await loadGarageShopBranding(actor.company_name).catch(() => null);
      const cur = dataRef.current;
      const file = await buildClaimQuotePdf(cur, { quoteNo: row.quote_no, version: row.version, date: new Date(), branding });
      const up = await uploadFile(file, { doc_kind: 'general', staff_type: 'other', staff_title: `הצעת מחיר ${row.quote_no} – גרסה ${row.version}` });
      if (!up.success || !up.file_id) { toast(`שמירת ה-PDF בתיק נכשלה: ${up.error || ''}`, 'err'); return null; }
      const nextData: QuoteData = { ...cur, documents: [...cur.documents, { fileId: up.file_id, fileName: file.name, version: row.version, createdAt: new Date().toISOString() }] };
      const patched = await patchClaimQuoteData(row, nextData, actor);
      setQuote(patched);
      commitData(nextData);
      await logHistory('הופקה הצעת מחיר PDF', `${file.name} נשמר בגלריית התיק`).catch(() => null);
      pdfCache.current = { version: row.version, file, fileId: up.file_id };
      setChangedSomething(true);
      return { row: patched, fileId: up.file_id, file };
    } catch (e) {
      toast(`הפקת ה-PDF נכשלה: ${(e as Error).message}`, 'err');
      return null;
    } finally {
      setBusy('');
    }
  };

  const recordSend = async (row: ClaimQuoteRow, entry: QuoteData['sendLog'][number]) => {
    const cur = dataRef.current;
    const nextData = { ...cur, sendLog: [...cur.sendLog, entry] };
    commitData(nextData);
    const patched = await patchClaimQuoteData(row, nextData, actor).catch(() => null);
    if (patched) setQuote(patched);
  };

  const doDownload = async () => {
    const r = await ensurePdf();
    if (!r) return;
    if (r.file) downloadFileInBrowser(r.file);
    else {
      // This version's PDF is already in the claim: download that copy instead of creating a duplicate.
      const url = await getSignedUrl(r.fileId);
      if (url) {
        const blob = await fetch(url).then((res) => res.blob()).catch(() => null);
        if (blob) downloadFileInBrowser(new File([blob], normalizeQuoteData(r.row.data, claim).documents.find((d) => d.fileId === r.fileId)?.fileName || 'quote.pdf', { type: 'application/pdf' }));
      }
    }
    toast('ה-PDF הופק ונשמר בתיק');
  };

  /** Opened synchronously on click so the browser does not block it as a popup after the PDF work. */
  const openPendingTab = () => {
    const win = window.open('about:blank', '_blank');
    if (win) win.opener = null;
    return win;
  };
  const pointTab = (win: Window | null, url: string) => {
    if (win) win.location.href = url;
    else window.open(url, '_blank', 'noopener');
  };

  const doPrint = async () => {
    const win = openPendingTab();
    const r = await ensurePdf();
    if (!r) { win?.close(); return; }
    const url = r.file ? URL.createObjectURL(r.file) : await getSignedUrl(r.fileId);
    if (url) pointTab(win, url);
    else win?.close();
  };

  const doEmail = async () => {
    if (!toEmail) { toast('אין כתובת מייל לנמען שנבחר — הקלד כתובת', 'err'); return; }
    const r = await ensurePdf();
    if (!r) return;
    await recordSend(r.row, { channel: 'email', to: toEmail, at: new Date().toISOString(), status: 'opened_not_confirmed', note: 'נפתח חלון שליחת מייל מהתיק' });
    onOpenEmail({
      to: toEmail,
      subject: `הצעת מחיר ${r.row.quote_no} – רכב ${data.claim.plate || ''}${data.claim.claimNum ? ` – תביעה ${data.claim.claimNum}` : ''}`,
      body: `שלום${recipient?.name ? ` ${recipient.name}` : ''},\n\nמצורפת הצעת מחיר מס׳ ${r.row.quote_no} עבור רכב ${data.claim.plate || ''} (${[data.claim.carMake, data.claim.carModel].filter(Boolean).join(' ')}).\nסה״כ כולל מע״מ: ${formatIls(totals.total)}.\n\nבברכה,\n${actor.full_name}`,
      file_ids: [r.fileId],
    });
  };

  const doWhatsApp = async () => {
    const phoneErr = toPhone ? waPhoneError(toPhone) : 'אין מספר טלפון';
    const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean };
    // Phones share the PDF file itself; desktops open WhatsApp with a link (desktop share sheets are not WhatsApp).
    const mobileShare = typeof nav.share === 'function' && !!window.matchMedia?.('(pointer: coarse)').matches;
    if (!mobileShare && phoneErr) { toast(`לא ניתן לפתוח WhatsApp: ${phoneErr}`, 'err'); return; }
    const win = mobileShare ? null : openPendingTab();
    const r = await ensurePdf();
    if (!r) { win?.close(); return; }
    const msg = `שלום${recipient?.name ? ` ${recipient.name}` : ''}, מצורפת הצעת מחיר מס׳ ${r.row.quote_no} לרכב ${data.claim.plate || ''}. סה״כ כולל מע״מ: ${formatIls(totals.total)}.`;
    if (mobileShare && r.file && nav.canShare?.({ files: [r.file] })) {
      try {
        await nav.share({ files: [r.file], text: msg, title: r.file.name });
        await recordSend(r.row, { channel: 'whatsapp', to: toPhone || 'שיתוף מהמכשיר', at: new Date().toISOString(), status: 'opened_not_confirmed', note: 'נפתח תפריט שיתוף במכשיר' });
        await logHistory('הצעת מחיר שותפה מהמכשיר', `הצעה ${r.row.quote_no} · נפתח תפריט שיתוף — השליחה עצמה לא אומתה`).catch(() => null);
        return;
      } catch {
        /* cancelled → fall back to wa.me */
      }
    }
    if (phoneErr) { win?.close(); toast(`לא ניתן לפתוח WhatsApp: ${phoneErr}`, 'err'); return; }
    const url = await getSignedUrl(r.fileId);
    pointTab(win, waMeHref(toPhone, `${msg}${url ? `\nלצפייה בהצעה (הקישור בתוקף 24 שעות):\n${url}` : ''}`));
    await Promise.all([
      recordSend(r.row, { channel: 'whatsapp', to: toPhone, at: new Date().toISOString(), status: 'opened_not_confirmed', note: 'נפתח WhatsApp עם הודעה מוכנה — יש ללחוץ שליחה ב-WhatsApp' }),
      logHistory('הצעת מחיר נפתחה לשליחה ב-WhatsApp', `הצעה ${r.row.quote_no} אל ${toPhone} · נפתח WhatsApp — השליחה עצמה לא אומתה`).catch(() => null),
    ]);
    toast('WhatsApp נפתח — ההודעה תישלח רק אחרי שתלחץ שליחה שם');
  };

  const showVersions = async () => {
    if (versions) { setVersions(null); return; }
    if (!quote) { toast('ההצעה עוד לא נשמרה', 'err'); return; }
    setVersions(await listQuoteVersions(quote.id).catch(() => []));
  };

  const close = () => {
    if (dirty && !window.confirm('יש שינויים שלא נשמרו. לסגור בלי לשמור?')) return;
    onClose(changedSomething);
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const c = data.claim;
  const busyLabel = busy === 'save' ? 'שומר…' : busy === 'pdf' ? 'מפיק PDF…' : busy === 'invoice' ? 'קורא חשבונית…' : busy === 'paint' ? 'טוען…' : '';

  const workRow = (w: QuoteWorkLine) => {
    const pr = workPricing(w);
    const opts = workLabels.filter((l) => l.category === w.category);
    return (
      <div className="cq-row" key={w.id} data-testid="cq-work-row">
        <div className="cq-row-main">
          <input className="cq-in cq-in-label" list={`cq-wl-${w.category}`} value={w.label} placeholder="תיאור העבודה" aria-label="תיאור העבודה"
            onChange={(e) => setWork(w.id, { label: e.target.value })} />
          <datalist id={`cq-wl-${w.category}`}>{opts.map((o) => <option key={o.label} value={o.label} />)}</datalist>
          {/ימין|שמאל/.test(w.label) && (
            <button type="button" className="cq-icon" title="החלף צד ימין/שמאל" onClick={() => setWork(w.id, { label: swapSide(w.label) })}>⇄</button>
          )}
          {/ימין|שמאל/.test(w.label) && (
            <button type="button" className="cq-icon" title="הוסף את אותה עבודה בצד השני"
              onClick={() => update((d) => ({ ...d, works: [...d.works, { ...w, id: newWorkLine(w.category).id, label: swapSide(w.label), source: 'manual' }] }))}>⧉</button>
          )}
        </div>
        <div className="cq-row-fields">
          <span className="cq-seg" role="group" aria-label="שיטת תמחור">
            <button type="button" className={w.pricing === 'hours' ? 'on' : ''} onClick={() => setWork(w.id, { pricing: 'hours' })}>שעות</button>
            <button type="button" className={w.pricing === 'global' ? 'on' : ''} onClick={() => setWork(w.id, { pricing: 'global' })}>גלובלי</button>
          </span>
          {w.pricing === 'hours' ? (
            <span className="cq-hours">
              <input className="cq-in cq-in-num" type="number" min={0} step="0.25" inputMode="decimal" value={w.hours || ''} placeholder="שעות" aria-label="שעות"
                onChange={(e) => setWork(w.id, { hours: n(e.target.value) })} />
              <span className="cq-x">×</span>
              <input className="cq-in cq-in-num" type="number" min={0} step="any" inputMode="decimal" value={w.hourRate || ''} aria-label="מחיר שעה"
                onChange={(e) => setWork(w.id, { hourRate: n(e.target.value) })} />
              <span className="cq-unit">₪/ש׳</span>
            </span>
          ) : (
            <span className="cq-hours">
              <input className="cq-in cq-in-money" type="number" min={0} step="any" inputMode="decimal" value={w.globalPrice || ''} placeholder="מחיר" aria-label="מחיר גלובלי"
                onChange={(e) => setWork(w.id, { globalPrice: n(e.target.value) })} />
              <span className="cq-unit">₪</span>
            </span>
          )}
          <DiscountInputs type={w.discountType} value={w.discountValue} onChange={(t, v) => setWork(w.id, { discountType: t, discountValue: v })} />
          <span className="cq-price">
            {pr.discount > 0 && <s>{formatIls(pr.original)}</s>}
            <b>{formatIls(pr.final)}</b>
          </span>
          <button type="button" className="cq-icon cq-del" title="מחק שורה" onClick={() => update((d) => ({ ...d, works: d.works.filter((x) => x.id !== w.id) }))}>🗑</button>
        </div>
        {w.source === 'paint_calc' && <div className="cq-tag">מחושב ממחשבון הצבע · חומרי הצבע מופיעים בנפרד בחלקים וחומרים</div>}
      </div>
    );
  };

  const partRow = (p: QuotePartLine) => {
    const pr = partPricing(p);
    return (
      <div className={`cq-row cq-part${p.included ? '' : ' cq-excluded'}`} key={p.id} data-testid="cq-part-row">
        <div className="cq-row-main">
          <input className="cq-in cq-in-label" list="cq-part-names" value={p.name} placeholder="שם החלק" aria-label="שם החלק"
            onChange={(e) => setPart(p.id, { name: e.target.value })} />
          <select className="cq-in cq-in-sm" value={p.partType} aria-label="סוג החלק" onChange={(e) => setPart(p.id, { partType: e.target.value })}>
            {PART_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <input className="cq-in cq-in-sku" value={p.sku} placeholder="מק״ט" aria-label="מק״ט" onChange={(e) => setPart(p.id, { sku: e.target.value })} />
        </div>
        <div className="cq-row-fields">
          <label className="cq-f"><span>כמות</span>
            <input className="cq-in cq-in-num" type="number" min={0} step="any" inputMode="decimal" value={p.qty || ''} onChange={(e) => setPart(p.id, { qty: n(e.target.value) })} />
          </label>
          <label className="cq-f"><span>ברוטו ליח׳</span>
            <input className="cq-in cq-in-money" type="number" min={0} step="any" inputMode="decimal" value={p.unitGross || ''} onChange={(e) => setPart(p.id, { unitGross: n(e.target.value) })} />
          </label>
          <label className="cq-f cq-internal-f" title="פנימי — לא מוצג ללקוח"><span>נטו לספק 🔒</span>
            <input className="cq-in cq-in-money" type="number" min={0} step="any" inputMode="decimal" value={p.unitNet || ''} onChange={(e) => setPart(p.id, { unitNet: n(e.target.value) })} />
          </label>
          <label className="cq-f cq-internal-f" title="פנימי — לא מוצג ללקוח"><span>הנחת ספק % 🔒</span>
            <input className="cq-in cq-in-num" type="number" min={0} max={100} step="any" inputMode="decimal" value={p.supplierDiscountPct || ''} onChange={(e) => setPart(p.id, { supplierDiscountPct: n(e.target.value) })} />
          </label>
          <DiscountInputs type={p.discountType} value={p.discountValue} onChange={(t, v) => setPart(p.id, { discountType: t, discountValue: v })} />
          <span className="cq-price">
            {pr.discount > 0 && <s>{formatIls(pr.original)}</s>}
            <b>{formatIls(pr.final)}</b>
          </span>
          <label className="cq-incl" title="כלול בחישוב">
            <input type="checkbox" checked={p.included} onChange={(e) => setPart(p.id, { included: e.target.checked })} />
            <span>{p.included ? 'כלול בחישוב' : 'לא כלול'}</span>
          </label>
          <button type="button" className="cq-icon cq-del" title="מחק שורה" onClick={() => update((d) => ({ ...d, parts: d.parts.filter((x) => x.id !== p.id) }))}>🗑</button>
        </div>
        {p.invoiceDocId && <div className="cq-tag">🧾 מקושר לחשבונית: {p.invoiceName || p.invoiceDocId}</div>}
        {p.source === 'paint_materials' && <div className="cq-tag">ממחשבון הצבע — לא כלול בעלות עבודת הצבע</div>}
      </div>
    );
  };

  return (
    <div className="cq-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="cq-root" dir="rtl" data-testid="claim-quote-editor">
        <header className="cq-head">
          <div>
            <div className="cq-title">💰 הצעת מחיר{quote ? ` מס׳ ${quote.quote_no}` : ' חדשה'}</div>
            <div className="cq-sub">
              {quote?.version ? `גרסה ${quote.version} · עודכן ${new Date(quote.updated_at).toLocaleString('he-IL')}${quote.updated_by_name ? ` · ${quote.updated_by_name}` : ''}` : 'טרם נשמרה'}
              {dirty && <span className="cq-dirty"> · שינויים שלא נשמרו</span>}
            </div>
          </div>
          <div className="cq-head-acts">
            {quotes.length > 0 && (
              <select className="cq-in cq-in-sm" value={quote?.id || ''} aria-label="בחירת הצעה" onChange={(e) => {
                const row = quotes.find((q) => q.id === e.target.value);
                if (!row) return;
                if (dirty && !window.confirm('יש שינויים שלא נשמרו. לעבור הצעה בלי לשמור?')) return;
                openQuote(row);
              }}>
                {!quote && <option value="">הצעה חדשה</option>}
                {quotes.map((q) => <option key={q.id} value={q.id}>הצעה {q.quote_no} · {formatIls(q.total_amount)}</option>)}
              </select>
            )}
            <button type="button" className="cq-btn cq-btn-g" onClick={newQuote}>+ הצעה חדשה</button>
            <button type="button" className="cq-close" onClick={close} aria-label="סגור">✕</button>
          </div>
        </header>

        {loading ? <div className="cq-empty">טוען הצעות מחיר…</div> : (
          <div className="cq-layout">
            <div className="cq-main">
              {/* Claim details */}
              <section className="cq-card cq-claim" data-testid="cq-claim-info">
                {([
                  ['שם הלקוח', c.clientName], ['מספר רישוי', c.plate], ['יצרן', c.carMake],
                  ['דגם', c.carModel], ['מספר תביעה', c.claimNum], ['חברת ביטוח', c.insCompany],
                ] as Array<[string, string]>).map(([k, v]) => (
                  <div key={k} className="cq-kv"><span>{k}</span><b>{v || '—'}</b></div>
                ))}
              </section>

              {/* Works */}
              <section className="cq-card">
                <div className="cq-sec-head">
                  <h3>עבודות</h3>
                  <span className="cq-rate">מחיר שעה בהצעה:
                    <input className="cq-in cq-in-num" type="number" min={0} step="any" value={data.hourRate || ''} aria-label="מחיר שעת עבודה"
                      onChange={(e) => update((d) => ({ ...d, hourRate: n(e.target.value) }))} /> ₪ לפני מע״מ
                  </span>
                  <button type="button" className="cq-btn cq-btn-p" data-testid="cq-add-work" onClick={() => setAddWork({ category: 'body', label: '', saveToLib: true })}>➕ הוסף עבודה</button>
                </div>
                {visibleCats.map((cat) => {
                  const lines = data.works.filter((w) => w.category === cat.key);
                  const sum = lines.reduce((s, w) => s + workPricing(w).final, 0);
                  const isOpen = !collapsed[cat.key];
                  return (
                    <div className="cq-cat" key={cat.key} data-testid={`cq-cat-${cat.key}`}>
                      <button type="button" className="cq-cat-head" aria-expanded={isOpen} onClick={() => setCollapsed((s) => ({ ...s, [cat.key]: isOpen }))}>
                        <span>{isOpen ? '▾' : '◂'} {cat.label} <small>({lines.length})</small></span>
                        <b>{formatIls(sum)}</b>
                      </button>
                      {isOpen && (
                        <div className="cq-cat-body">
                          {cat.key === 'paint' && (
                            <div className="cq-paint-bar">
                              <button type="button" className="cq-btn cq-btn-paint" data-testid="cq-open-paint" onClick={() => setPaintOpen(true)}>🎨 פתח מחשבון צבע</button>
                              <button type="button" className="cq-btn cq-btn-g" onClick={() => void openSavedPaint()}>טען חישוב צבע שמור</button>
                              {data.paintCalcRef && <span className="cq-note">חישוב צבע {data.paintCalcRef.version ? `גרסה ${data.paintCalcRef.version}` : ''} הוחל: עבודה {formatIls(data.paintCalcRef.laborCost)} · חומרים {formatIls(data.paintCalcRef.materialsCost)}</span>}
                            </div>
                          )}
                          {lines.map(workRow)}
                          <button type="button" className="cq-btn cq-btn-g cq-btn-sm" onClick={() => update((d) => ({ ...d, works: [...d.works, newWorkLine(cat.key, '', d.hourRate)] }))}>+ שורה ב{cat.label}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>

              {/* Parts */}
              <section className="cq-card">
                <div className="cq-sec-head">
                  <h3>חלקים וחומרים</h3>
                  <button type="button" className="cq-btn cq-btn-p" data-testid="cq-add-part" onClick={() => update((d) => ({ ...d, parts: [...d.parts, newPartLine()] }))}>➕ הוסף חלק</button>
                </div>
                <datalist id="cq-part-names">{partLabels.map((l) => <option key={l} value={l} />)}</datalist>
                {data.parts.map(partRow)}
                {!data.parts.length && <div className="cq-empty">אין חלקים. לחץ "הוסף חלק".</div>}
              </section>

              {/* Invoices */}
              <section className="cq-card">
                <div className="cq-sec-head">
                  <h3>חשבוניות חלקים</h3>
                  <button type="button" className="cq-btn cq-btn-g" data-testid="cq-upload-invoice" disabled={!!busy} onClick={() => invoiceInput.current?.click()}>🧾 העלה חשבונית</button>
                  <input ref={invoiceInput} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => void onInvoiceFiles(e.target.files)} />
                </div>
                <div className="cq-note">החשבונית נשמרת בגלריית התיק. השורות שזוהו מוצגות לאישורך — שום מחיר או חלק לא משתנה בלי אישור. העלאה חוזרת של אותו קובץ לא יוצרת כפילות.</div>
                {data.invoices.map((inv) => (
                  <div className="cq-inv" key={inv.sha}>
                    <span>🧾 {inv.fileName}</span>
                    <small>{new Date(inv.uploadedAt).toLocaleDateString('he-IL')} · {inv.lines.length} שורות · {inv.reviewedAt ? 'נבדקה' : 'ממתינה לבדיקה'}{inv.readSource === 'none' ? ' · לא נקרא טקסט' : ''}</small>
                    <button type="button" className="cq-btn cq-btn-g cq-btn-sm" onClick={() => startReview(inv, data.parts)}>בדיקה והתאמה</button>
                  </div>
                ))}
              </section>

              {/* Notes */}
              <section className="cq-card cq-notes">
                <label><span>הערות להצעה (יופיעו ללקוח)</span>
                  <textarea className="cq-in" rows={3} value={data.notes} onChange={(e) => update((d) => ({ ...d, notes: e.target.value }))} />
                </label>
                <label><span>הערות פנימיות 🔒 (לא יופיעו ללקוח)</span>
                  <textarea className="cq-in" rows={2} value={data.internalNotes} onChange={(e) => update((d) => ({ ...d, internalNotes: e.target.value }))} />
                </label>
              </section>
            </div>

            {/* Summary */}
            <aside className="cq-side">
              <section className="cq-card cq-sum" data-testid="cq-summary">
                <h3>סיכום כספי</h3>
                {([
                  ['סה״כ עבודות פחחות', totals.body],
                  ['סה״כ עבודות צבע', totals.paint],
                  ['סה״כ עבודות מכונאות', totals.mech],
                  ['סה״כ עבודות נוספות', totals.extras],
                  ['סה״כ חלקים וחומרים', totals.parts],
                ] as Array<[string, number]>).map(([k, v]) => <div className="cq-sum-row" key={k}><span>{k}</span><b>{formatIls(v)}</b></div>)}
                <div className="cq-sum-row cq-sum-sep"><span>סה״כ לפני הנחות</span><b>{formatIls(totals.beforeDiscounts)}</b></div>
                <div className="cq-sum-row cq-sum-disc"><span>סה״כ הנחות ללקוח</span><b>{totals.discounts ? `-${formatIls(totals.discounts)}` : formatIls(0)}</b></div>
                <div className="cq-sum-row"><span>סה״כ לאחר הנחות ולפני מע״מ</span><b>{formatIls(totals.afterDiscounts)}</b></div>
                <div className="cq-sum-row"><span>מע״מ
                  <input className="cq-in cq-in-pct" type="number" min={0} step="any" value={data.vatPercent} aria-label="אחוז מע״מ" onChange={(e) => update((d) => ({ ...d, vatPercent: n(e.target.value) }))} />%</span>
                  <b>{formatIls(totals.vat)}</b></div>
                <div className="cq-sum-total" data-testid="cq-total"><span>סה״כ כולל מע״מ</span><b>{formatIls(totals.total)}</b></div>
              </section>

              <section className="cq-card cq-internal" data-testid="cq-internal">
                <h3>🔒 נתונים פנימיים — לא נשלחים ללקוח</h3>
                <div className="cq-sum-row"><span>עלות חלקים נטו לספק</span><b>{formatIls(totals.internal.supplierNetCost)}</b></div>
                <div className="cq-sum-row"><span>חלקים ללקוח אחרי הנחה</span><b>{formatIls(totals.internal.partsCustomerPrice)}</b></div>
                <div className="cq-sum-row"><span>רווח גולמי על חלקים</span><b className={totals.internal.partsMargin < 0 ? 'cq-neg' : ''}>{formatIls(totals.internal.partsMargin)}</b></div>
                {totals.internal.excludedPartsCount > 0 && <div className="cq-note">{totals.internal.excludedPartsCount} חלקים מסומנים "לא כלול בחישוב"</div>}
              </section>

              <section className="cq-card cq-actions">
                <input className="cq-in" value={changeNote} placeholder="תיאור השינוי בגרסה (לא חובה)" onChange={(e) => setChangeNote(e.target.value)} />
                <button type="button" className="cq-btn cq-btn-p cq-btn-lg" data-testid="cq-save" disabled={!!busy} onClick={() => void save()}>
                  {busy === 'save' ? 'שומר…' : '💾 שמור הצעת מחיר'}
                </button>
                <div className="cq-act-grid">
                  <button type="button" className="cq-btn cq-btn-g" data-testid="cq-pdf" disabled={!!busy} onClick={() => void doDownload()}>📄 הפק והורד PDF</button>
                  <button type="button" className="cq-btn cq-btn-g" disabled={!!busy} onClick={() => void doPrint()}>🖨️ הדפסה</button>
                </div>
                <div className="cq-send">
                  <label><span>שלח אל</span>
                    <select className="cq-in" value={recipientKey} onChange={(e) => { setRecipientKey(e.target.value); setManualTo({ email: '', phone: '' }); }}>
                      {recipients.map((r) => <option key={r.key} value={r.key}>{r.label}{r.name ? ` · ${r.name}` : ''}</option>)}
                      <option value="">נמען אחר…</option>
                    </select>
                  </label>
                  <input className="cq-in" type="email" dir="ltr" placeholder="מייל" value={manualTo.email || recipient?.email || ''} onChange={(e) => setManualTo((m) => ({ ...m, email: e.target.value }))} />
                  <input className="cq-in" type="tel" dir="ltr" placeholder="טלפון" value={manualTo.phone || recipient?.phone || ''} onChange={(e) => setManualTo((m) => ({ ...m, phone: e.target.value }))} />
                  <div className="cq-act-grid">
                    <button type="button" className="cq-btn cq-btn-wa" data-testid="cq-wa" disabled={!!busy} onClick={() => void doWhatsApp()}>WhatsApp</button>
                    <button type="button" className="cq-btn cq-btn-g" data-testid="cq-email" disabled={!!busy} onClick={() => void doEmail()}>✉️ מייל</button>
                  </div>
                  <div className="cq-note">WhatsApp נפתח עם הודעה מוכנה — ההודעה נשלחת רק כשתלחץ שליחה שם. מייל נשלח מחלון הדואר של התיק.</div>
                </div>
                <button type="button" className="cq-btn cq-btn-g" onClick={() => void showVersions()}>{versions ? 'סגור היסטוריית גרסאות' : '📋 היסטוריית גרסאות'}</button>
                {busyLabel && <div className="cq-busy">{busyLabel}</div>}
              </section>

              {versions && (
                <section className="cq-card cq-versions" data-testid="cq-versions">
                  <h3>גרסאות קודמות</h3>
                  {!versions.length && <div className="cq-empty">אין גרסאות שמורות</div>}
                  {versions.map((v) => (
                    <div className="cq-ver" key={v.id}>
                      <div><b>גרסה {v.version}</b> · {formatIls(v.total_amount)}</div>
                      <small>{new Date(v.created_at).toLocaleString('he-IL')} · {v.created_by_name || ''}{v.change_note ? ` · ${v.change_note}` : ''}</small>
                      <button type="button" className="cq-btn cq-btn-g cq-btn-sm" onClick={() => {
                        if (dirty && !window.confirm('לטעון את הגרסה לעריכה? שינויים שלא נשמרו יאבדו. הגרסה הישנה נשארת שמורה.')) return;
                        setData({ ...normalizeQuoteData(v.data, claim), documents: data.documents, sendLog: data.sendLog, invoices: data.invoices });
                        setDirty(true);
                        toast(`גרסה ${v.version} נטענה לעריכה — שמירה תיצור גרסה חדשה`);
                      }}>טען לעריכה</button>
                    </div>
                  ))}
                  {data.sendLog.length > 0 && <h3>פעולות שליחה</h3>}
                  {data.sendLog.map((s, i) => (
                    <div className="cq-ver" key={i}><small>{new Date(s.at).toLocaleString('he-IL')} · {s.channel === 'email' ? 'מייל' : s.channel === 'whatsapp' ? 'WhatsApp' : s.channel} · {s.to} · {s.note || ''}</small></div>
                  ))}
                </section>
              )}
            </aside>
          </div>
        )}

        {/* Add work picker */}
        {addWork && (
          <div className="cq-dialog-back" onClick={(e) => { if (e.target === e.currentTarget) setAddWork(null); }}>
            <div className="cq-dialog" data-testid="cq-add-work-dialog">
              <h3>➕ הוסף עבודה</h3>
              <label><span>קטגוריה</span>
                <select className="cq-in" value={addWork.category} onChange={(e) => setAddWork({ ...addWork, category: e.target.value, label: '' })}>
                  <optgroup label="ראשיות">{CORE_CATEGORIES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
                  <optgroup label="נוספות">{EXTRA_CATEGORIES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>
                </select>
              </label>
              <div className="cq-chips">
                {workLabels.filter((l) => l.category === addWork.category).map((l) => (
                  <button type="button" key={l.label} className={`cq-chip${addWork.label === l.label ? ' on' : ''}`} onClick={() => setAddWork({ ...addWork, label: l.label })}>{l.label}</button>
                ))}
              </div>
              <label><span>או הקלד עבודה חדשה</span>
                <input className="cq-in" value={addWork.label} placeholder={`עבודה ב${categoryLabel(addWork.category)}`} autoFocus onChange={(e) => setAddWork({ ...addWork, label: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') void confirmAddWork(); }} />
              </label>
              <label className="cq-incl"><input type="checkbox" checked={addWork.saveToLib} onChange={(e) => setAddWork({ ...addWork, saveToLib: e.target.checked })} /><span>שמור בספריית העבודות לשימוש חוזר</span></label>
              <div className="cq-dialog-acts">
                <button type="button" className="cq-btn cq-btn-p" onClick={() => void confirmAddWork()}>הוסף</button>
                <button type="button" className="cq-btn cq-btn-g" onClick={() => setAddWork(null)}>ביטול</button>
              </div>
            </div>
          </div>
        )}

        {/* Saved paint calcs */}
        {paintPick && !paintConfirm && (
          <div className="cq-dialog-back" onClick={(e) => { if (e.target === e.currentTarget) setPaintPick(null); }}>
            <div className="cq-dialog">
              <h3>🎨 חישובי צבע שמורים בתיק</h3>
              {paintPick.map((row) => (
                <div className="cq-ver" key={row.id}>
                  <div><b>{row.is_draft ? 'טיוטה אחרונה' : `גרסה ${row.version}`}</b> · {new Date(row.updated_at || row.created_at).toLocaleString('he-IL')}</div>
                  <small>עבודת צבע {formatIls(row.calc_data.laborCost)} · חומרי צבע {formatIls(row.calc_data.materialsCost)}</small>
                  <button type="button" className="cq-btn cq-btn-g cq-btn-sm" onClick={() => setPaintConfirm({ calc: row.calc_data, ref: { id: row.id, version: row.is_draft ? 0 : row.version } })}>בחר</button>
                </div>
              ))}
              <div className="cq-dialog-acts"><button type="button" className="cq-btn cq-btn-g" onClick={() => setPaintPick(null)}>סגור</button></div>
            </div>
          </div>
        )}

        {paintConfirm && (
          <div className="cq-dialog-back">
            <div className="cq-dialog" data-testid="cq-paint-confirm">
              <h3>אישור עדכון חישוב צבע</h3>
              <div className="cq-sum-row"><span>עבודת צבע → עבודות צבע</span><b>{formatIls(paintConfirm.calc.laborCost)}</b></div>
              <div className="cq-sum-row"><span>חומרי צבע → חלקים וחומרים</span><b>{formatIls(paintConfirm.calc.materialsCost)}</b></div>
              {data.paintCalcRef && <div className="cq-note">השורות מחישוב הצבע הקודם (עבודה {formatIls(data.paintCalcRef.laborCost)}, חומרים {formatIls(data.paintCalcRef.materialsCost)}) יוחלפו — ללא חישוב כפול.</div>}
              <div className="cq-note">המע״מ של מחשבון הצבע לא נכנס — המע״מ מחושב פעם אחת על כל ההצעה.</div>
              <div className="cq-dialog-acts">
                <button type="button" className="cq-btn cq-btn-p" data-testid="cq-paint-apply" onClick={applyPaint}>אשר ועדכן הצעה</button>
                <button type="button" className="cq-btn cq-btn-g" onClick={() => setPaintConfirm(null)}>ביטול</button>
              </div>
            </div>
          </div>
        )}

        {/* Paint calculator (existing component) */}
        {paintOpen && (
          <div className="pc-modal-backdrop cq-paint-modal" onClick={(e) => { if (e.target === e.currentTarget) setPaintOpen(false); }}>
            <div className="pc-modal-content">
              <PaintCalculator
                claim={claim}
                actor={actor}
                onClose={() => setPaintOpen(false)}
                onApplyToQuote={(calc, saved) => {
                  setPaintOpen(false);
                  setPaintConfirm({ calc, ref: saved || { id: '', version: 0 } });
                }}
              />
            </div>
          </div>
        )}

        {/* Invoice review */}
        {review && (
          <div className="cq-dialog-back">
            <div className="cq-dialog cq-dialog-wide" data-testid="cq-invoice-review">
              <h3>🧾 התאמת חשבונית: {review.invoice.fileName}</h3>
              <div className="cq-note">
                {review.invoice.readSource === 'none' ? 'לא נמצא טקסט קריא בקובץ — אפשר להוסיף שורות ידנית.' : `נקרא מ-${review.invoice.readSource === 'ocr' ? 'זיהוי תווים (OCR)' : 'טקסט ה-PDF'} — בדוק את הערכים לפני אישור.`}
                {' '}סמן רק את מה שברצונך לעדכן.
              </div>
              <div className="cq-rev-table">
                <div className="cq-rev-head"><span /><span>מצב</span><span>שם</span><span>מק״ט</span><span>כמות</span><span>ברוטו</span><span>נטו 🔒</span></div>
                {review.rows.map((r, i) => {
                  const set = (patch: Partial<InvoiceLine>) => setReview((rv) => rv && ({ ...rv, rows: rv.rows.map((x, j) => (j === i ? { ...x, line: { ...x.line, ...patch } } : x)) }));
                  const status = r.match.kind === 'new' ? 'חלק חדש — להוסיף?' : r.match.kind === 'same' ? 'תואם להצעה' : `שינוי: ${r.match.diffs.map((d) => `${d.field === 'qty' ? 'כמות' : d.field === 'unitGross' ? 'ברוטו' : 'נטו'} ${d.from}→${d.to}`).join(', ')}`;
                  return (
                    <div className={`cq-rev-row cq-rev-${r.match.kind}`} key={i}>
                      <input type="checkbox" checked={r.approved} aria-label="אשר שורה" onChange={(e) => setReview((rv) => rv && ({ ...rv, rows: rv.rows.map((x, j) => (j === i ? { ...x, approved: e.target.checked } : x)) }))} />
                      <span className="cq-rev-status">{status}</span>
                      <input className="cq-in" value={r.line.name} onChange={(e) => set({ name: e.target.value })} />
                      <input className="cq-in" dir="ltr" value={r.line.sku} onChange={(e) => set({ sku: e.target.value })} />
                      <input className="cq-in" type="number" value={r.line.qty || ''} onChange={(e) => set({ qty: n(e.target.value) })} />
                      <input className="cq-in" type="number" value={r.line.gross || ''} onChange={(e) => set({ gross: n(e.target.value) })} />
                      <input className="cq-in" type="number" value={r.line.net || ''} onChange={(e) => set({ net: n(e.target.value) })} />
                    </div>
                  );
                })}
                {!review.rows.length && <div className="cq-empty">לא זוהו שורות חלקים בחשבונית.</div>}
              </div>
              <button type="button" className="cq-btn cq-btn-g cq-btn-sm" onClick={() => setReview((rv) => rv && ({ ...rv, rows: [...rv.rows, { match: { kind: 'new', line: { name: '', sku: '', qty: 1, gross: 0, net: 0, supplierDiscountPct: 0 } }, line: { name: '', sku: '', qty: 1, gross: 0, net: 0, supplierDiscountPct: 0 }, approved: true }] }))}>+ שורה ידנית</button>
              <div className="cq-dialog-acts">
                <button type="button" className="cq-btn cq-btn-p" data-testid="cq-invoice-approve" onClick={approveReview}>אשר שורות מסומנות</button>
                <button type="button" className="cq-btn cq-btn-g" onClick={() => setReview(null)}>סגור בלי לשנות</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
