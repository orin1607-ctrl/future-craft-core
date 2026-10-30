/**
 * claimQuotePdf.ts
 * Hebrew RTL PDF for a claim quote. Canvas → JPEG → PDF, same technique and helpers as garageQuoteDoc.ts.
 * Customer-facing: gross prices and customer discounts only. Supplier net prices, supplier discounts,
 * internal notes and parts marked "not included" are never drawn.
 */
import {
  DEFAULT_YONI_LOGO_SVG,
  canvasToJpegBytes,
  drawRoundedRect,
  loadImageSafe,
  readyHebrewFont,
  resolveShopBranding,
  wrapJpegsAsPdf,
  wrapTextLines,
  type GarageShopBranding,
  type PdfPage,
} from '@/modules/garage-management/garageQuoteDoc';
import {
  ALL_CATEGORIES,
  categoryLabel,
  computeTotals,
  formatIls,
  partGroupOf,
  partGroupsOf,
  partPricing,
  partTypeLabel,
  workGroupsOf,
  workPricing,
  type QuoteData,
  type QuoteWorkLine,
} from './claimQuoteModel';

const PAGE_W = 794;
const PAGE_H = 1123;
const SCALE = 2;
const MARGIN = 36;
const FONT = 'Heebo, "Arial Hebrew", "Noto Sans Hebrew", Arial, sans-serif';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const ACCENT = '#0369a1';
const ROW_H = 22;
const FOOTER_H = 40;

export type QuotePdfMeta = { quoteNo: number; version: number; date: Date; branding?: Partial<GarageShopBranding> | null };

type Col = { title: string; w: number; align?: 'right' | 'left' | 'center' };

class Pager {
  pages: HTMLCanvasElement[] = [];
  ctx!: CanvasRenderingContext2D;
  y = 0;
  constructor(private onNewPage: (p: Pager, first: boolean) => void) {
    this.add(true);
  }
  add(first = false) {
    const c = document.createElement('canvas');
    c.width = PAGE_W * SCALE;
    c.height = PAGE_H * SCALE;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('הדפדפן אינו תומך ביצירת PDF');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.direction = 'rtl';
    ctx.textBaseline = 'middle';
    this.pages.push(c);
    this.ctx = ctx;
    this.y = MARGIN;
    this.onNewPage(this, first);
  }
  need(h: number) {
    if (this.y + h > PAGE_H - MARGIN - FOOTER_H) this.add();
  }
}

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, opts: { size?: number; weight?: number; color?: string; align?: CanvasTextAlign } = {}) {
  ctx.font = `${opts.weight || 500} ${opts.size || 11}px ${FONT}`;
  ctx.fillStyle = opts.color || INK;
  ctx.textAlign = opts.align || 'right';
  ctx.fillText(s, x, y);
}

function fit(ctx: CanvasRenderingContext2D, s: string, maxW: number) {
  if (ctx.measureText(s).width <= maxW) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) out = out.slice(0, -1);
  return `${out}…`;
}

/** Draws a table: header + rows, splitting across pages. Columns are laid out right → left. */
function table(p: Pager, cols: Col[], rows: string[][], opts: { boldLast?: boolean } = {}) {
  const right = PAGE_W - MARGIN;
  const width = PAGE_W - MARGIN * 2;
  const header = () => {
    p.need(ROW_H * 2);
    drawRoundedRect(p.ctx, MARGIN, p.y, width, ROW_H, 4, '#f1f5f9');
    let x = right;
    for (const c of cols) {
      const pad = 6;
      const ax = c.align === 'left' ? x - c.w + pad : c.align === 'center' ? x - c.w / 2 : x - pad;
      text(p.ctx, c.title, ax, p.y + ROW_H / 2, { size: 10, weight: 700, color: MUTED, align: c.align || 'right' });
      x -= c.w;
    }
    p.y += ROW_H;
  };
  header();
  rows.forEach((r, ri) => {
    if (p.y + ROW_H > PAGE_H - MARGIN - FOOTER_H) {
      p.add();
      header();
    }
    let x = right;
    cols.forEach((c, i) => {
      const pad = 6;
      p.ctx.font = `${opts.boldLast && i === cols.length - 1 ? 700 : 500} 10.5px ${FONT}`;
      const s = fit(p.ctx, r[i] || '', c.w - pad * 2);
      const ax = c.align === 'left' ? x - c.w + pad : c.align === 'center' ? x - c.w / 2 : x - pad;
      text(p.ctx, s, ax, p.y + ROW_H / 2, { size: 10.5, weight: opts.boldLast && i === cols.length - 1 ? 700 : 500, align: c.align || 'right' });
      x -= c.w;
    });
    p.ctx.strokeStyle = LINE;
    p.ctx.lineWidth = 0.6;
    p.ctx.beginPath();
    p.ctx.moveTo(MARGIN, p.y + ROW_H);
    p.ctx.lineTo(right, p.y + ROW_H);
    p.ctx.stroke();
    p.y += ROW_H;
    if (ri === rows.length - 1) p.y += 6;
  });
}

function sectionTitle(p: Pager, title: string, sum?: string) {
  p.need(ROW_H * 3);
  p.y += 6;
  text(p.ctx, title, PAGE_W - MARGIN, p.y + 9, { size: 13.5, weight: 800, color: ACCENT });
  if (sum) text(p.ctx, sum, MARGIN, p.y + 9, { size: 11.5, weight: 700, align: 'left' });
  p.y += 24;
}

function subTitle(p: Pager, title: string, sum: string) {
  p.need(ROW_H * 2);
  text(p.ctx, `› ${title}`, PAGE_W - MARGIN - 4, p.y + 8, { size: 11.5, weight: 800, color: INK });
  text(p.ctx, sum, MARGIN + 4, p.y + 8, { size: 10.5, weight: 700, color: MUTED, align: 'left' });
  p.y += 18;
}

function workPriceDesc(w: QuoteWorkLine) {
  if (w.pricing === 'global') return 'מחיר גלובלי';
  return `${Number(w.hours || 0).toLocaleString('he-IL')} ש׳ × ${formatIls(w.hourRate)}`;
}

function discountDesc(type: string, value: number, amount: number) {
  if (!amount) return '—';
  return type === 'percent' ? `${value}% (${formatIls(amount)})` : formatIls(amount);
}

export async function renderClaimQuoteCanvases(d: QuoteData, meta: QuotePdfMeta): Promise<HTMLCanvasElement[]> {
  await readyHebrewFont();
  const branding = resolveShopBranding(meta.branding || undefined);
  // The built-in SVG logo is text drawn without the Hebrew font inside a canvas; the header already prints the shop name.
  const logo = branding.logo_url && branding.logo_url !== DEFAULT_YONI_LOGO_SVG ? await loadImageSafe(branding.logo_url) : null;
  const totals = computeTotals(d);
  const right = PAGE_W - MARGIN;
  const width = PAGE_W - MARGIN * 2;
  const dateStr = meta.date.toLocaleDateString('he-IL');

  const p = new Pager((pg, first) => {
    const ctx = pg.ctx;
    if (first) {
      drawRoundedRect(ctx, MARGIN, pg.y, width, 84, 10, INK);
      if (logo) {
        const h = 60;
        const w = Math.min(180, (logo.width / logo.height) * h || h);
        ctx.drawImage(logo, MARGIN + 14, pg.y + 12, w, h);
      }
      text(ctx, branding.shop_title, right - 16, pg.y + 26, { size: 19, weight: 900, color: '#ffffff' });
      text(ctx, branding.subtitle, right - 16, pg.y + 50, { size: 11.5, weight: 600, color: '#7dd3fc' });
      const contact = [branding.phone, branding.email, branding.address, branding.business_id ? `ע.מ ${branding.business_id}` : ''].filter(Boolean).join(' · ');
      if (contact) text(ctx, contact, right - 16, pg.y + 70, { size: 9.5, color: '#cbd5e1' });
      pg.y += 98;
      text(ctx, `הצעת מחיר מס׳ ${meta.quoteNo}`, right, pg.y + 12, { size: 20, weight: 900 });
      text(ctx, `תאריך: ${dateStr} · גרסה ${meta.version}`, MARGIN, pg.y + 12, { size: 11, color: MUTED, align: 'left' });
      pg.y += 32;
    } else {
      text(ctx, `${branding.shop_title} · הצעת מחיר מס׳ ${meta.quoteNo} (המשך)`, right, pg.y + 10, { size: 11, weight: 700, color: MUTED });
      pg.y += 28;
    }
  });

  // Customer & vehicle
  const c = d.claim;
  const info: Array<[string, string]> = [
    ['שם הלקוח', c.clientName],
    ['מספר רישוי', c.plate],
    ['יצרן', c.carMake],
    ['דגם', c.carModel],
    ['מספר תביעה', c.claimNum],
    ['חברת ביטוח', c.insCompany],
  ];
  const boxH = 3 * 22 + 16;
  drawRoundedRect(p.ctx, MARGIN, p.y, width, boxH, 8, '#f8fafc', LINE);
  info.forEach(([k, v], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = right - 14 - col * (width / 2);
    const y = p.y + 19 + row * 22;
    text(p.ctx, `${k}:`, x, y, { size: 10.5, weight: 700, color: MUTED });
    p.ctx.font = `700 10.5px ${FONT}`;
    const kw = p.ctx.measureText(`${k}: `).width;
    text(p.ctx, v || '—', x - kw - 4, y, { size: 11, weight: 700 });
  });
  p.y += boxH + 10;

  // Works, per category in the fixed order
  const workCols: Col[] = [
    { title: 'תיאור העבודה', w: 300 },
    { title: 'תמחור', w: 120 },
    { title: 'מחיר', w: 90, align: 'left' },
    { title: 'הנחה', w: 95, align: 'left' },
    { title: 'סה״כ', w: width - 605, align: 'left' },
  ];
  const workRows = (lines: QuoteWorkLine[]) => lines.map((w) => {
    const pr = workPricing(w);
    return [w.label || '—', workPriceDesc(w), formatIls(pr.original), discountDesc(w.discountType, w.discountValue, pr.discount), formatIls(pr.final)];
  });
  // Fixed areas in their order, then areas the user added; inside an area, its categories.
  const usedKeys = [...new Set(d.works.map((w) => w.category))];
  const areaKeys = [...ALL_CATEGORIES.map((c) => c.key).filter((k) => usedKeys.includes(k)), ...usedKeys.filter((k) => !ALL_CATEGORIES.some((c) => c.key === k))];
  for (const key of areaKeys) {
    const lines = d.works.filter((w) => w.category === key && (w.label.trim() || workPricing(w).original));
    if (!lines.length) continue;
    const sum = lines.reduce((s2, w) => s2 + workPricing(w).final, 0);
    sectionTitle(p, categoryLabel(key), formatIls(sum));
    const groups = workGroupsOf(d, key).filter((g) => lines.some((w) => (w.group || '').trim() === g));
    for (const g of groups) {
      const gl = lines.filter((w) => (w.group || '').trim() === g);
      if (groups.length > 1 || g) subTitle(p, g || 'כללי', formatIls(gl.reduce((s2, w) => s2 + workPricing(w).final, 0)));
      table(p, workCols, workRows(gl), { boldLast: true });
    }
  }

  // Parts and materials (included only, gross prices only)
  const included = d.parts.filter((x) => x.included && (x.name.trim() || x.unitGross));
  const partCols: Col[] = [
    { title: 'שם הפריט', w: 190 },
    { title: 'סוג', w: 80 },
    { title: 'מק״ט', w: 100 },
    { title: 'כמות', w: 45, align: 'center' },
    { title: 'מחיר ליח׳', w: 85, align: 'left' },
    { title: 'הנחה', w: 95, align: 'left' },
    { title: 'סה״כ', w: width - 595, align: 'left' },
  ];
  // Parts categories in order, חומרים last; the description is printed after the name.
  for (const g of partGroupsOf(d)) {
    const gl = included.filter((x) => partGroupOf(x) === g);
    if (!gl.length) continue;
    sectionTitle(p, g, formatIls(gl.reduce((s2, x) => s2 + partPricing(x).final, 0)));
    table(p, partCols, gl.map((x) => {
      const pr = partPricing(x);
      const name = [x.name || '—', (x.description || '').trim()].filter(Boolean).join(' – ');
      return [name, partTypeLabel(x.partType), x.sku || '—', String(x.qty), formatIls(x.unitGross), discountDesc(x.discountType, x.discountValue, pr.discount), formatIls(pr.final)];
    }), { boldLast: true });
  }

  // Summary
  const sumRows: Array<[string, number, boolean?]> = [
    ['סה״כ עבודות פחחות', totals.body],
    ['סה״כ עבודות צבע', totals.paint],
    ['סה״כ עבודות מכונאות', totals.mech],
    ['סה״כ עבודות נוספות', totals.extras],
    ['סה״כ חלקים וחומרים', totals.parts],
    ['סה״כ לפני הנחות', totals.beforeDiscounts],
    ['סה״כ הנחות', -totals.discounts],
    ['סה״כ לאחר הנחות ולפני מע״מ', totals.afterDiscounts],
    [`מע״מ ${d.vatPercent}%`, totals.vat],
    ['סה״כ כולל מע״מ', totals.total, true],
  ];
  const sumH = sumRows.length * 21 + 26;
  p.need(sumH + 10);
  p.y += 8;
  const sw = 330;
  drawRoundedRect(p.ctx, MARGIN, p.y, sw, sumH, 10, '#f8fafc', LINE);
  text(p.ctx, 'סיכום', MARGIN + sw - 14, p.y + 14, { size: 12.5, weight: 800, color: ACCENT });
  sumRows.forEach(([k, v, strong], i) => {
    const y = p.y + 34 + i * 21;
    if (strong) drawRoundedRect(p.ctx, MARGIN + 6, y - 11, sw - 12, 22, 6, INK);
    text(p.ctx, k, MARGIN + sw - 14, y, { size: strong ? 12.5 : 11, weight: strong ? 800 : 600, color: strong ? '#ffffff' : INK });
    // Amounts are drawn left-to-right so a minus sign stays in front of the number.
    p.ctx.direction = 'ltr';
    text(p.ctx, v < 0 ? `-${formatIls(-v)}` : formatIls(v), MARGIN + 14, y, { size: strong ? 13 : 11, weight: strong ? 900 : 700, color: strong ? '#ffffff' : INK, align: 'left' });
    p.ctx.direction = 'rtl';
  });
  // Notes beside the summary
  const notesX = right;
  const notesW = width - sw - 20;
  if (d.notes.trim()) {
    text(p.ctx, 'הערות', notesX, p.y + 14, { size: 12.5, weight: 800, color: ACCENT });
    p.ctx.font = `500 10.5px ${FONT}`;
    const lines = d.notes.split(/\n/).flatMap((ln) => wrapTextLines(p.ctx, ln, notesW));
    lines.slice(0, Math.floor((sumH - 30) / 16)).forEach((ln, i) => text(p.ctx, ln, notesX, p.y + 36 + i * 16, { size: 10.5 }));
  }
  p.y += sumH + 10;

  // Levi Itzhak Calculated Repair callout in PDF (only if showRepairInQuote is enabled)
  if (d.claim.showRepairInQuote && d.claim.weightedPrice) {
    const isThird = d.claim.quoteRepairRoute === 'third_party';
    const pct = isThird ? d.claim.repairCalcThirdPct || '0' : d.claim.repairCalcPolicyPct || '0';
    const rawAmount = String(isThird ? d.claim.repairCalcThirdAmount : d.claim.repairCalcPolicyAmount || '').replace(/,/g, '');
    const amount = Number(rawAmount) || 0;
    const routeLabel = isThird ? "צד ג׳" : "פוליסה";
    const weightedVal = Number(String(d.claim.weightedPrice || '').replace(/,/g, '')) || 0;

    const boxH = 54;
    p.need(boxH + 16);
    drawRoundedRect(p.ctx, MARGIN, p.y, width, boxH, 6, '#f0fdf4', '#86efac');

    // Header inside box
    text(p.ctx, 'נתוני מחירון לוי יצחק וסכום תיקון מחושב (לידיעה בלבד)', right - 14, p.y + 16, { size: 10.5, weight: 800, color: '#166534' });

    // 4 items evenly spaced in RTL across the width
    const colW = (width - 28) / 4;
    const itemY = p.y + 36;
    text(p.ctx, `שווי משוקלל: ${formatIls(weightedVal)}`, right - 14, itemY, { size: 10, weight: 600, color: '#334155' });
    text(p.ctx, `מסלול: ${routeLabel}`, right - 14 - colW, itemY, { size: 10, weight: 600, color: '#334155' });
    text(p.ctx, `אחוז תיקון: ${pct}%`, right - 14 - colW * 2, itemY, { size: 10, weight: 600, color: '#334155' });
    text(p.ctx, `סכום תיקון מחושב: ${formatIls(amount)}`, right - 14 - colW * 3, itemY, { size: 10.5, weight: 800, color: '#15803d' });

    p.y += boxH + 12;
  }

  // Footer on every page
  p.pages.forEach((cv, i) => {
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.direction = 'rtl';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = LINE;
    ctx.beginPath();
    ctx.moveTo(MARGIN, PAGE_H - MARGIN - 18);
    ctx.lineTo(right, PAGE_H - MARGIN - 18);
    ctx.stroke();
    text(ctx, branding.footer_note || '', right, PAGE_H - MARGIN - 4, { size: 9.5, color: MUTED });
    text(ctx, `עמוד ${i + 1} מתוך ${p.pages.length}`, MARGIN, PAGE_H - MARGIN - 4, { size: 9.5, color: MUTED, align: 'left' });
  });
  return p.pages;
}

export function claimQuoteFileName(d: QuoteData, quoteNo: number, version: number) {
  const plate = String(d.claim.plate || '').replace(/[^0-9A-Za-z]/g, '');
  return `הצעת-מחיר-${quoteNo}-v${version}${plate ? `-${plate}` : ''}.pdf`;
}

export async function buildClaimQuotePdf(d: QuoteData, meta: QuotePdfMeta): Promise<File> {
  const canvases = await renderClaimQuoteCanvases(d, meta);
  const pages: PdfPage[] = [];
  for (const c of canvases) pages.push({ jpeg: await canvasToJpegBytes(c), widthPx: c.width, heightPx: c.height });
  return new File([wrapJpegsAsPdf(pages)], claimQuoteFileName(d, meta.quoteNo, meta.version), { type: 'application/pdf', lastModified: Date.now() });
}
