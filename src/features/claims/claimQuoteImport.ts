/**
 * Reads a pasted quote (or text taken from a quote file) into the claim quote that already exists.
 * Paint-calculator lines are never added, edited, or duplicated.
 */
import {
  applyHourRate,
  newPartLine,
  newWorkLine,
  partPricing,
  workPricing,
  PAINT_MATERIALS_NAME,
  type DiscountType,
  type QuoteData,
  type QuotePartLine,
  type QuoteWorkLine,
} from './claimQuoteModel';

export type ImportedWork = {
  label: string;
  category: string;
  pricing: 'hours' | 'global';
  hours: number;
  price: number;
  discountType: DiscountType;
  discountValue: number;
};

export type ImportedPart = {
  name: string;
  qty: number;
  unitGross: number;
  discountType: DiscountType;
  discountValue: number;
};

export type ParsedQuoteImport = {
  hourRate: number | null;
  works: ImportedWork[];
  parts: ImportedPart[];
};

export type QuoteImportChange = {
  action: 'add' | 'update' | 'keep';
  kind: 'work' | 'part' | 'rate' | 'paint';
  label: string;
  detail: string;
};

const PAINT_LOCK = /מחשבון הצבע|עבודת צבע|חומרי צבע/;

function norm(s: string) {
  return s.replace(/[״"׳']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function amount(raw: string) {
  const cleaned = String(raw || '').replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;
  if (cleaned.includes(',') && cleaned.includes('.')) return Number(cleaned.replace(/,/g, '')) || 0;
  if (/^\d{1,3}(,\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/,/g, '')) || 0;
  return Number(cleaned.replace(/,/g, '.')) || 0;
}

function paintLocked(label: string) {
  return PAINT_LOCK.test(label);
}

function workCategory(label: string) {
  if (/צבע/.test(label)) return 'paint';
  if (/מכונ|מנוע|גיר/.test(label)) return 'mech';
  return 'body';
}

function discountOf(line: string): { discountType: DiscountType; discountValue: number } {
  const pct = line.match(/הנחה\s*([\d.,]+)\s*%/);
  if (pct) return { discountType: 'percent', discountValue: amount(pct[1]) };
  const ils = line.match(/הנחה\s*([\d][\d,.]*)\s*₪/);
  if (ils) return { discountType: 'amount', discountValue: amount(ils[1]) };
  return { discountType: 'none', discountValue: 0 };
}

function parseWork(line: string): ImportedWork | null {
  const label = line.split(/\s*[—–|]\s*/)[0].replace(/^[-•*\d.)\s]+/, '').trim();
  if (!label || /^(עבודות|חלקים)/.test(label)) return null;
  if (paintLocked(label)) return null;
  const manual = line.match(/מחיר\s*ידני\s*([\d][\d,.]*)/);
  const hours = line.match(/(\d+(?:[.,]\d+)?)\s*שעות/);
  const price = line.match(/([\d][\d,.]*)\s*₪/);
  const discount = discountOf(line);
  if (manual && !hours) {
    return { label, category: workCategory(label), pricing: 'global', hours: 0, price: amount(manual[1]), ...discount };
  }
  if (hours) {
    return { label, category: workCategory(label), pricing: 'hours', hours: amount(hours[1]), price: price ? amount(price[1]) : 0, ...discount };
  }
  if (price) {
    return { label, category: workCategory(label), pricing: 'global', hours: 0, price: amount(price[1]), ...discount };
  }
  return null;
}

function parsePart(line: string): ImportedPart | null {
  const name = line.split(/\s*[—–|]\s*/)[0].replace(/^[-•*\d.)\s]+/, '').trim();
  if (!name || paintLocked(name)) return null;
  const qty = line.match(/כמות\s*([\d.,]+)/);
  const price = line.match(/מחיר(?:\s*ליחידה)?\s*([\d][\d,.]*)/);
  if (!price) return null;
  return {
    name,
    qty: qty ? amount(qty[1]) || 1 : 1,
    unitGross: amount(price[1]),
    ...discountOf(line),
  };
}

/** Pulls the hour rate, work rows and part rows out of a pasted quote. Paint lines are left out. */
export function parseClaimQuoteText(text: string): ParsedQuoteImport {
  const rateMatch = text.match(/מחיר\s+שעת\s+עבודה\s*[:：]?\s*([\d][\d,.]*)/);
  let section: 'work' | 'part' | '' = '';
  const works: ImportedWork[] = [];
  const parts: ImportedPart[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^עבודות\s*:?\s*$/.test(line)) { section = 'work'; continue; }
    if (/^חלקים(?:\s+וחומרים)?\s*:?\s*$/.test(line)) { section = 'part'; continue; }
    if (/^מחיר\s+שעת\s+עבודה/.test(line)) continue;
    const item = line.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '');
    if (section === 'part') {
      const part = parsePart(item);
      if (part) parts.push(part);
      continue;
    }
    if (section === 'work' || /שעות|מחיר\s*ידני/.test(item)) {
      const work = parseWork(item);
      if (work) works.push(work);
    }
  }
  return { hourRate: rateMatch ? amount(rateMatch[1]) : null, works, parts };
}

function blankPart(p: QuotePartLine) {
  return !p.name.trim() && !p.unitGross && p.source !== 'paint_materials';
}

function describeWork(w: ImportedWork, rate: number) {
  const line = w.pricing === 'hours'
    ? newWorkLine(w.category, w.label, rate, { pricing: 'hours', hours: w.hours, hourRate: rate, discountType: w.discountType, discountValue: w.discountValue })
    : newWorkLine(w.category, w.label, rate, { pricing: 'global', globalPrice: w.price, discountType: w.discountType, discountValue: w.discountValue });
  const priced = workPricing(line);
  const how = w.pricing === 'hours' ? `${w.hours} שעות` : `מחיר ידני ${w.price}`;
  const disc = w.discountType === 'percent' ? `, הנחה ${w.discountValue}%` : w.discountType === 'amount' ? `, הנחה ${w.discountValue} ₪` : '';
  return `${how}${disc}, מחיר סופי ${priced.final}`;
}

function describePart(p: ImportedPart) {
  const line = newPartLine({ name: p.name, qty: p.qty, unitGross: p.unitGross, discountType: p.discountType, discountValue: p.discountValue });
  return `כמות ${p.qty}, מחיר ${p.unitGross}, סופי ${partPricing(line).final}`;
}

/**
 * Adds new rows and updates a row that already has the same name.
 * Other rows stay. Paint-calculator work and paint materials are not written.
 */
export function mergeClaimQuoteImport(data: QuoteData, parsed: ParsedQuoteImport): { next: QuoteData; changes: QuoteImportChange[] } {
  const changes: QuoteImportChange[] = [];
  let next: QuoteData = {
    ...data,
    works: data.works.map((w) => ({ ...w })),
    parts: data.parts.map((p) => ({ ...p })),
  };
  if (parsed.hourRate != null && parsed.hourRate !== next.hourRate) {
    changes.push({ action: 'update', kind: 'rate', label: 'מחיר שעת עבודה', detail: `${next.hourRate} ← ${parsed.hourRate}. לא חל על מחשבון הצבע` });
    next = applyHourRate(next, parsed.hourRate);
  }
  const rate = next.hourRate;
  const works = [...next.works];
  for (const item of parsed.works) {
    if (paintLocked(item.label)) {
      changes.push({ action: 'keep', kind: 'paint', label: item.label, detail: 'לא נוסף. מחיר הצבע נשאר ממחשבון הצבע' });
      continue;
    }
    const hit = works.find((w) => w.source !== 'paint_calc' && norm(w.label) === norm(item.label));
    const detail = describeWork(item, rate);
    if (hit) {
      hit.label = item.label;
      hit.category = item.category;
      hit.pricing = item.pricing;
      hit.hours = item.pricing === 'hours' ? item.hours : 0;
      hit.hourRate = rate;
      hit.globalPrice = item.pricing === 'global' ? item.price : 0;
      hit.discountType = item.discountType;
      hit.discountValue = item.discountValue;
      hit.source = 'manual';
      changes.push({ action: 'update', kind: 'work', label: item.label, detail });
    } else {
      works.push(item.pricing === 'hours'
        ? newWorkLine(item.category, item.label, rate, { pricing: 'hours', hours: item.hours, hourRate: rate, discountType: item.discountType, discountValue: item.discountValue, source: 'manual' })
        : newWorkLine(item.category, item.label, rate, { pricing: 'global', globalPrice: item.price, hours: 0, discountType: item.discountType, discountValue: item.discountValue, source: 'manual' }));
      changes.push({ action: 'add', kind: 'work', label: item.label, detail });
    }
  }
  const parts = [...next.parts];
  for (const item of parsed.parts) {
    if (paintLocked(item.name) || norm(item.name) === norm(PAINT_MATERIALS_NAME)) {
      changes.push({ action: 'keep', kind: 'paint', label: item.name, detail: 'לא נוסף. חומרי הצבע נשארים ממחשבון הצבע' });
      continue;
    }
    const hit = parts.find((p) => p.source !== 'paint_materials' && norm(p.name) === norm(item.name));
    const detail = describePart(item);
    if (hit) {
      hit.name = item.name;
      hit.qty = item.qty;
      hit.unitGross = item.unitGross;
      hit.discountType = item.discountType;
      hit.discountValue = item.discountValue;
      hit.included = true;
      hit.source = hit.source === 'invoice' ? 'invoice' : 'manual';
      changes.push({ action: 'update', kind: 'part', label: item.name, detail });
    } else {
      parts.push(newPartLine({
        name: item.name,
        qty: item.qty,
        unitGross: item.unitGross,
        discountType: item.discountType,
        discountValue: item.discountValue,
        included: true,
        source: 'manual',
      }));
      changes.push({ action: 'add', kind: 'part', label: item.name, detail });
    }
  }
  for (const w of works) {
    if (w.source === 'paint_calc') changes.push({ action: 'keep', kind: 'paint', label: w.label, detail: `נשאר ${w.globalPrice} ממחשבון הצבע` });
  }
  for (const p of parts) {
    if (p.source === 'paint_materials') changes.push({ action: 'keep', kind: 'paint', label: p.name, detail: `נשאר ${p.unitGross} ממחשבון הצבע` });
  }
  const addedPart = parsed.parts.some((p) => !paintLocked(p.name));
  next = { ...next, works, parts: addedPart ? parts.filter((p) => !blankPart(p)) : parts };
  return { next, changes };
}

export function quoteImportHasLines(parsed: ParsedQuoteImport) {
  return parsed.works.length > 0 || parsed.parts.length > 0;
}

/** Preview card for the claim chat. Nothing is saved until the worker confirms it. */
export function buildClaimQuoteImportPreview(text: string, claimId: string) {
  const parsed = parseClaimQuoteText(text);
  if (!quoteImportHasLines(parsed)) return null;
  const lines = [
    parsed.hourRate != null ? `מחיר שעת עבודה: ${parsed.hourRate} ₪` : '',
    ...parsed.works.map((w) => `עבודה: ${w.label} — ${w.pricing === 'hours' ? `${w.hours} שעות` : `מחיר ידני ${w.price} ₪`}${w.discountType === 'percent' ? `, הנחה ${w.discountValue}%` : w.discountType === 'amount' ? `, הנחה ${w.discountValue} ₪` : ''}`),
    ...parsed.parts.map((p) => `חלק: ${p.name} — כמות ${p.qty}, מחיר ${p.unitGross} ₪`),
  ].filter(Boolean);
  return {
    preview_id: `cqimp_${Date.now().toString(36)}`,
    summary: 'עדכון הצעת המחיר בתיק. לא נשמר עד לאישור. מחשבון הצבע לא ישתנה.',
    tool_name: 'preview_import_claim_quote',
    action_type: 'import_claim_quote',
    status: 'pending' as const,
    parameters: { claim_id: claimId, parsed, lines },
  };
}

export type QuoteFileRead = { text: string; error: string };

async function inflateRaw(data: Uint8Array) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function zipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Array<{ name: string; data: Uint8Array; method: number }> = [];
  let offset = 0;
  while (offset + 30 < bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    out.push({ name, method, data: bytes.subarray(dataStart, dataStart + compSize) });
    offset = dataStart + compSize;
  }
  return out;
}

function xmlText(xml: string) {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

/** Text of a PDF, a Word file, or an image. An empty text comes with the real reason, never a success. */
export async function readQuoteFile(file: { name: string; type: string; bytes: Uint8Array }): Promise<QuoteFileRead> {
  const name = file.name || 'קובץ';
  const mime = file.type || '';
  try {
    if (/\.docx$/i.test(name) || /wordprocessingml/i.test(mime)) {
      const entries = zipEntries(file.bytes);
      const doc = entries.find((e) => e.name === 'word/document.xml');
      if (!doc) return { text: '', error: `${name}: קובץ Word בלי word/document.xml` };
      const xmlBytes = doc.method === 0 ? doc.data : doc.method === 8 ? await inflateRaw(doc.data) : null;
      if (!xmlBytes) return { text: '', error: `${name}: דחיסת Word ${doc.method} אינה נתמכת` };
      const text = xmlText(new TextDecoder().decode(xmlBytes)).trim();
      if (!text) return { text: '', error: `${name}: מסמך Word נפתח אבל אין בו טקסט` };
      return { text, error: '' };
    }
    if (/pdf/i.test(mime) || /\.pdf$/i.test(name) || /image\/(jpeg|png|webp)/i.test(mime) || /\.(jpe?g|png|webp)$/i.test(name)) {
      const { extractClaimDocumentText } = await import('./claimDocumentRead');
      const found = await extractClaimDocumentText({ bytes: file.bytes, mimeType: mime, fileName: name });
      if (!found.text.trim()) {
        const why = found.source === 'none'
          ? 'לא נמצא טקסט בקובץ ולא התקבל זיהוי תווים'
          : `זיהוי התווים החזיר טקסט ריק (מקור ${found.source}, ביטחון ${found.confidence})`;
        return { text: '', error: `${name}: ${why}` };
      }
      return { text: found.text, error: '' };
    }
    return { text: '', error: `${name}: סוג הקובץ אינו נתמך לקריאה להצעת מחיר (${mime || 'ללא סוג'})` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { text: '', error: `${name}: ${message}` };
  }
}

export async function readQuoteSources(pasted: string, files: File[]) {
  const chunks = [pasted];
  const errors: string[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const read = await readQuoteFile({ name: file.name, type: file.type, bytes });
    if (read.error) errors.push(read.error);
    if (read.text.trim()) chunks.push(read.text);
  }
  return { text: chunks.filter(Boolean).join('\n'), errors };
}
