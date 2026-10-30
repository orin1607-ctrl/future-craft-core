/**
 * Entering a garage quote from the claims chat into the claim's quote calculator (claim_quotes).
 * Pure functions; no I/O.
 *
 * The model reads the quote (text, image or PDF) and proposes work and part lines. The server keeps a line
 * only when its numbers and most of its words are written in the quote text, maps it to the calculator's own
 * categories (src/features/claims/claimQuoteModel.ts), and never writes paint lines: paint labour and paint
 * materials come only from the paint calculator, so they are never charged twice.
 */
import { normalizeWords } from './claimDocFill.ts';

/** Category keys of the quote calculator (CORE_CATEGORIES + EXTRA_CATEGORIES in claimQuoteModel.ts). */
export const QUOTE_CATEGORY_LABELS: Record<string, string> = {
  body: 'עבודות פחחות',
  paint: 'עבודות צבע',
  mech: 'עבודות מכונאות',
  electric: 'עבודות חשמל',
  ac: 'עבודות מיזוג אוויר / מזגן',
  sealing: 'עבודות איטום',
  upholstery: 'עבודות ריפוד',
  ev: 'עבודות לרכב חשמלי או היברידי',
  disconnect: 'ניתוק מערכת החשמל ברכב',
  calibration: 'כיול מחשב רכב',
  transport: 'שינוע רכב',
  alignment: 'כיוון פרונט',
  tire_repair: 'עבודת פנצ׳רמאכר',
  rim: 'החלפת ג׳אנט',
  tire: 'החלפת צמיג',
  other: 'עבודות נוספות',
};
export const CUSTOM_PREFIX = 'custom:';
export const DEFAULT_HOUR_RATE = 380;

/** Section names as quotes write them → calculator category. Checked in order; the first match wins. */
const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/כיול|אבחון|דיאגנוסט|calibrat/i, 'calibration'],
  [/מתח\s*גבוה|\bHV\b|רכב\s*חשמלי|היברידי|hybrid/i, 'ev'],
  [/ניתוק/, 'disconnect'],
  [/חשמל|electric/i, 'electric'],
  [/מיזוג|מזגן/, 'ac'],
  [/איטום/, 'sealing'],
  [/ריפוד/, 'upholstery'],
  [/שינוע|גרירה/, 'transport'],
  [/פרונט|alignment/i, 'alignment'],
  [/פנצ/, 'tire_repair'],
  [/ג['׳]?אנט/, 'rim'],
  [/צמיג/, 'tire'],
  [/מכונא|mechan/i, 'mech'],
  [/פחח|body/i, 'body'],
  [/צבע|paint/i, 'paint'],
];

/** A calculator category for a section name; an unknown name becomes the user's own work area. */
export function resolveQuoteCategory(section: string) {
  const raw = String(section || '').replace(/^\s*\d+[.)]\s*/, '').trim();
  if (QUOTE_CATEGORY_LABELS[raw]) return raw;
  if (raw.startsWith(CUSTOM_PREFIX)) return raw;
  for (const [re, key] of CATEGORY_RULES) if (re.test(raw)) return key;
  const label = raw.replace(/^עבודות\s+/, '').trim();
  return label ? `${CUSTOM_PREFIX}${label}` : 'other';
}

export function quoteCategoryLabel(key: string) {
  return key.startsWith(CUSTOM_PREFIX) ? key.slice(CUSTOM_PREFIX.length) : (QUOTE_CATEGORY_LABELS[key] || key);
}

/** Part kinds as quotes write them → PART_TYPES keys of the calculator; unknown stays empty (not decided). */
export function resolvePartType(kind: string) {
  const k = String(kind || '').trim();
  if (!k || /טרם|לא\s*ידוע|לא\s*נקבע/.test(k)) return '';
  if (/חומר|עזר/.test(k)) return 'material';
  if (/משופץ|שיפוץ/.test(k)) return 'refurbished';
  if (/משומש|used/i.test(k)) return 'used';
  if (/חליפ|aftermarket/i.test(k)) return 'new_aftermarket';
  if (/מקורי|original|oem/i.test(k)) return 'new_original';
  return '';
}

const PART_TYPE_LABELS: Record<string, string> = {
  new_original: 'חדש מקורי', new_aftermarket: 'חדש חליפי', used: 'משומש', refurbished: 'משופץ', material: 'חומרים', '': 'טרם נקבע',
};

export type EntryWorkIn = {
  section?: string; label?: string; hours?: unknown; price?: unknown; quantity?: unknown; unit_price?: unknown; note?: string;
};
export type EntryPartIn = { name?: string; type?: string; qty?: unknown; price?: unknown; note?: string };

export type EntryWork = {
  category: string; label: string; pricing: 'hours' | 'global'; hours: number; price: number; note: string;
};
export type EntryPart = { name: string; partType: string; qty: number; price: number; description: string };

export type QuoteEntryPlan = {
  hourRate: number;
  works: EntryWork[];
  parts: EntryPart[];
  /** Paint lines the quote lists — left to the paint calculator. */
  paintLeftToCalculator: string[];
  rejected: string[];
  warnings: string[];
  checks: string[];
};

/** "1,250" → 1250, "1.5" / "1,5" → 1.5. Not a number → NaN. */
export function quoteNumber(raw: unknown) {
  if (typeof raw === 'number') return raw;
  const s = String(raw ?? '').replace(/[₪\s]/g, '');
  if (!s) return NaN;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''));
  return Number(s.replace(',', '.'));
}

/** Every number written in the text, as canonical strings ("1,250" and "1250" are the same number). */
function numbersIn(text: string) {
  const out = new Set<string>();
  for (const m of String(text || '').matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g)) {
    const n = quoteNumber(m[0]);
    if (Number.isFinite(n)) out.add(String(n));
  }
  return out;
}

const STOP = new Set(['של', 'את', 'על', 'עם', 'כולל', 'ו', 'או', 'גם', 'לפי', 'בהתאם', 'the', 'and']);
function significantWords(s: string) {
  return normalizeWords(s).split(' ').filter((w) => w.length >= 2 && !STOP.has(w));
}

/** Share of the words of a line that are written in a text (Hebrew prefixes ו/ה/ב/ל/מ/ש allowed). */
function wordShare(label: string, textWords: Set<string>) {
  const words = significantWords(label);
  if (!words.length) return 0;
  const has = (w: string) => textWords.has(w) || (w.length > 3 && /^[והבלמש]/.test(w) && textWords.has(w.slice(1)))
    || [...'והבלמש'].some((p) => textWords.has(p + w));
  return words.filter(has).length / words.length;
}

/**
 * Where a line is written in the quote: the source lines that carry most of its words (or of its section
 * name), each with the few lines after it, where quotes put "מחיר גלובלי: …" or "זמן עבודה: …".
 * A line's numbers must be written there — not just anywhere in the quote.
 */
function lineWindows(sourceLines: string[], ...labels: string[]) {
  const ITEM_START = /^\s*\d+\s*[.)|]/;
  const body = (line: string) => line.replace(/^\s*\d+\s*[.)|]\s*/, '');
  for (const label of labels.filter(Boolean)) {
    const shares = sourceLines.map((line) => wordShare(label, new Set(normalizeWords(line).split(' '))));
    const best = Math.max(0, ...shares);
    if (best < 0.6) continue;
    const windows: string[] = [];
    shares.forEach((share, i) => {
      if (share !== best) return;
      const win = [body(sourceLines[i])];
      // The lines that belong to the same item, up to the next numbered item (at most 4).
      for (let j = i + 1; j < sourceLines.length && j <= i + 4 && !ITEM_START.test(sourceLines[j]); j++) win.push(sourceLines[j]);
      windows.push(win.join('\n'));
    });
    return windows;
  }
  return [];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function planQuoteEntry(
  input: { works?: EntryWorkIn[]; parts?: EntryPartIn[] },
  sourceText: string,
  hourRate = DEFAULT_HOUR_RATE,
): QuoteEntryPlan {
  const plan: QuoteEntryPlan = { hourRate, works: [], parts: [], paintLeftToCalculator: [], rejected: [], warnings: [], checks: [] };
  const words = new Set(normalizeWords(sourceText).split(' '));
  const sourceLines = String(sourceText || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const wordsInSource = (label: string) => wordShare(label, words) >= 0.6;
  const seenWork = new Set<string>();

  for (const w of input.works || []) {
    const label = String(w?.label || '').replace(/\s+/g, ' ').trim();
    if (!label) continue;
    const category = resolveQuoteCategory(String(w.section || ''));
    if (category === 'paint' || /^עבוד(ת|ות)\s*צבע|חומרי\s*צבע/.test(label)) {
      plan.paintLeftToCalculator.push(label);
      continue;
    }
    if (!wordsInSource(label)) {
      plan.rejected.push(`${label}: לא נמצא בטקסט ההצעה — לא ייקלט`);
      continue;
    }
    const near = numbersIn(lineWindows(sourceLines, label, String(w.section || '')).join('\n'));
    const numInSource = (n: number) => near.has(String(n));
    const hours = quoteNumber(w.hours);
    let price = quoteNumber(w.price);
    const qty = quoteNumber(w.quantity);
    const unit = quoteNumber(w.unit_price);
    let note = String(w.note || '').trim();
    if (!(price > 0) && qty > 0 && unit > 0) {
      if (!numInSource(qty) || !numInSource(unit)) {
        plan.rejected.push(`${label}: הכמות או המחיר ליחידה לא מופיעים בהצעה — לא ייקלט`);
        continue;
      }
      price = round2(qty * unit);
      note = note || `${qty} × ${unit} ₪`;
    } else if (price > 0 && !numInSource(price)) {
      plan.rejected.push(`${label}: המחיר ${price} ₪ לא מופיע בהצעה — לא ייקלט`);
      continue;
    }
    if (hours > 0 && !numInSource(hours)) {
      plan.rejected.push(`${label}: ${hours} שעות לא מופיעות בהצעה — לא ייקלט`);
      continue;
    }
    if (!(price > 0) && !(hours > 0)) {
      plan.rejected.push(`${label}: אין בהצעה שעות או מחיר לסעיף — לא ייקלט`);
      continue;
    }
    const key = `${category}|${normalizeWords(label)}`;
    if (seenWork.has(key)) { plan.warnings.push(`${label}: הופיע פעמיים — נקלט פעם אחת`); continue; }
    seenWork.add(key);
    // A stated amount is a global price, never multiplied by hours; the hours stay on the line for reference.
    if (price > 0) {
      plan.works.push({ category, label, pricing: 'global', hours: hours > 0 ? hours : 0, price, note: note || (hours > 0 ? `${hours} שעות` : '') });
    } else {
      plan.works.push({ category, label, pricing: 'hours', hours, price: 0, note });
    }
  }

  const seenPart = new Set<string>();
  for (const p of input.parts || []) {
    const name = String(p?.name || '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    if (/חומרי\s*צבע/.test(name)) { plan.paintLeftToCalculator.push(name); continue; }
    if (!wordsInSource(name)) { plan.rejected.push(`${name}: לא נמצא בטקסט ההצעה — לא ייקלט`); continue; }
    const price = quoteNumber(p.price);
    if (price > 0 && !numbersIn(lineWindows(sourceLines, name).join('\n')).has(String(price))) { plan.rejected.push(`${name}: המחיר ${price} ₪ לא מופיע בהצעה — לא ייקלט`); continue; }
    const qty = quoteNumber(p.qty);
    const key = normalizeWords(name);
    if (seenPart.has(key)) { plan.warnings.push(`${name}: הופיע פעמיים — נקלט פעם אחת`); continue; }
    seenPart.add(key);
    const kind = String(p.type || '').trim();
    const partType = resolvePartType(kind);
    const description = [kind && !PART_TYPE_LABELS[partType]?.includes(kind) ? `סוג בהצעה: ${kind}` : '', String(p.note || '').trim()]
      .filter(Boolean).join(' · ');
    plan.parts.push({ name, partType, qty: qty > 0 ? qty : 1, price: price > 0 ? price : 0, description });
  }

  const unpriced = plan.parts.filter((p) => !p.price).length;
  if (unpriced) plan.warnings.push(`${unpriced} חלקים נקלטו ללא מחיר (להשלמה בהמשך)`);
  const untyped = plan.parts.filter((p) => !p.partType).length;
  if (untyped) plan.warnings.push(`${untyped} חלקים ללא סוג (טרם נקבע)`);
  plan.checks.push(...crossChecks(sourceText, plan));
  return plan;
}

/** Totals written in the quote ("סה״כ עבודות פחחות: 15.5 שעות") compared with the lines that were read. */
function crossChecks(sourceText: string, plan: QuoteEntryPlan) {
  const out: string[] = [];
  const hoursOf = (cat?: string) => round2(plan.works.filter((w) => !cat || w.category === cat).reduce((s, w) => s + w.hours, 0));
  const verdict = (label: string, written: number, read: number, unit: string) =>
    `${read === written ? '✓' : '⚠️'} ${label}: בהצעה ${written.toLocaleString('he-IL')} ${unit}, נקלטו ${read.toLocaleString('he-IL')} ${unit}`;
  for (const line of String(sourceText || '').split('\n')) {
    const m = line.match(/סה["״׳']?כ\s+([^:\n]+?)\s*:\s*([\d.,]+)\s*שעות/);
    if (!m) continue;
    const written = quoteNumber(m[2]);
    if (!Number.isFinite(written)) continue;
    if (/שעות\s*עבודה|שנרשמו|כל/.test(m[1])) out.push(verdict('סה״כ שעות', written, hoursOf(), 'שעות'));
    else {
      const cat = resolveQuoteCategory(m[1]);
      if (cat !== 'paint') out.push(verdict(m[1].trim(), written, hoursOf(cat), 'שעות'));
    }
  }
  const money = String(sourceText || '').match(/סה["״׳']?כ\s+חיובים[^:\n]*:\s*([\d.,]+)/);
  if (money) {
    const written = quoteNumber(money[1]);
    const read = round2(plan.works.reduce((s, w) => s + w.price, 0) + plan.parts.reduce((s, p) => s + p.price * p.qty, 0));
    if (Number.isFinite(written)) out.push(verdict('סכומים ידועים', written, read, '₪'));
  }
  return out;
}

const ils = (n: number) => `${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })} ₪`;

/** Amount of a line as the calculator computes it (workOriginal in claimQuoteModel.ts). */
export function entryWorkAmount(w: EntryWork, hourRate: number) {
  return round2(w.pricing === 'global' ? w.price : w.hours * hourRate);
}

/** The approval card text. */
export function describeQuoteEntry(
  claim: { id: string; clientName: string; plate: string },
  plan: QuoteEntryPlan,
  meta: { quoteNo: number; existingQuotes: number },
) {
  const out: string[] = [
    `הזנת הצעת מחיר למחשבון — תיק ${claim.id}${claim.clientName ? ` · ${claim.clientName}` : ''}${claim.plate ? ` · רכב ${claim.plate}` : ''}`,
    `תיווצר הצעת מחיר חדשה מס׳ ${meta.quoteNo} (טיוטה).${meta.existingQuotes ? ` ${meta.existingQuotes} הצעות קיימות בתיק לא ישתנו.` : ''}`,
    `מחיר שעת עבודה: ${ils(plan.hourRate)} (התעריף של התיק במחשבון)`,
  ];
  const cats = [...new Set(plan.works.map((w) => w.category))];
  for (const cat of cats) {
    const lines = plan.works.filter((w) => w.category === cat);
    const sum = lines.reduce((s, w) => s + entryWorkAmount(w, plan.hourRate), 0);
    out.push('', `${quoteCategoryLabel(cat)} — ${ils(sum)}`);
    for (const w of lines) {
      const how = w.pricing === 'global' ? `מחיר גלובלי ${ils(w.price)}${w.note ? ` (${w.note})` : ''}` : `${w.hours} שעות × ${ils(plan.hourRate)} = ${ils(entryWorkAmount(w, plan.hourRate))}`;
      out.push(`• ${w.label} — ${how}`);
    }
  }
  out.push('', plan.paintLeftToCalculator.length || /צבע/.test(cats.join(''))
    ? 'עבודות צבע וחומרי צבע — לא הוזנו ידנית. יחושבו רק במחשבון הצבע הקיים (פעם אחת, בלי כפילות).'
    : 'עבודות צבע — לא הופיעו בהצעה.');
  if (plan.parts.length) {
    out.push('', `חלקי חילוף (${plan.parts.length}):`);
    plan.parts.forEach((p, i) => out.push(`${i + 1}. ${p.name} — ${PART_TYPE_LABELS[p.partType] ?? 'טרם נקבע'}${p.qty !== 1 ? ` · כמות ${p.qty}` : ''} · ${p.price ? ils(p.price) : 'מחיר להשלמה'}${p.description ? ` · ${p.description}` : ''}`));
  }
  const totalWorks = plan.works.reduce((s, w) => s + entryWorkAmount(w, plan.hourRate), 0);
  const totalParts = plan.parts.reduce((s, p) => s + p.price * p.qty, 0);
  out.push('', `סה״כ לפני מע״מ (ללא צבע וללא חלקים שמחירם להשלמה): ${ils(round2(totalWorks + totalParts))}`);
  if (plan.checks.length) out.push('', 'בדיקה מול הסיכומים שבהצעה:', ...plan.checks.map((c) => `• ${c}`));
  if (plan.warnings.length) out.push('', 'לתשומת לב:', ...plan.warnings.map((w) => `• ${w}`));
  if (plan.rejected.length) out.push('', 'לא נקלט:', ...plan.rejected.map((r) => `• ${r}`));
  out.push('', 'שום דבר לא נשמר עד שתלחץ "אישור".');
  return out.join('\n');
}
