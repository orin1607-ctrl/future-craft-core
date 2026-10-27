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
  applyHourRate,
  applyInvoiceMatches,
  applyPaintCalc,
  MATERIALS_GROUP,
  PARTS_GROUP,
  categoryLabel,
  claimSnapshotOf,
  cleanNumericInput,
  parseNumericInput,
  customDomainKey,
  invoiceClaimCheck,
  libraryWorkCategory,
  paintSyncAction,
  partGroupOf,
  partGroupsOf,
  splitLibraryWorkCategory,
  workGroupsOf,
  type ClaimRef,
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
  type LibraryKind,
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
  /** Invoice-kind documents already in the claim's gallery (uploaded from the claim card, mail, etc.). */
  claimInvoiceFiles?: Array<{ id: string; name: string; mime: string; createdAt: string }>;
  /** All open claims, to tell which claim an invoice names. */
  claimsIndex?: ClaimRef[];
}

type ClaimCheck = ReturnType<typeof invoiceClaimCheck>;
type InvoiceReview = {
  invoice: QuoteInvoice;
  rows: Array<{ match: InvoiceMatch; line: InvoiceLine; approved: boolean }>;
  check: ClaimCheck;
  targetGroup: string;
};

/** One dialog for adding a work area, a category inside an area, a work item, or a parts category. */
type Picker =
  | { mode: 'domain'; label: string; saveToLib: boolean }
  | { mode: 'group'; domain: string; label: string; saveToLib: boolean }
  | { mode: 'item'; domain: string; group: string; label: string; saveToLib: boolean }
  | { mode: 'partGroup'; label: string; saveToLib: boolean };

type PaintNotice = {
  kind: 'apply' | 'update';
  version: number;
  from: { labor: number; materials: number } | null;
  to: { labor: number; materials: number };
  undo: Pick<QuoteData, 'works' | 'parts' | 'paintCalcRef'>;
  auto: boolean;
};

/**
 * Price / hours box. Keeps exactly what is typed (so "0.5", "2." and "2,5" work on every browser and
 * phone keyboard) and reports the number on each keystroke. Shows the stored value again when not editing.
 */
function NumField({ value, onValue, className = 'cq-in cq-in-num', label, placeholder }: {
  value: number;
  onValue: (v: number) => void;
  className?: string;
  label?: string;
  placeholder?: string;
}) {
  const shown = (v: number) => (v ? String(v) : '');
  const [raw, setRaw] = useState(() => shown(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setRaw(shown(value));
  }, [value]);
  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      dir="ltr"
      autoComplete="off"
      value={raw}
      placeholder={placeholder}
      aria-label={label}
      onFocus={() => { editing.current = true; }}
      onBlur={() => { editing.current = false; setRaw(shown(parseNumericInput(cleanNumericInput(raw)))); }}
      onChange={(e) => {
        const clean = cleanNumericInput(e.target.value);
        setRaw(clean);
        onValue(parseNumericInput(clean));
      }}
    />
  );
}

export default function ClaimQuoteEditor(props: ClaimQuoteEditorProps) {
  const { claim, actor, recipients, uploadFile, getSignedUrl, logHistory, onOpenEmail, toast, onClose } = props;
  const claimInvoiceFiles = props.claimInvoiceFiles || [];
  const claimsIndex = props.claimsIndex || [];
  const [quotes, setQuotes] = useState<ClaimQuoteRow[]>([]);
  const [quote, setQuote] = useState<ClaimQuoteRow | null>(null);
  const [data, setData] = useState<QuoteData>(() => newQuoteData(claim));
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [changedSomething, setChangedSomething] = useState(false);
  const [library, setLibrary] = useState<LibraryItem[]>(() => mergeLibrary([]));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [picker, setPicker] = useState<Picker | null>(null);
  /** Row just added with "+ הוסף עבודה" / "+ הוסף חלק / חומר": its first field gets the cursor. */
  const [focusId, setFocusId] = useState('');
  /** Part rows whose internal details (מק״ט, type, supplier net…) are expanded. */
  const [partOpen, setPartOpen] = useState<Record<string, boolean>>({});
  const [paintOpen, setPaintOpen] = useState(false);
  const [paintPick, setPaintPick] = useState<PaintCalcRow[] | null>(null);
  const [paintNotice, setPaintNotice] = useState<PaintNotice | null>(null);
  const latestPaint = useRef<PaintCalcRow | null>(null);
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
  const libOf = (kind: LibraryKind, category?: string) => library.filter((l) => l.kind === kind && (category === undefined || l.category === category));
  /** Saved part names for a parts category ('parts' is how חלקים is stored). */
  const partLabelsFor = (group: string) => {
    const cat = group === PARTS_GROUP ? 'parts' : group;
    return [...new Set(library.filter((l) => l.kind === 'part' && l.category === cat).map((l) => l.label))];
  };
  const currentRef: ClaimRef = { id: claim.id, plate: String(claim.plate || ''), claimNum: String(claim.claimNum || ''), clientName: String(claim.clientName || '') };
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
    let next: QuoteData = { ...base, claim: claimSnap };
    // Paint works come from the claim's latest saved paint calculation automatically.
    const lp = latestPaint.current;
    const action = lp ? paintSyncAction(next, { id: lp.id, version: lp.version, laborCost: lp.calc_data.laborCost, materialsCost: lp.calc_data.materialsCost }) : 'none';
    setPaintNotice(null);
    if (lp && action !== 'none') {
      const undo = { works: next.works, parts: next.parts, paintCalcRef: next.paintCalcRef };
      const from = next.paintCalcRef ? { labor: next.paintCalcRef.laborCost, materials: next.paintCalcRef.materialsCost } : null;
      next = applyPaintCalc(next, lp.calc_data, { id: lp.id, version: lp.version });
      setPaintNotice({ kind: action, version: lp.version, from, to: { labor: next.paintCalcRef!.laborCost, materials: next.paintCalcRef!.materialsCost }, undo, auto: true });
    }
    commitData(next);
    setDirty(!row || action !== 'none');
  };

  /** The quote sits in a fixed panel. Scroll that panel, not the page behind it. */
  useEffect(() => {
    if (!focusId) return;
    const scroll = () => {
      const root = document.querySelector('.cq-root');
      const el = document.querySelector(`[data-line-id="${CSS.escape(focusId)}"]`);
      if (!root || !(el instanceof HTMLElement)) return;
      const rr = root.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      root.scrollTo({ top: Math.max(0, root.scrollTop + (er.top - rr.top) - 72) });
    };
    const t1 = window.setTimeout(scroll, 60);
    const t2 = window.setTimeout(scroll, 400);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [focusId]);

  /** Shrink the panel to the visible screen when the phone keyboard opens. */
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      document.documentElement.style.setProperty('--cq-vvh', `${Math.round(vv.height)}px`);
      document.documentElement.style.setProperty('--cq-vvt', `${Math.round(vv.offsetTop)}px`);
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest('.cq-root')) {
        const root = document.querySelector('.cq-root');
        if (!root) return;
        const rr = root.getBoundingClientRect();
        const er = active.getBoundingClientRect();
        if (er.bottom > rr.bottom - 12 || er.top < rr.top + 64) {
          root.scrollTo({ top: Math.max(0, root.scrollTop + (er.top - rr.top) - 80) });
        }
      }
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      document.documentElement.style.removeProperty('--cq-vvh');
      document.documentElement.style.removeProperty('--cq-vvt');
    };
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [rows, lib, paintHist] = await Promise.all([
          listClaimQuotes(claim.id),
          loadQuoteLibrary(actor.company_name),
          loadPaintCalcHistory(claim.id).catch(() => [] as PaintCalcRow[]),
        ]);
        if (!live) return;
        latestPaint.current = paintHist[0] || null;
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
    const add = (it: LibraryItem) => { if (!known.has(`${it.kind}|${it.category}|${it.label}`)) fresh.push(it); };
    // Custom work areas and the categories opened in them are kept for future quotes.
    for (const key of new Set([...d.categories, ...d.works.map((w) => w.category)])) {
      if (key.startsWith('custom:')) add({ kind: 'domain', category: '', label: categoryLabel(key) });
    }
    for (const [domain, groups] of Object.entries(d.workGroups || {})) for (const g of groups) if (g.trim()) add({ kind: 'work_group', category: domain, label: g.trim() });
    for (const g of d.partGroups || []) if (g.trim() && g !== PARTS_GROUP && g !== MATERIALS_GROUP) add({ kind: 'part_group', category: '', label: g.trim() });
    for (const w of d.works) {
      if (w.source === 'paint_calc' || !w.label.trim()) continue;
      if ((w.group || '').trim()) add({ kind: 'work_group', category: w.category, label: (w.group || '').trim() });
      add({ kind: 'work', category: libraryWorkCategory(w.category, w.group || ''), label: w.label.trim(), default_hours: w.pricing === 'hours' ? w.hours || null : null, default_price: w.pricing === 'global' ? w.globalPrice || null : null });
    }
    for (const p of d.parts) {
      if (p.source === 'paint_materials' || !p.name.trim()) continue;
      const g = partGroupOf(p);
      add({ kind: 'part', category: g === PARTS_GROUP ? 'parts' : g, label: p.name.trim() });
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
    const fixed = ALL_CATEGORIES.filter((c) => c.core || used.has(c.key));
    const custom = [...used].filter((k) => k.startsWith('custom:')).map((k) => ({ key: k, label: categoryLabel(k), core: false }));
    return [...fixed, ...custom];
  }, [data.categories, data.works]);

  const remember = async (it: LibraryItem, wanted: boolean) => {
    if (!wanted || library.some((l) => l.kind === it.kind && l.category === it.category && l.label === it.label)) return;
    setLibrary((prev) => mergeLibrary([...prev, it]));
    await addQuoteLibraryItem(it, actor.company_name, actor).catch(() => null);
  };

  const confirmPicker = async () => {
    if (!picker) return;
    const label = picker.label.trim();
    if (!label) { toast('יש לבחור מהרשימה או להקליד שם', 'err'); return; }
    if (picker.mode === 'domain') {
      const fixed = ALL_CATEGORIES.find((c) => c.label === label);
      const key = fixed ? fixed.key : customDomainKey(label);
      update((d) => ({ ...d, categories: [...new Set([...d.categories, key])] }));
      setCollapsed((c) => ({ ...c, [key]: false }));
      if (!fixed) await remember({ kind: 'domain', category: '', label }, picker.saveToLib);
    } else if (picker.mode === 'group') {
      const { domain } = picker;
      update((d) => ({ ...d, categories: [...new Set([...d.categories, domain])], workGroups: { ...d.workGroups, [domain]: [...new Set([...(d.workGroups[domain] || []), label])] } }));
      await remember({ kind: 'work_group', category: domain, label }, picker.saveToLib);
    } else if (picker.mode === 'item') {
      const { domain, group } = picker;
      const cat = libraryWorkCategory(domain, group);
      const lib = workLabels.find((l) => l.category === cat && l.label === label);
      const line = newWorkLine(domain, label, data.hourRate, {
        group,
        ...(lib?.default_price ? { pricing: 'global' as const, globalPrice: Number(lib.default_price) } : { hours: Number(lib?.default_hours || 0) }),
      });
      update((d) => ({ ...d, categories: [...new Set([...d.categories, domain])], works: [...d.works, line] }));
      setCollapsed((c) => ({ ...c, [domain]: false }));
      await remember({ kind: 'work', category: cat, label }, picker.saveToLib);
    } else {
      if (label !== PARTS_GROUP && label !== MATERIALS_GROUP) {
        update((d) => ({ ...d, partGroups: [...new Set([...(d.partGroups || []), label])] }));
        await remember({ kind: 'part_group', category: '', label }, picker.saveToLib);
      }
    }
    setPicker(null);
  };

  /** Saved choices offered as chips in the picker. */
  const pickerChips = (pk: Picker): string[] => {
    if (pk.mode === 'domain') {
      const shown = new Set(visibleCats.map((c) => c.label));
      return [...new Set([...EXTRA_CATEGORIES.map((c) => c.label), ...libOf('domain').map((l) => l.label)])].filter((l) => !shown.has(l));
    }
    if (pk.mode === 'group') return libOf('work_group', pk.domain).map((l) => l.label).filter((l) => !(data.workGroups[pk.domain] || []).includes(l));
    if (pk.mode === 'item') return [...new Set(libOf('work', libraryWorkCategory(pk.domain, pk.group)).map((l) => l.label))];
    return libOf('part_group').map((l) => l.label).filter((l) => !partGroupsOf(data).includes(l));
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

  /** Replaces the paint lines (never adds a second set) and shows what changed, with an undo. */
  const applyPaint = (calc: PaintCalcData, ref: { id: string; version: number }) => {
    const d = dataRef.current;
    const undo = { works: d.works, parts: d.parts, paintCalcRef: d.paintCalcRef };
    const from = d.paintCalcRef ? { labor: d.paintCalcRef.laborCost, materials: d.paintCalcRef.materialsCost } : null;
    const next = applyPaintCalc(d, calc, ref);
    commitData(next);
    setDirty(true);
    setPaintNotice({ kind: from ? 'update' : 'apply', version: ref.version, from, to: { labor: next.paintCalcRef!.laborCost, materials: next.paintCalcRef!.materialsCost }, undo, auto: false });
    setPaintPick(null);
  };

  const undoPaint = () => {
    if (!paintNotice) return;
    update((d) => ({ ...d, ...paintNotice.undo }));
    setPaintNotice(null);
    toast('עדכון חישוב הצבע בוטל');
  };

  // ─── Invoices ────────────────────────────────────────────────────────────
  const startReview = (invoice: QuoteInvoice, parts: QuotePartLine[], text = '') => {
    const matches = matchInvoiceLines(parts, invoice.lines);
    const check: ClaimCheck = text ? invoiceClaimCheck(text, currentRef, claimsIndex) : { status: invoice.claimCheck || 'unknown', otherClaims: [] };
    // New lines are pre-checked only when they carry a catalogue number, and never when the invoice names another claim.
    const preCheck = (m: InvoiceMatch) => check.status !== 'other' && m.kind === 'new' && !!m.line.sku;
    setReview({ invoice: { ...invoice, claimCheck: check.status }, rows: matches.map((m) => ({ match: m, line: { ...m.line }, approved: preCheck(m) })), check, targetGroup: PARTS_GROUP });
  };

  /** Reads an invoice already stored in the claim (no new upload) and opens the review. */
  const syncClaimInvoice = async (f: { id: string; name: string; mime: string }) => {
    setBusy('invoice');
    try {
      const url = await getSignedUrl(f.id);
      const blob = url ? await fetch(url).then((r) => (r.ok ? r.blob() : null)).catch(() => null) : null;
      if (!blob) { toast('לא ניתן להוריד את החשבונית מהתיק', 'err'); return; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const sha = await sha256Hex(bytes);
      const same = dataRef.current.invoices.find((i) => i.sha === sha || i.docId === f.id);
      if (same) { toast(`החשבונית כבר מסונכרנת להצעה (${same.fileName}) — לא נוצרה כפילות`, 'err'); return; }
      const read = await extractClaimDocumentText({ bytes, mimeType: f.mime || blob.type, fileName: f.name });
      const invoice: QuoteInvoice = {
        docId: f.id, sha, fileName: f.name, uploadedAt: new Date().toISOString(), readSource: read.source, lines: parseInvoiceText(read.text),
        claimCheck: invoiceClaimCheck(read.text, currentRef, claimsIndex).status,
      };
      update((d) => ({ ...d, invoices: [...d.invoices.filter((i) => i.sha !== sha), invoice] }));
      await logHistory('חשבונית ספק מהתיק סונכרנה להצעת מחיר', `${f.name} · ${invoice.lines.length} שורות זוהו`).catch(() => null);
      startReview(invoice, dataRef.current.parts, read.text);
    } finally {
      setBusy('');
    }
  };

  const pendingClaimInvoices = claimInvoiceFiles.filter((f) => !data.invoices.some((i) => i.docId === f.id) && !(data.ignoredInvoiceDocs || []).includes(f.id));

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
          claimCheck: invoiceClaimCheck(read.text, currentRef, claimsIndex).status,
        };
        update((d) => ({ ...d, invoices: [...d.invoices.filter((i) => i.sha !== sha), invoice] }));
        await logHistory('חשבונית חלקים נקלטה להצעת מחיר', `${file.name} · ${invoice.lines.length} שורות זוהו`).catch(() => null);
        startReview(invoice, data.parts, read.text);
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
      const next = applyInvoiceMatches(d, review.invoice, approved, review.targetGroup === PARTS_GROUP ? '' : review.targetGroup);
      return { ...next, invoices: next.invoices.map((i) => (i.sha === review.invoice.sha ? { ...i, lines: review.rows.map((r) => r.line), claimCheck: review.check.status, reviewedAt: new Date().toISOString() } : i)) };
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

  /** Discount cell: one number and a %/₪ choice. An empty number means no discount. */
  const discountCell = (type: DiscountType, value: number, amount: number, set: (t: DiscountType, v: number) => void) => (
    <span className="cq-td cq-a-disc" data-label="הנחה">
      <span className="cq-disc-cell">
        <NumField value={value} label="ערך הנחה" placeholder="0" onValue={(v) => set(type === 'none' ? 'percent' : type, v)} />
        <select className="cq-in cq-unit-sel" aria-label="סוג הנחה" value={type === 'amount' ? 'amount' : 'percent'}
          onChange={(e) => set(e.target.value as DiscountType, value)}>
          <option value="percent">%</option>
          <option value="amount">₪</option>
        </select>
      </span>
      {amount > 0 && <small className="cq-disc-amt" dir="ltr" data-testid="cq-discount">-{formatIls(amount)}</small>}
    </span>
  );

  const workRow = (w: QuoteWorkLine) => {
    const pr = workPricing(w);
    const manual = w.pricing === 'global';
    const fromPaint = w.source === 'paint_calc';
    const opts = [...new Set(workLabels.filter((l) => splitLibraryWorkCategory(l.category).domain === w.category).map((l) => l.label))];
    return (
      <div className="cq-tr" key={w.id} data-testid="cq-work-row" data-line-id={w.id}>
        <span className="cq-td cq-td-desc cq-a-desc" data-label="פירוט העבודה">
          <span className="cq-desc-line">
            <input className="cq-in" list={`cq-wl-${w.category}`} value={w.label} placeholder="למשל: פירוק והרכבת פגוש קדמי" aria-label="תיאור העבודה"
              autoFocus={focusId === w.id} onChange={(e) => setWork(w.id, { label: e.target.value })} />
            {/ימין|שמאל/.test(w.label) && (
              <>
                <button type="button" className="cq-icon" title="החלף צד ימין/שמאל" onClick={() => setWork(w.id, { label: swapSide(w.label) })}>⇄</button>
                <button type="button" className="cq-icon" title="הוסף את אותה עבודה בצד השני"
                  onClick={() => update((d) => ({ ...d, works: [...d.works, { ...w, id: newWorkLine(w.category).id, label: swapSide(w.label), source: 'manual' }] }))}>⧉</button>
              </>
            )}
          </span>
          <datalist id={`cq-wl-${w.category}`}>{opts.map((o) => <option key={o} value={o} />)}</datalist>
          {fromPaint && <small className="cq-tag">🎨 ממחשבון הצבע · חומרי הצבע בשורה נפרדת בחלקים וחומרים</small>}
        </span>
        <span className="cq-td cq-a-hours" data-label="מספר שעות">
          {manual ? (
            <button type="button" className="cq-manual" data-testid="cq-price-hours" title="חזרה לחישוב לפי שעות"
              onClick={() => setWork(w.id, { pricing: 'hours', hourRate: data.hourRate })}>
              {fromPaint ? '🎨 מחשבון' : 'ידני'}<small>⟲ שעות</small>
            </button>
          ) : (
            <>
              <NumField key="hours" value={w.hours} label="שעות" placeholder="0" onValue={(v) => setWork(w.id, { hours: v, hourRate: data.hourRate })} />
              {w.hourRate !== data.hourRate && <small className="cq-note">לפי {formatIls(w.hourRate)}/ש׳</small>}
            </>
          )}
        </span>
        <span className="cq-td cq-a-price" data-label="מחיר לפני הנחה">
          {/* Typing here sets a manual amount for this line instead of hours × rate. */}
          <NumField key="price" className="cq-in cq-in-money" value={pr.original} label="מחיר גלובלי" placeholder="הקלד מחיר"
            onValue={(v) => setWork(w.id, { pricing: 'global', globalPrice: v })} />
          {!manual && w.hours > 0 && <small className="cq-note" data-testid="cq-hours-formula">{formatIls(w.hourRate)} × {w.hours} שעות</small>}
          <small className="cq-price-hint">אפשר להקליד כאן מחיר ידני, בלי חישוב לפי שעות</small>
        </span>
        {discountCell(w.discountType, w.discountValue, pr.discount, (t, v) => setWork(w.id, { discountType: t, discountValue: v }))}
        <span className="cq-td cq-td-final cq-a-final" data-label="מחיר סופי"><b dir="ltr" data-testid="cq-final">{formatIls(pr.final)}</b></span>
        <span className="cq-td cq-td-act cq-a-act">
          <button type="button" className="cq-icon cq-del" title="מחק שורה" aria-label="מחק שורה" onClick={() => update((d) => ({ ...d, works: d.works.filter((x) => x.id !== w.id) }))}>🗑</button>
        </span>
      </div>
    );
  };

  const partRow = (p: QuotePartLine) => {
    const pr = partPricing(p);
    const open = partOpen[p.id] ?? !!(p.sku || p.unitNet || p.invoiceDocId || !p.included);
    return (
      <div className={`cq-tr-wrap${p.included ? '' : ' cq-excluded'}`} key={p.id} data-testid="cq-part-row" data-line-id={p.id}>
        <div className="cq-tr cq-tr-part">
          <span className="cq-td cq-td-desc cq-a-desc" data-label="שם החלק / החומר">
            <input className="cq-in" list={`cq-pn-${partGroupOf(p)}`} value={p.name} placeholder={partGroupOf(p) === MATERIALS_GROUP ? 'שם החומר' : 'שם החלק'} aria-label="שם החלק"
              autoFocus={focusId === p.id} onChange={(e) => setPart(p.id, { name: e.target.value })} />
          </span>
          <span className="cq-td cq-a-qty" data-label="כמות">
            <NumField value={p.qty} label="כמות" placeholder="1" onValue={(v) => setPart(p.id, { qty: v })} />
          </span>
          <span className="cq-td cq-a-unit" data-label="מחיר ליחידה">
            <NumField className="cq-in cq-in-money" value={p.unitGross} label="ברוטו ליחידה" placeholder="הקלד מחיר" onValue={(v) => setPart(p.id, { unitGross: v })} />
          </span>
          <span className="cq-td cq-td-calc cq-a-before" data-label="לפני הנחה"><b dir="ltr" data-testid="cq-before">{formatIls(pr.original)}</b></span>
          {discountCell(p.discountType, p.discountValue, pr.discount, (t, v) => setPart(p.id, { discountType: t, discountValue: v }))}
          <span className="cq-td cq-td-final cq-a-final" data-label="מחיר סופי"><b dir="ltr" data-testid="cq-final">{formatIls(p.included ? pr.final : 0)}</b></span>
          <span className="cq-td cq-td-act cq-a-act">
            <button type="button" className="cq-icon" data-testid="cq-part-more" aria-expanded={open} title="פרטים נוספים: מק״ט, סוג, עלות ספק"
              onClick={() => setPartOpen((o) => ({ ...o, [p.id]: !open }))}>{open ? '▴' : '⋯'}</button>
            <button type="button" className="cq-icon cq-del" title="מחק שורה" aria-label="מחק שורה" onClick={() => update((d) => ({ ...d, parts: d.parts.filter((x) => x.id !== p.id) }))}>🗑</button>
          </span>
        </div>
        {open && (
          <div className="cq-part-more">
            <label className="cq-f"><span>מק״ט</span><input className="cq-in cq-in-sku" value={p.sku} aria-label="מק״ט" onChange={(e) => setPart(p.id, { sku: e.target.value })} /></label>
            <label className="cq-f"><span>סוג</span>
              <select className="cq-in cq-in-sm" value={p.partType} aria-label="סוג החלק" onChange={(e) => setPart(p.id, { partType: e.target.value })}>
                {PART_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label className="cq-f cq-f-grow"><span>תיאור</span><input className="cq-in" value={p.description || ''} aria-label="תיאור" onChange={(e) => setPart(p.id, { description: e.target.value })} /></label>
            <label className="cq-f cq-internal-f" title="פנימי — לא מוצג ללקוח"><span>נטו לספק 🔒</span>
              <NumField className="cq-in cq-in-money" value={p.unitNet} label="נטו לספק" onValue={(v) => setPart(p.id, { unitNet: v })} />
            </label>
            <label className="cq-f cq-internal-f" title="פנימי — לא מוצג ללקוח"><span>הנחת ספק % 🔒</span>
              <NumField value={p.supplierDiscountPct} label="הנחת ספק" onValue={(v) => setPart(p.id, { supplierDiscountPct: Math.min(v, 100) })} />
            </label>
            {partGroupsOf(data).length > 2 && (
              <label className="cq-f"><span>קטגוריה</span>
                <select className="cq-in cq-in-sm" value={partGroupOf(p)} aria-label="קטגוריית חלק" onChange={(e) => setPart(p.id, { group: e.target.value })}>
                  {partGroupsOf(data).map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
            )}
            <label className="cq-incl" title="כלול בחישוב">
              <input type="checkbox" checked={p.included} onChange={(e) => setPart(p.id, { included: e.target.checked })} />
              <span>{p.included ? 'כלול בחישוב' : 'לא כלול בחישוב'}</span>
            </label>
            {p.invoiceDocId && <div className="cq-tag">🧾 מקושר לחשבונית: {p.invoiceName || p.invoiceDocId}</div>}
            {p.source === 'paint_materials' && <div className="cq-tag">ממחשבון הצבע — לא כלול בעלות עבודת הצבע</div>}
          </div>
        )}
      </div>
    );
  };

  const workHead = (
    <div className="cq-tr cq-th" aria-hidden="true">
      <span>פירוט העבודה</span><span>שעות</span><span>מחיר לפני הנחה</span><span>הנחה</span><span>מחיר סופי</span><span />
    </div>
  );
  const partHead = (
    <div className="cq-tr cq-tr-part cq-th" aria-hidden="true">
      <span>שם החלק / החומר</span><span>כמות</span><span>מחיר ליחידה</span><span>לפני הנחה</span><span>הנחה</span><span>מחיר סופי</span><span />
    </div>
  );

  const addWorkLine = (category: string, group = '') => {
    const line = newWorkLine(category, '', data.hourRate, { group });
    update((d) => ({ ...d, works: [...d.works, line] }));
    setCollapsed((s) => ({ ...s, [category]: false }));
    setFocusId(line.id);
  };

  /** A tap on the area title reveals its rows. It closes only when those rows are already on screen. */
  const revealCategory = (key: string, isOpen: boolean) => {
    const root = document.querySelector('.cq-root');
    const body = document.querySelector(`[data-testid="cq-cat-${CSS.escape(key)}"] .cq-cat-body`);
    if (isOpen && root && body) {
      const br = body.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      const inView = br.top < rr.bottom - 48 && br.bottom > rr.top + 48;
      if (!inView) {
        root.scrollTo({ top: Math.max(0, root.scrollTop + (br.top - rr.top) - 8) });
        return;
      }
    }
    setCollapsed((s) => ({ ...s, [key]: isOpen }));
    if (!isOpen) {
      window.setTimeout(() => {
        const scroller = document.querySelector('.cq-root');
        const row = document.querySelector(`[data-testid="cq-cat-${CSS.escape(key)}"] .cq-add-row`);
        if (!scroller || !row) return;
        const rr = scroller.getBoundingClientRect();
        const er = row.getBoundingClientRect();
        scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + (er.top - rr.top) - 8) });
      }, 60);
    }
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
                  <label className="cq-rate" data-testid="cq-hour-rate"><b>מחיר שעת עבודה</b>
                    <NumField value={data.hourRate} label="מחיר שעת עבודה" onValue={(v) => update((d) => applyHourRate(d, v))} />
                    <span>₪ לפני מע״מ · חל על כל העבודות לפי שעות</span>
                  </label>
                  <button type="button" className="cq-btn cq-btn-p" data-testid="cq-add-domain" onClick={() => setPicker({ mode: 'domain', label: '', saveToLib: true })}>➕ הוסף תחום עבודה</button>
                </div>
                {visibleCats.map((cat) => {
                  const lines = data.works.filter((w) => w.category === cat.key);
                  const sum = lines.reduce((s, w) => s + workPricing(w).final, 0);
                  const isOpen = !collapsed[cat.key];
                  return (
                    <div className="cq-cat" key={cat.key} data-testid={`cq-cat-${cat.key}`}>
                      <div className="cq-cat-head">
                        <button type="button" className="cq-cat-toggle" aria-expanded={isOpen} onClick={() => revealCategory(cat.key, isOpen)}>
                          <span>{isOpen ? '▾' : '◂'} {cat.label} <small>({lines.length})</small></span>
                        </button>
                        <b className="cq-cat-sum">{formatIls(sum)}</b>
                        <button type="button" className="cq-btn cq-btn-p cq-btn-add cq-cat-add" data-testid="cq-add-work-head"
                          onClick={() => addWorkLine(cat.key)}>+ הוסף עבודה</button>
                      </div>
                      {isOpen && (
                        <div className="cq-cat-body">
                          {cat.key === 'paint' && (
                            <div className="cq-paint-bar">
                              <button type="button" className="cq-btn cq-btn-paint" data-testid="cq-open-paint" onClick={() => setPaintOpen(true)}>🎨 פתח מחשבון צבע</button>
                              <button type="button" className="cq-btn cq-btn-g" onClick={() => void openSavedPaint()}>טען חישוב צבע שמור</button>
                              {data.paintCalcRef
                                ? <span className="cq-note">מסונכרן לחישוב צבע {data.paintCalcRef.version ? `גרסה ${data.paintCalcRef.version}` : ''}: עבודה {formatIls(data.paintCalcRef.laborCost)} · חומרי צבע {formatIls(data.paintCalcRef.materialsCost)} (בחלקים וחומרים)</span>
                                : <span className="cq-note">אין עדיין חישוב צבע שמור בתיק — עבודות הצבע יתמלאו אוטומטית כשיישמר.</span>}
                            </div>
                          )}
                          {cat.key === 'paint' && paintNotice && (
                            <div className="cq-paint-notice" data-testid="cq-paint-notice">
                              <span>
                                {paintNotice.auto ? '🔄 עודכן אוטומטית' : '✓ עודכן'} מחישוב הצבע{paintNotice.version ? ` (גרסה ${paintNotice.version})` : ''}:
                                {' '}עבודת צבע {paintNotice.from ? `${formatIls(paintNotice.from.labor)} ← ` : ''}{formatIls(paintNotice.to.labor)}
                                {' · '}חומרי צבע {paintNotice.from ? `${formatIls(paintNotice.from.materials)} ← ` : ''}{formatIls(paintNotice.to.materials)}.
                                {' '}השורות הקודמות הוחלפו — אין חיוב כפול. השינוי יישמר בשמירת ההצעה.
                              </span>
                              <button type="button" className="cq-btn cq-btn-g cq-btn-sm" onClick={undoPaint}>בטל עדכון</button>
                            </div>
                          )}
                          {workGroupsOf(data, cat.key).map((g) => {
                            const glines = lines.filter((w) => (w.group || '').trim() === g);
                            const hasGroups = workGroupsOf(data, cat.key).length > 1;
                            if (!g && !glines.length && hasGroups && cat.key !== 'paint') return null;
                            return (
                              <div className={g ? 'cq-group' : 'cq-group cq-group-plain'} key={g || '__general'} data-testid={`cq-group-${cat.key}-${g || 'general'}`}>
                                {(g || hasGroups) && <div className="cq-group-head"><span>{g || 'כללי'}</span><b>{formatIls(glines.reduce((s2, w) => s2 + workPricing(w).final, 0))}</b></div>}
                                <div className="cq-table">
                                  {glines.length > 0 && workHead}
                                  {glines.map(workRow)}
                                </div>
                                <div className="cq-add-row">
                                  <button type="button" className="cq-btn cq-btn-p cq-btn-add" data-testid="cq-add-work-line"
                                    onClick={() => addWorkLine(cat.key, g)}>+ הוסף עבודה{g ? ` ב${g}` : ''}</button>
                                  <button type="button" className="cq-btn cq-btn-g cq-btn-sm" data-testid="cq-add-item" title="בחירה מעבודות שנשמרו"
                                    onClick={() => setPicker({ mode: 'item', domain: cat.key, group: g, label: '', saveToLib: true })}>📋 מהרשימה</button>
                                </div>
                              </div>
                            );
                          })}
                          <button type="button" className="cq-btn cq-btn-g cq-btn-sm cq-btn-dashed" data-testid="cq-add-group"
                            onClick={() => setPicker({ mode: 'group', domain: cat.key, label: '', saveToLib: true })}>+ הוסף קטגוריה ב{cat.label}</button>
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
                  <button type="button" className="cq-btn cq-btn-g" data-testid="cq-add-part-group" onClick={() => setPicker({ mode: 'partGroup', label: '', saveToLib: true })}>➕ הוסף קטגוריה</button>
                  <button type="button" className="cq-btn cq-btn-p" data-testid="cq-add-part" onClick={() => { const line = newPartLine(); update((d) => ({ ...d, parts: [...d.parts, line] })); setFocusId(line.id); }}>+ הוסף חלק / חומר</button>
                </div>
                {partGroupsOf(data).map((g) => {
                  const glines = data.parts.filter((p) => partGroupOf(p) === g);
                  const sum = glines.filter((p) => p.included).reduce((s2, p) => s2 + partPricing(p).final, 0);
                  return (
                    <div className="cq-cat" key={g} data-testid={`cq-pgroup-${g}`}>
                      <div className="cq-cat-head cq-cat-static"><span>{g}{g === MATERIALS_GROUP ? ' (קבוע)' : ''} <small>({glines.length})</small></span><b>{formatIls(sum)}</b></div>
                      <div className="cq-cat-body">
                        <datalist id={`cq-pn-${g}`}>{partLabelsFor(g).map((l) => <option key={l} value={l} />)}</datalist>
                        <div className="cq-table">
                          {glines.length > 0 && partHead}
                          {glines.map(partRow)}
                        </div>
                        {!glines.length && <div className="cq-note">אין פריטים בקטגוריה.</div>}
                        <button type="button" className="cq-btn cq-btn-p cq-btn-add" data-testid="cq-add-part-item"
                          onClick={() => {
                            const line = newPartLine(g === MATERIALS_GROUP ? { group: g, partType: 'material' } : g === PARTS_GROUP ? {} : { group: g });
                            update((d) => ({ ...d, parts: [...d.parts, line] }));
                            setFocusId(line.id);
                          }}>+ הוסף {g === MATERIALS_GROUP ? 'חומר' : 'חלק / חומר'} ב{g}</button>
                      </div>
                    </div>
                  );
                })}
              </section>

              {/* Invoices */}
              <section className="cq-card">
                <div className="cq-sec-head">
                  <h3>חשבוניות חלקים</h3>
                  <button type="button" className="cq-btn cq-btn-g" data-testid="cq-upload-invoice" disabled={!!busy} onClick={() => invoiceInput.current?.click()}>🧾 העלה חשבונית</button>
                  <input ref={invoiceInput} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => void onInvoiceFiles(e.target.files)} />
                </div>
                <div className="cq-note">החשבונית נשמרת בגלריית התיק. השורות שזוהו מוצגות לאישורך — שום מחיר או חלק לא משתנה בלי אישור. העלאה חוזרת של אותו קובץ לא יוצרת כפילות.</div>
                {pendingClaimInvoices.length > 0 && (
                  <div className="cq-pending" data-testid="cq-pending-invoices">
                    <b>חשבוניות שהועלו לתיק וטרם סונכרנו להצעה ({pendingClaimInvoices.length})</b>
                    {pendingClaimInvoices.map((f) => (
                      <div className="cq-inv" key={f.id}>
                        <span>📎 {f.name}</span>
                        <small>{f.createdAt ? new Date(f.createdAt).toLocaleDateString('he-IL') : ''}</small>
                        <button type="button" className="cq-btn cq-btn-p cq-btn-sm" data-testid="cq-sync-claim-invoice" disabled={!!busy} onClick={() => void syncClaimInvoice(f)}>סנכרן להצעה</button>
                        <button type="button" className="cq-btn cq-btn-g cq-btn-sm" onClick={() => update((d) => ({ ...d, ignoredInvoiceDocs: [...(d.ignoredInvoiceDocs || []), f.id] }))}>לא חשבונית ספק</button>
                      </div>
                    ))}
                  </div>
                )}
                {data.invoices.map((inv) => (
                  <div className="cq-inv" key={inv.sha}>
                    <span>🧾 {inv.fileName}</span>
                    <small>{new Date(inv.uploadedAt).toLocaleDateString('he-IL')} · {inv.lines.length} שורות · {inv.reviewedAt ? 'נבדקה' : 'ממתינה לבדיקה'}{inv.readSource === 'none' ? ' · לא נקרא טקסט' : ''}{inv.claimCheck === 'match' ? ' · ✓ תואמת לתיק' : inv.claimCheck === 'other' ? ' · ⚠ מזכירה תיק אחר' : ''}</small>
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
                <div className="cq-sum-row cq-sum-disc"><span>סה״כ הנחות ללקוח</span><b dir="ltr">{totals.discounts ? `-${formatIls(totals.discounts)}` : formatIls(0)}</b></div>
                <div className="cq-sum-row"><span>סה״כ לאחר הנחות ולפני מע״מ</span><b>{formatIls(totals.afterDiscounts)}</b></div>
                <div className="cq-sum-row"><span>מע״מ
                  <NumField className="cq-in cq-in-pct" value={data.vatPercent} label="אחוז מע״מ" onValue={(v) => update((d) => ({ ...d, vatPercent: v }))} />%</span>
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

        {/* Add area / category / item / parts category */}
        {picker && (
          <div className="cq-dialog-back" onClick={(e) => { if (e.target === e.currentTarget) setPicker(null); }}>
            <div className="cq-dialog" data-testid="cq-picker">
              <h3>
                {picker.mode === 'domain' ? '➕ הוסף תחום עבודה'
                  : picker.mode === 'group' ? `➕ הוסף קטגוריה ב${categoryLabel(picker.domain)}`
                  : picker.mode === 'item' ? `➕ הוסף סעיף ב${categoryLabel(picker.domain)}${picker.group ? ` › ${picker.group}` : ''}`
                  : '➕ הוסף קטגוריית חלקים'}
              </h3>
              <div className="cq-chips">
                {pickerChips(picker).map((l) => (
                  <button type="button" key={l} className={`cq-chip${picker.label === l ? ' on' : ''}`} onClick={() => setPicker({ ...picker, label: l })}>{l}</button>
                ))}
              </div>
              <label><span>{pickerChips(picker).length ? 'או הקלד חדש' : 'שם'}</span>
                <input className="cq-in" data-testid="cq-picker-input" value={picker.label} autoFocus
                  placeholder={picker.mode === 'domain' ? 'לדוגמה: עבודות חשמל' : picker.mode === 'group' ? 'לדוגמה: חזית הרכב' : picker.mode === 'item' ? 'תיאור הסעיף' : 'לדוגמה: צמיגים'}
                  onChange={(e) => setPicker({ ...picker, label: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') void confirmPicker(); }} />
              </label>
              <label className="cq-incl"><input type="checkbox" checked={picker.saveToLib} onChange={(e) => setPicker({ ...picker, saveToLib: e.target.checked })} /><span>שמור לשימוש חוזר בהצעות הבאות</span></label>
              <div className="cq-dialog-acts">
                <button type="button" className="cq-btn cq-btn-p" data-testid="cq-picker-ok" onClick={() => void confirmPicker()}>הוסף</button>
                <button type="button" className="cq-btn cq-btn-g" onClick={() => setPicker(null)}>ביטול</button>
              </div>
            </div>
          </div>
        )}

        {/* Saved paint calcs */}
        {paintPick && (
          <div className="cq-dialog-back" onClick={(e) => { if (e.target === e.currentTarget) setPaintPick(null); }}>
            <div className="cq-dialog">
              <h3>🎨 חישובי צבע שמורים בתיק</h3>
              {paintPick.map((row) => (
                <div className="cq-ver" key={row.id}>
                  <div><b>{row.is_draft ? 'טיוטה אחרונה' : `גרסה ${row.version}`}</b> · {new Date(row.updated_at || row.created_at).toLocaleString('he-IL')}</div>
                  <small>עבודת צבע {formatIls(row.calc_data.laborCost)} · חומרי צבע {formatIls(row.calc_data.materialsCost)}</small>
                  <button type="button" className="cq-btn cq-btn-g cq-btn-sm" data-testid="cq-paint-pick" onClick={() => applyPaint(row.calc_data, { id: row.id, version: row.is_draft ? 0 : row.version })}>החל על ההצעה</button>
                </div>
              ))}
              <div className="cq-dialog-acts"><button type="button" className="cq-btn cq-btn-g" onClick={() => setPaintPick(null)}>סגור</button></div>
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
                  applyPaint(calc, saved || { id: '', version: 0 });
                  if (saved) latestPaint.current = { id: saved.id, version: saved.version, calc_data: calc } as PaintCalcRow;
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
              {review.check.status === 'match' && <div className="cq-check cq-check-ok" data-testid="cq-claim-check">✓ החשבונית מזכירה את הרכב / התביעה של התיק הזה ({currentRef.plate || currentRef.claimNum}).</div>}
              {review.check.status === 'other' && (
                <div className="cq-check cq-check-bad" data-testid="cq-claim-check">
                  ⚠ החשבונית מזכירה תיק אחר: {review.check.otherClaims.map((o) => `${o.clientName || o.id} (רכב ${o.plate || '—'})`).join(', ')}. ייתכן שהיא הועלתה לתיק הלא נכון — שום שורה לא סומנה מראש.
                </div>
              )}
              {review.check.status === 'unknown' && <div className="cq-check" data-testid="cq-claim-check">לא נמצאו בחשבונית מספר רכב או מספר תביעה — ודא שהיא שייכת לתיק הזה.</div>}
              <label className="cq-f cq-target"><span>קטגוריה לחלקים חדשים</span>
                <select className="cq-in cq-in-sm" value={review.targetGroup} onChange={(e) => setReview((rv) => rv && ({ ...rv, targetGroup: e.target.value }))}>
                  {partGroupsOf(data).map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
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
                      <NumField className="cq-in" value={r.line.qty} label="כמות" onValue={(v) => set({ qty: v })} />
                      <NumField className="cq-in" value={r.line.gross} label="ברוטו" onValue={(v) => set({ gross: v })} />
                      <NumField className="cq-in" value={r.line.net} label="נטו" onValue={(v) => set({ net: v })} />
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
