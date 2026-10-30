/**
 * claimQuoteModel.ts
 * Pure model for claim quotes (הצעות מחיר בתיק תביעה): categories, job library seed,
 * pricing / discounts / VAT, paint-calculator split, invoice parsing and matching.
 * No I/O here — storage lives in claimQuoteService.ts.
 */
import type { PaintCalcData } from './claimPaintCalc';

export const DEFAULT_HOUR_RATE = 380;
export const DEFAULT_VAT_PERCENT = 18;

// ─── Categories ───────────────────────────────────────────────────────────────

export type QuoteCategory = { key: string; label: string; core?: boolean };

/** Shown by default on every new quote, in this order. */
export const CORE_CATEGORIES: QuoteCategory[] = [
  { key: 'body', label: 'עבודות פחחות', core: true },
  { key: 'paint', label: 'עבודות צבע', core: true },
  { key: 'mech', label: 'עבודות מכונאות', core: true },
];

/** Added on demand through "➕ הוסף עבודה". */
export const EXTRA_CATEGORIES: QuoteCategory[] = [
  { key: 'electric', label: 'עבודות חשמל' },
  { key: 'ac', label: 'עבודות מיזוג אוויר / מזגן' },
  { key: 'sealing', label: 'עבודות איטום' },
  { key: 'upholstery', label: 'עבודות ריפוד' },
  { key: 'ev', label: 'עבודות לרכב חשמלי או היברידי' },
  { key: 'disconnect', label: 'ניתוק מערכת החשמל ברכב' },
  { key: 'calibration', label: 'כיול מחשב רכב' },
  { key: 'transport', label: 'שינוע רכב' },
  { key: 'alignment', label: 'כיוון פרונט' },
  { key: 'tire_repair', label: 'עבודת פנצ׳רמאכר' },
  { key: 'rim', label: 'החלפת ג׳אנט' },
  { key: 'tire', label: 'החלפת צמיג' },
  { key: 'other', label: 'עבודות נוספות' },
];

export const ALL_CATEGORIES: QuoteCategory[] = [...CORE_CATEGORIES, ...EXTRA_CATEGORIES];

/** A work area the user named ("עבודות חשמל", "ריפוד מושבים"…). */
export const CUSTOM_PREFIX = 'custom:';
export function customDomainKey(label: string) {
  return `${CUSTOM_PREFIX}${label.trim()}`;
}

export function categoryLabel(key: string) {
  if (key.startsWith(CUSTOM_PREFIX)) return key.slice(CUSTOM_PREFIX.length);
  return ALL_CATEGORIES.find((c) => c.key === key)?.label || key || 'עבודות נוספות';
}

/** Library rows keep the category inside a work area as "<area>::<category>"; no category → just the area. */
export function libraryWorkCategory(domain: string, group = '') {
  return group.trim() ? `${domain}::${group.trim()}` : domain;
}
export function splitLibraryWorkCategory(category: string) {
  const i = category.indexOf('::');
  return i < 0 ? { domain: category, group: '' } : { domain: category.slice(0, i), group: category.slice(i + 2) };
}

// ─── Part categories ──────────────────────────────────────────────────────────

export const PARTS_GROUP = 'חלקים';
/** Always shown, cannot be removed. Paint materials land here. */
export const MATERIALS_GROUP = 'חומרים';

export function partGroupOf(p: { group?: string; partType?: string }) {
  return (p.group || '').trim() || (p.partType === 'material' ? MATERIALS_GROUP : PARTS_GROUP);
}

// ─── Library seed ─────────────────────────────────────────────────────────────

/**
 * work: category = area or "<area>::<category>"; part: category = part category ('parts' = חלקים);
 * domain: a custom work area; work_group: a category inside an area (category = area key);
 * part_group: a custom parts category.
 */
export type LibraryKind = 'work' | 'part' | 'domain' | 'work_group' | 'part_group';
export type LibraryItem = { id?: string; kind: LibraryKind; category: string; label: string; default_hours?: number | null; default_price?: number | null };

export const SEED_WORKS: LibraryItem[] = [
  ...[
    'החלפת כנף קדמית שמאל',
    'החלפת כנף קדמית ימין',
    'החלפת פגוש קדמי חיצוני',
    'פחחות דלת קדמית שמאל',
    'פחחות דלת קדמית ימין',
    'פחחות מכסה מנוע',
    'מתיחת דופן קדמית שמאל',
    'מתיחת דופן קדמית ימין',
    'החלפת פנס ואישור פח משקף',
    'פירוק והרכבת סף פלסטיק ושיפוץ',
    'פחחות סף ברזל תחתון',
  ].map((label) => ({ kind: 'work' as const, category: 'body', label })),
  // Each extra category starts with a job of the same name.
  ...EXTRA_CATEGORIES.filter((c) => c.key !== 'other').map((c) => ({ kind: 'work' as const, category: c.key, label: c.label })),
];

export const SEED_PARTS = ['כנף קדמית', 'כנף אחורית', 'פגוש קדמי', 'פגוש אחורי', 'פנס ראשי', 'פנס אחורי', 'דלת', 'מכסה מנוע', 'ג׳אנט', 'צמיג', 'מראה צד', 'שמשה קדמית'];

/** Seed + saved library, de-duplicated by category+label. */
export function mergeLibrary(saved: LibraryItem[]): LibraryItem[] {
  const out: LibraryItem[] = [];
  const seen = new Set<string>();
  for (const it of [...SEED_WORKS, ...SEED_PARTS.map((label) => ({ kind: 'part' as const, category: 'parts', label })), ...saved]) {
    const k = `${it.kind}|${it.category}|${it.label.trim()}`;
    if (!it.label.trim() || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/** ימין ↔ שמאל, for "the same job on the other side". */
export function swapSide(label: string) {
  return label.replace(/ימין|שמאל/g, (m) => (m === 'ימין' ? 'שמאל' : 'ימין'));
}

// ─── Lines ────────────────────────────────────────────────────────────────────

export type DiscountType = 'none' | 'percent' | 'amount';

export type QuoteWorkLine = {
  id: string;
  category: string;
  label: string;
  pricing: 'hours' | 'global';
  hours: number;
  hourRate: number;
  globalPrice: number;
  discountType: DiscountType;
  discountValue: number;
  /** Category inside the work area; empty = כללי. */
  group?: string;
  note?: string;
  source?: 'manual' | 'paint_calc';
};

export const PART_TYPES: Array<{ key: string; label: string }> = [
  { key: 'new_original', label: 'חדש מקורי' },
  { key: 'new_aftermarket', label: 'חדש חליפי' },
  { key: 'used', label: 'משומש' },
  { key: 'refurbished', label: 'משופץ' },
  { key: 'material', label: 'חומרים' },
];

export function partTypeLabel(key: string) {
  return PART_TYPES.find((p) => p.key === key)?.label || '';
}

export type QuotePartLine = {
  id: string;
  name: string;
  partType: string;
  sku: string;
  qty: number;
  /** Gross unit price — the price the customer sees. */
  unitGross: number;
  /** Net unit price paid to the supplier — internal only, never printed. */
  unitNet: number;
  /** Supplier discount % (internal only). */
  supplierDiscountPct: number;
  discountType: DiscountType;
  discountValue: number;
  included: boolean;
  /** Parts category; empty = derived from partType (see partGroupOf). */
  group?: string;
  description?: string;
  supplier?: string;
  invoiceDocId?: string;
  invoiceName?: string;
  source?: 'manual' | 'paint_materials' | 'invoice';
};

export type InvoiceLine = { name: string; sku: string; qty: number; gross: number; net: number; supplierDiscountPct: number };

export type QuoteInvoice = {
  docId: string;
  sha: string;
  fileName: string;
  uploadedAt: string;
  readSource: 'pdf_text' | 'ocr' | 'none';
  lines: InvoiceLine[];
  reviewedAt?: string;
  /** Whether the invoice text names this claim ('match'), another claim ('other') or neither. */
  claimCheck?: 'match' | 'other' | 'unknown';
};

export type QuoteDocument = { fileId: string; fileName: string; version: number; createdAt: string };
export type QuoteSendEntry = { channel: 'email' | 'whatsapp' | 'download' | 'print'; to: string; at: string; status: 'opened_not_confirmed' | 'sent' | 'downloaded'; note?: string };

export type ClaimSnapshot = {
  clientName: string;
  plate: string;
  carMake: string;
  carModel: string;
  claimNum: string;
  insCompany: string;
  clientPhone: string;
  clientEmail: string;
  weightedPrice?: string;
  showRepairInQuote?: boolean;
  quoteRepairRoute?: 'policy' | 'third_party';
  repairCalcPolicyPct?: string;
  repairCalcPolicyAmount?: string;
  repairCalcThirdPct?: string;
  repairCalcThirdAmount?: string;
};

export type QuoteData = {
  schema: 1;
  claim: ClaimSnapshot;
  hourRate: number;
  vatPercent: number;
  /** Category keys shown as sections (core ones always are). */
  categories: string[];
  works: QuoteWorkLine[];
  parts: QuotePartLine[];
  notes: string;
  internalNotes: string;
  invoices: QuoteInvoice[];
  documents: QuoteDocument[];
  sendLog: QuoteSendEntry[];
  paintCalcRef?: { id: string; version: number; appliedAt: string; laborCost: number; materialsCost: number } | null;
  /** Categories opened inside each work area (area key → names), shown even while empty. */
  workGroups: Record<string, string[]>;
  /** Parts categories besides the fixed חלקים / חומרים. */
  partGroups: string[];
  /** Claim documents (invoice kind) the user marked as not a supplier parts invoice. */
  ignoredInvoiceDocs: string[];
};

let lineSeq = 0;
export function newLineId(prefix = 'L') {
  lineSeq += 1;
  return `${prefix}${Date.now().toString(36)}${lineSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function claimSnapshotOf(claim: Record<string, string | undefined>): ClaimSnapshot {
  const s = (v: unknown) => String(v ?? '').trim();
  return {
    clientName: s(claim.clientName || claim.client_name),
    plate: s(claim.plate),
    carMake: s(claim.carMake || claim.manufacturer),
    carModel: s(claim.carModel || claim.model),
    claimNum: s(claim.claimNum),
    insCompany: s(claim.insCompany),
    clientPhone: s(claim.clientPhone),
    clientEmail: s(claim.clientEmail),
    weightedPrice: s(claim.weightedPrice),
    showRepairInQuote: claim.showRepairInQuote === 'true' || (claim as any).showRepairInQuote === true,
    quoteRepairRoute: ((claim.quoteRepairRoute as any) === 'third_party' ? 'third_party' : 'policy'),
    repairCalcPolicyPct: s(claim.repairCalcPolicyPct),
    repairCalcPolicyAmount: s(claim.repairCalcPolicyAmount),
    repairCalcThirdPct: s(claim.repairCalcThirdPct),
    repairCalcThirdAmount: s(claim.repairCalcThirdAmount),
  };
}

export function newWorkLine(category: string, label = '', hourRate = DEFAULT_HOUR_RATE, extra: Partial<QuoteWorkLine> = {}): QuoteWorkLine {
  return {
    id: newLineId('W'),
    category,
    label,
    pricing: 'hours',
    hours: 0,
    hourRate,
    globalPrice: 0,
    discountType: 'none',
    discountValue: 0,
    source: 'manual',
    ...extra,
  };
}

export function newPartLine(extra: Partial<QuotePartLine> = {}): QuotePartLine {
  return {
    id: newLineId('P'),
    name: '',
    partType: 'new_original',
    sku: '',
    qty: 1,
    unitGross: 0,
    unitNet: 0,
    supplierDiscountPct: 0,
    discountType: 'none',
    discountValue: 0,
    included: true,
    source: 'manual',
    ...extra,
  };
}

/**
 * The hour rate at the top of the quote is the rate of every line priced by hours.
 * Lines with a manual amount, and the paint-calculator line, keep their own amount.
 */
export function applyHourRate(d: QuoteData, rate: number): QuoteData {
  return { ...d, hourRate: rate, works: d.works.map((w) => (w.pricing === 'hours' ? { ...w, hourRate: rate } : w)) };
}

export function newQuoteData(claim: Record<string, string | undefined>): QuoteData {
  return {
    schema: 1,
    claim: claimSnapshotOf(claim),
    hourRate: DEFAULT_HOUR_RATE,
    vatPercent: DEFAULT_VAT_PERCENT,
    categories: CORE_CATEGORIES.map((c) => c.key),
    works: [],
    parts: [newPartLine()],
    notes: '',
    internalNotes: '',
    invoices: [],
    documents: [],
    sendLog: [],
    paintCalcRef: null,
    workGroups: {},
    partGroups: [],
    ignoredInvoiceDocs: [],
  };
}

/** Fills fields a stored quote may lack (older shape) without touching existing values. */
export function normalizeQuoteData(raw: Partial<QuoteData> | null | undefined, claim: Record<string, string | undefined>): QuoteData {
  const base = newQuoteData(claim);
  if (!raw || typeof raw !== 'object') return base;
  const cats = Array.isArray(raw.categories) ? raw.categories : [];
  return {
    ...base,
    ...raw,
    schema: 1,
    claim: { ...base.claim, ...(raw.claim || {}) },
    categories: [...new Set([...base.categories, ...cats])],
    works: Array.isArray(raw.works) ? raw.works : [],
    parts: Array.isArray(raw.parts) ? raw.parts : [],
    invoices: Array.isArray(raw.invoices) ? raw.invoices : [],
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    sendLog: Array.isArray(raw.sendLog) ? raw.sendLog : [],
    workGroups: raw.workGroups && typeof raw.workGroups === 'object' ? raw.workGroups : {},
    partGroups: Array.isArray(raw.partGroups) ? raw.partGroups : [],
    ignoredInvoiceDocs: Array.isArray(raw.ignoredInvoiceDocs) ? raw.ignoredInvoiceDocs : [],
  };
}

/** Part categories in display order: חלקים, custom ones (as added), חומרים last. Used ones always appear. */
export function partGroupsOf(d: Pick<QuoteData, 'parts' | 'partGroups'>): string[] {
  const used = d.parts.map(partGroupOf);
  const middle = [...new Set([...(d.partGroups || []), ...used])].filter((g) => g !== PARTS_GROUP && g !== MATERIALS_GROUP);
  return [PARTS_GROUP, ...middle, MATERIALS_GROUP];
}

/** Categories inside a work area in display order: כללי first, then as added, plus any used by lines. */
export function workGroupsOf(d: Pick<QuoteData, 'works' | 'workGroups'>, domain: string): string[] {
  const used = d.works.filter((w) => w.category === domain).map((w) => (w.group || '').trim());
  return [...new Set(['', ...(d.workGroups?.[domain] || []), ...used])];
}

// ─── Math ─────────────────────────────────────────────────────────────────────

/**
 * What a price / hours box keeps while the user types: digits and one decimal point.
 * A comma is taken as the decimal point (Hebrew phone keyboards), so "2,5" stays 2.5 instead of 25.
 * A leading "0" and a trailing "." are kept, so "0.5" and "2." can be typed.
 */
export function cleanNumericInput(raw: string) {
  const s = String(raw ?? '').replace(/,/g, '.').replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  return dot < 0 ? s : `${s.slice(0, dot + 1)}${s.slice(dot + 1).replace(/\./g, '')}`;
}

/** The number for calculations; an empty or half-typed box ("", ".") counts as 0. */
export function parseNumericInput(clean: string) {
  const v = Number(clean === '.' ? '' : clean);
  return Number.isFinite(v) ? v : 0;
}

export function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
}

export function discountOf(original: number, type: DiscountType, value: number) {
  const v = Math.max(0, num(value));
  if (type === 'percent') return round2(original * Math.min(v, 100) / 100);
  if (type === 'amount') return round2(Math.min(v, Math.max(0, original)));
  return 0;
}

export function workOriginal(w: QuoteWorkLine) {
  return round2(w.pricing === 'global' ? num(w.globalPrice) : num(w.hours) * num(w.hourRate));
}

export function workPricing(w: QuoteWorkLine) {
  const original = workOriginal(w);
  const discount = discountOf(original, w.discountType, w.discountValue);
  return { original, discount, final: round2(original - discount) };
}

export function partPricing(p: QuotePartLine) {
  const original = round2(num(p.qty) * num(p.unitGross));
  const discount = discountOf(original, p.discountType, p.discountValue);
  const netCost = round2(num(p.qty) * num(p.unitNet));
  return { original, discount, final: round2(original - discount), netCost };
}

export type QuoteTotals = {
  body: number;
  paint: number;
  mech: number;
  extras: number;
  parts: number;
  beforeDiscounts: number;
  discounts: number;
  afterDiscounts: number;
  vat: number;
  total: number;
  /** Internal only. */
  internal: { supplierNetCost: number; partsCustomerPrice: number; partsMargin: number; excludedPartsCount: number };
};

export function computeTotals(d: Pick<QuoteData, 'works' | 'parts' | 'vatPercent'>): QuoteTotals {
  let body = 0; let paint = 0; let mech = 0; let extras = 0; let parts = 0;
  let discounts = 0; let supplierNetCost = 0; let partsCustomerPrice = 0; let excluded = 0;
  for (const w of d.works) {
    const p = workPricing(w);
    if (w.category === 'body') body += p.original;
    else if (w.category === 'paint') paint += p.original;
    else if (w.category === 'mech') mech += p.original;
    else extras += p.original;
    discounts += p.discount;
  }
  for (const pl of d.parts) {
    if (!pl.included) { excluded += 1; continue; }
    const p = partPricing(pl);
    parts += p.original;
    discounts += p.discount;
    supplierNetCost += p.netCost;
    partsCustomerPrice += p.final;
  }
  const beforeDiscounts = round2(body + paint + mech + extras + parts);
  const afterDiscounts = round2(beforeDiscounts - discounts);
  const vat = round2(afterDiscounts * num(d.vatPercent) / 100);
  return {
    body: round2(body),
    paint: round2(paint),
    mech: round2(mech),
    extras: round2(extras),
    parts: round2(parts),
    beforeDiscounts,
    discounts: round2(discounts),
    afterDiscounts,
    vat,
    total: round2(afterDiscounts + vat),
    internal: {
      supplierNetCost: round2(supplierNetCost),
      partsCustomerPrice: round2(partsCustomerPrice),
      partsMargin: round2(partsCustomerPrice - supplierNetCost),
      excludedPartsCount: excluded,
    },
  };
}

export function formatIls(n: number) {
  return `₪${round2(n).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Paint calculator split ───────────────────────────────────────────────────

export const PAINT_MATERIALS_NAME = 'חומרי צבע';

/**
 * Paint labour → one global line under "עבודות צבע"; paint materials → one "חומרי צבע" part line.
 * Lines from an earlier paint calculation are replaced, so applying twice never double-counts.
 * The calculator's own VAT is ignored — the quote adds VAT once on its own total.
 */
export function applyPaintCalc(d: QuoteData, calc: PaintCalcData, ref: { id: string; version: number }): QuoteData {
  const labor = round2(num(calc.laborCost));
  const materials = round2(num(calc.materialsCost));
  const hours = round2(num(calc.adjustedHours));
  const prevWork = d.works.find((w) => w.source === 'paint_calc');
  const prevMat = d.parts.find((p) => p.source === 'paint_materials');
  const works = d.works.filter((w) => w.source !== 'paint_calc');
  const parts = d.parts.filter((p) => p.source !== 'paint_materials');
  works.push(newWorkLine('paint', `עבודת צבע לפי מחשבון צבע (${hours.toLocaleString('he-IL')} שעות)`, d.hourRate, {
    pricing: 'global',
    globalPrice: labor,
    hours,
    source: 'paint_calc',
    discountType: prevWork?.discountType || 'none',
    discountValue: prevWork?.discountValue || 0,
  }));
  if (materials > 0) {
    parts.push(newPartLine({
      name: PAINT_MATERIALS_NAME,
      partType: 'material',
      group: MATERIALS_GROUP,
      qty: 1,
      unitGross: materials,
      source: 'paint_materials',
      discountType: prevMat?.discountType || 'none',
      discountValue: prevMat?.discountValue || 0,
    }));
  }
  return {
    ...d,
    works,
    parts,
    paintCalcRef: { id: ref.id, version: ref.version, appliedAt: new Date().toISOString(), laborCost: labor, materialsCost: materials },
  };
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

function toNumber(raw: string) {
  const v = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(v) ? v : NaN;
}

/** A catalogue number: 5+ chars of letters/digits/dashes with a digit, and either a letter, a dash or 6+ digits. */
function findSku(line: string) {
  return line.split(' ').find((t) => /^[A-Z0-9][A-Z0-9-]{4,}$/i.test(t) && /\d/.test(t) && (/[A-Z-]/i.test(t) || t.length >= 6)) || '';
}

const SKIP_LINE_RE = /סה["״]?כ|מע["״]?מ|לתשלום|סכום|חשבונית|קבלה|הזמנה|תאריך|טלפון|ע\.?מ|ח\.?פ|כתובת|עמוד|רכב|רישוי|תביעה|פוליסה|לקוח|\b(?:total|subtotal|vat|invoice|receipt|order|date|phone|address|page|vehicle|plate|claim|policy|customer)\b/i;
/** A unit price above this is a reference number read as money, not a part price. */
const MAX_UNIT_PRICE = 200000;

/**
 * Best-effort line reader for parts invoices. Every line it returns is shown to the user for review;
 * nothing is applied without approval. A line needs a part name and at least one price.
 */
export function parseInvoiceText(text: string): InvoiceLine[] {
  const out: InvoiceLine[] = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/[₪]/g, ' ').replace(/\s+/g, ' ').trim();
    if (line.length < 4 || SKIP_LINE_RE.test(line)) continue;
    const sku = findSku(line);
    const rest = sku ? line.replace(sku, ' ') : line;
    const pctMatch = rest.match(/(\d{1,2}(?:\.\d+)?)\s*%/);
    const supplierDiscountPct = pctMatch ? toNumber(pctMatch[1]) : 0;
    const noPct = pctMatch ? rest.replace(pctMatch[0], ' ') : rest;
    const nums = (noPct.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g) || []).map(toNumber).filter((n) => Number.isFinite(n));
    const name = noPct.replace(/[\d.,%]+/g, ' ').replace(/[|:;*_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!/[֐-׿A-Za-z]{2,}/.test(name)) continue;
    const prices = nums.filter((n) => n >= 1);
    if (!prices.length) continue;
    // A small whole number that is not the only number is the quantity.
    const qtyIdx = prices.length > 1 ? prices.findIndex((n) => Number.isInteger(n) && n > 0 && n <= 50) : -1;
    const qty = qtyIdx >= 0 ? prices[qtyIdx] : 1;
    const money = prices.filter((_, i) => i !== qtyIdx);
    if (!money.length) continue;
    // Gross is the list (higher) unit price, net the lower one; a line total equal to qty×unit is dropped.
    const unitCandidates = money.filter((m) => !(qty > 1 && money.some((u) => round2(u * qty) === round2(m))));
    const sorted = [...(unitCandidates.length ? unitCandidates : money)].sort((a, b) => b - a);
    const gross = sorted[0];
    if (gross > MAX_UNIT_PRICE) continue;
    let net = sorted.length > 1 ? sorted[sorted.length - 1] : gross;
    if (supplierDiscountPct && sorted.length === 1) net = round2(gross * (1 - supplierDiscountPct / 100));
    out.push({ name: name.slice(0, 80), sku, qty, gross: round2(gross), net: round2(net), supplierDiscountPct });
  }
  return out;
}

export function normSku(s: string) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normName(s: string) {
  return String(s || '').replace(/["'׳״`]/g, '').replace(/\s+/g, ' ').trim();
}

export type InvoiceMatch =
  | { kind: 'new'; line: InvoiceLine }
  | { kind: 'same'; line: InvoiceLine; partId: string }
  | { kind: 'changed'; line: InvoiceLine; partId: string; diffs: Array<{ field: 'qty' | 'unitGross' | 'unitNet'; from: number; to: number }> };

/** Matched part vs. invoice line: 'changed' with the differing fields, or 'same'. */
export function compareToPart(part: QuotePartLine, line: InvoiceLine): InvoiceMatch {
  const diffs: Array<{ field: 'qty' | 'unitGross' | 'unitNet'; from: number; to: number }> = [];
  if (line.qty && round2(line.qty) !== round2(part.qty)) diffs.push({ field: 'qty', from: part.qty, to: line.qty });
  if (line.gross && round2(line.gross) !== round2(part.unitGross)) diffs.push({ field: 'unitGross', from: part.unitGross, to: line.gross });
  if (line.net && round2(line.net) !== round2(part.unitNet)) diffs.push({ field: 'unitNet', from: part.unitNet, to: line.net });
  return diffs.length ? { kind: 'changed', line, partId: part.id, diffs } : { kind: 'same', line, partId: part.id };
}

/** Matches by SKU first, then by name. Never changes anything — the caller applies only what the user approves. */
export function matchInvoiceLines(parts: QuotePartLine[], lines: InvoiceLine[]): InvoiceMatch[] {
  const used = new Set<string>();
  return lines.map((line) => {
    const sku = normSku(line.sku);
    const name = normName(line.name);
    const found = (sku && parts.find((p) => !used.has(p.id) && normSku(p.sku) === sku))
      || (name && parts.find((p) => !used.has(p.id) && normName(p.name) && (normName(p.name) === name || name.includes(normName(p.name)) || normName(p.name).includes(name))));
    if (!found) return { kind: 'new', line } as InvoiceMatch;
    used.add(found.id);
    return compareToPart(found, line);
  });
}

/** Applies only the approved matches; links every touched part to the invoice file. */
export function applyInvoiceMatches(
  d: QuoteData,
  invoice: Pick<QuoteInvoice, 'docId' | 'fileName'>,
  approved: InvoiceMatch[],
  targetGroup = '',
): QuoteData {
  let parts = [...d.parts];
  for (const m of approved) {
    if (m.kind === 'new') {
      parts.push(newPartLine({
        name: m.line.name,
        sku: m.line.sku,
        qty: m.line.qty || 1,
        unitGross: m.line.gross,
        unitNet: m.line.net,
        supplierDiscountPct: m.line.supplierDiscountPct,
        invoiceDocId: invoice.docId,
        invoiceName: invoice.fileName,
        source: 'invoice',
        ...(targetGroup.trim() ? { group: targetGroup.trim() } : {}),
      }));
    } else {
      parts = parts.map((p) => {
        if (p.id !== m.partId) return p;
        const next = { ...p, invoiceDocId: invoice.docId, invoiceName: invoice.fileName };
        if (!next.sku && m.line.sku) next.sku = m.line.sku;
        if (m.line.supplierDiscountPct) next.supplierDiscountPct = m.line.supplierDiscountPct;
        if (m.kind === 'changed') for (const df of m.diffs) next[df.field] = df.to;
        return next;
      });
    }
  }
  // Drop the starter empty row once real parts arrive.
  parts = parts.filter((p, i, arr) => !(arr.length > 1 && !p.name.trim() && !p.unitGross && !p.sku));
  return { ...d, parts };
}

// ─── Automatic paint sync ────────────────────────────────────────────────────

export type PaintCalcSnapshot = { id: string; version: number; laborCost: number; materialsCost: number };

/**
 * What to do with the claim's latest saved paint calculation when the quote opens:
 * 'apply' when the quote has none yet, 'update' when a different (newer) calculation exists
 * or its amounts differ, 'none' when they already match.
 */
export function paintSyncAction(d: Pick<QuoteData, 'paintCalcRef' | 'works'>, latest: PaintCalcSnapshot | null): 'none' | 'apply' | 'update' {
  if (!latest) return 'none';
  const ref = d.paintCalcRef;
  const hasLines = d.works.some((w) => w.source === 'paint_calc');
  if (!ref || !hasLines) return 'apply';
  if (ref.id !== latest.id && latest.version >= (ref.version || 0)) return 'update';
  if (ref.id === latest.id && (round2(ref.laborCost) !== round2(latest.laborCost) || round2(ref.materialsCost) !== round2(latest.materialsCost))) return 'update';
  return 'none';
}

// ─── Which claim an invoice belongs to ───────────────────────────────────────

const digitsOnly = (s: string) => String(s || '').replace(/\D/g, '');

export type ClaimRef = { id: string; plate: string; claimNum: string; clientName: string };

/**
 * Looks for vehicle plates / claim numbers in the invoice text. Says whether it names this claim,
 * and lists other claims it names instead, so an invoice is not synced into the wrong file.
 */
export function invoiceClaimCheck(text: string, current: ClaimRef, others: ClaimRef[]) {
  const digitText = String(text || '').replace(/[\s-]/g, '');
  const has = (v: string) => {
    const dv = digitsOnly(v);
    return dv.length >= 5 && digitText.includes(dv);
  };
  const mentionsCurrent = has(current.plate) || has(current.claimNum);
  const otherClaims = others.filter((o) => o.id !== current.id && (has(o.plate) || has(o.claimNum)));
  const status: 'match' | 'other' | 'unknown' = mentionsCurrent ? 'match' : otherClaims.length ? 'other' : 'unknown';
  return { status, otherClaims };
}

export async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
