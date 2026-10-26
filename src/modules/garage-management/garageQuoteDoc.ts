/**
 * High-resolution Hebrew RTL Quote Document Generator (PDF & PNG File)
 * + Per-Garage Branding Manager (garage_shop_settings)
 * + Native Mobile File Share (navigator.share with File)
 *
 * IMPORTANT: Dalia is the software provider, NOT the garage.
 * Never display Dalia's name or logo on the quote — always use the garage's own branding
 * (defaulting to "מוסך יוני – פחחות וצבע לרכב" for Yoni's Garage).
 */

import { supabase } from '@/integrations/supabase/client';

export interface GarageShopBranding {
  shop_company_name: string;
  shop_name: string;
  shop_title: string;
  subtitle: string;
  logo_url: string;
  phone: string;
  address: string;
  email: string;
  business_id: string;
  footer_note: string;
}

export interface GarageQuoteWorkItem {
  id?: string;
  part?: string;
  type?: string;
  desc?: string;
  qty?: number;
  price?: number | null;
  unpriced?: boolean;
}

export interface GarageQuotePartItem {
  id?: string;
  name?: string;
  sku?: string;
  supplier?: string;
  qty?: number;
  price?: number | null;
}

export interface GarageQuotePhotoItem {
  id: string;
  title: string;
  category: string;
  signed_url?: string;
  storage_path?: string;
}

export interface GarageQuoteCardData {
  id?: string;
  case_id: string;
  case_number: string;
  quote_token: string;
  quote_url?: string;
  quote_version: number;
  quote_title: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  recipient_phone?: string;
  recipient_email?: string;
  vehicle_plate: string;
  vehicle_label?: string;
  quote_date: string;
  work_type: string;
  quote_works: GarageQuoteWorkItem[];
  quote_parts: GarageQuotePartItem[];
  priced_subtotal: number;
  global_price?: number | null;
  priced_lines_count: number;
  unpriced_lines_count: number;
  vat_rate: number;
  vat_mode: string;
  quote_notes: string;
  quote_validity?: string;
  status: string;
  sent_at?: string | null;
  signed_at?: string | null;
  signer_name?: string;
  signature_data_url?: string;
  damage_photos_attached: boolean;
  damage_photos_count: number;
  damage_photos?: GarageQuotePhotoItem[];
  shop_branding?: GarageShopBranding;
}

export const DEFAULT_YONI_LOGO_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 80" width="240" height="80"><rect width="240" height="80" rx="14" fill="%230f172a"/><rect x="3" y="3" width="234" height="74" rx="11" fill="none" stroke="%2338bdf8" stroke-width="2"/><g transform="translate(185, 16)"><circle cx="24" cy="24" r="22" fill="%230284c7"/><path d="M12 28 L16 19 L32 19 L36 28 Z" fill="%23ffffff"/><rect x="10" y="26" width="28" height="8" rx="3" fill="%2338bdf8"/><circle cx="16" cy="34" r="4" fill="%230f172a" stroke="%23ffffff" stroke-width="2"/><circle cx="32" cy="34" r="4" fill="%230f172a" stroke="%23ffffff" stroke-width="2"/></g><text x="170" y="36" font-family="Heebo, Arial, sans-serif" font-size="22" font-weight="900" fill="%23ffffff" text-anchor="end" direction="rtl">מוסך יוני</text><text x="170" y="58" font-family="Heebo, Arial, sans-serif" font-size="13" font-weight="700" fill="%2338bdf8" text-anchor="end" direction="rtl">פחחות וצבע לרכב</text></svg>`;

export const DEFAULT_YONI_BRANDING: GarageShopBranding = {
  shop_company_name: '',
  shop_name: 'מוסך יוני',
  shop_title: 'מוסך יוני – פחחות וצבע לרכב',
  subtitle: 'מומחים לפחחות, צבע ושיקום רכב מתקדם',
  logo_url: DEFAULT_YONI_LOGO_SVG,
  phone: '',
  address: '',
  email: 'yoni191177@gmail.com',
  business_id: '',
  footer_note: 'תודה שבחרתם במוסך יוני – פחחות וצבע לרכב.',
};

const BRANDING_CACHE_KEY = 'gm_shop_branding_v1';

export function resolveShopBranding(raw?: Partial<GarageShopBranding> | null): GarageShopBranding {
  return {
    shop_company_name: String(raw?.shop_company_name ?? DEFAULT_YONI_BRANDING.shop_company_name),
    shop_name: String(raw?.shop_name || DEFAULT_YONI_BRANDING.shop_name),
    shop_title: String(raw?.shop_title || DEFAULT_YONI_BRANDING.shop_title),
    subtitle: String(raw?.subtitle || DEFAULT_YONI_BRANDING.subtitle),
    logo_url: String(raw?.logo_url || DEFAULT_YONI_BRANDING.logo_url),
    phone: raw?.phone && raw.phone !== '050-0000000' ? String(raw.phone) : '',
    address: raw?.address && raw.address !== 'ישראל' ? String(raw.address) : '',
    email: String(raw?.email || DEFAULT_YONI_BRANDING.email),
    business_id: String(raw?.business_id || ''),
    footer_note: String(raw?.footer_note || DEFAULT_YONI_BRANDING.footer_note),
  };
}

export async function loadGarageShopBranding(shopCompanyName = ''): Promise<GarageShopBranding> {
  const cleanShop = String(shopCompanyName || '').trim();
  try {
    const { data, error } = await (supabase.from as any)('garage_shop_settings')
      .select('*')
      .in('shop_company_name', [cleanShop, ''])
      .order('shop_company_name', { ascending: false })
      .limit(1);
    if (!error && Array.isArray(data) && data.length > 0) {
      const resolved = resolveShopBranding(data[0]);
      try {
        localStorage.setItem(`${BRANDING_CACHE_KEY}:${cleanShop}`, JSON.stringify(resolved));
      } catch {}
      return resolved;
    }
  } catch {
    // Fallback to localStorage or default
  }
  try {
    const cached = localStorage.getItem(`${BRANDING_CACHE_KEY}:${cleanShop}`);
    if (cached) return resolveShopBranding(JSON.parse(cached));
  } catch {}
  return resolveShopBranding({
    ...DEFAULT_YONI_BRANDING,
    shop_company_name: cleanShop,
    ...(cleanShop ? { shop_name: cleanShop, shop_title: cleanShop } : {}),
  });
}

export async function saveGarageShopBranding(branding: Partial<GarageShopBranding>): Promise<GarageShopBranding> {
  const resolved = resolveShopBranding(branding);
  try {
    localStorage.setItem(`${BRANDING_CACHE_KEY}:${resolved.shop_company_name}`, JSON.stringify(resolved));
  } catch {}

  const { data, error } = await (supabase.from as any)('garage_shop_settings')
    .upsert(
      {
        shop_company_name: resolved.shop_company_name,
        shop_name: resolved.shop_name,
        shop_title: resolved.shop_title,
        subtitle: resolved.subtitle,
        logo_url: resolved.logo_url,
        phone: resolved.phone,
        address: resolved.address,
        email: resolved.email,
        business_id: resolved.business_id,
        footer_note: resolved.footer_note,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'shop_company_name' },
    )
    .select('*')
    .single();

  if (error) throw new Error(error.message || 'שמירת הגדרות מיתוג המוסך נכשלה');
  return resolveShopBranding(data || resolved);
}

const PAGE_W = 794;
const PAGE_H = 1123;
const SCALE = 2; // 2x retina resolution for crisp Hebrew text & tables
const MARGIN = 36;
const FONT = 'Heebo, "Arial Hebrew", "Noto Sans Hebrew", Arial, sans-serif';

export type PdfPage = { jpeg: Uint8Array; widthPx: number; heightPx: number };

export function wrapJpegsAsPdf(pages: PdfPage[]): Uint8Array {
  const pageW = 595;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const pushStr = (s: string) => chunks.push(encoder.encode(s));
  pushStr('%PDF-1.4\n');
  const off: number[] = [0];
  const pos = () => chunks.reduce((n, c) => n + c.length, 0);
  const addObj = (body: string) => {
    off.push(pos());
    pushStr(body);
  };

  const n = Math.max(1, pages.length);
  const kids = pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ');
  addObj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  addObj(`2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);

  pages.forEach((pg, i) => {
    const pageId = 3 + 3 * i;
    const imgId = pageId + 1;
    const contentId = pageId + 2;
    const pageH = Math.max(200, Math.round((pg.heightPx / pg.widthPx) * pageW));
    addObj(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );
    off.push(pos());
    pushStr(
      `${imgId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pg.widthPx} /Height ${pg.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`,
    );
    chunks.push(pg.jpeg);
    pushStr('\nendstream\nendobj\n');
    const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
    addObj(`${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const xrefAt = pos();
  const objCount = 2 + 3 * n;
  pushStr(`xref\n0 ${objCount + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= objCount; i++) {
    pushStr(`${String(off[i]).padStart(10, '0')} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

export async function readyHebrewFont() {
  try {
    if (typeof document !== 'undefined' && !document.getElementById('claims-heebo')) {
      const l = document.createElement('link');
      l.id = 'claims-heebo';
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(l);
    }
    if (typeof document !== 'undefined' && document.fonts?.load) {
      await document.fonts.load(`400 12px ${FONT}`);
      await document.fonts.load(`700 16px ${FONT}`);
      await document.fonts.load(`800 22px ${FONT}`);
    }
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      await document.fonts.ready;
    }
  } catch {
    /* fallback fonts still draw */
  }
}

export function loadImageSafe(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return ['—'];
  const words = raw.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxW && line) {
      out.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  return out.length ? out : ['—'];
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill?: string,
  stroke?: string,
  lineWidth = 1,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export interface RenderQuoteDocOptions {
  includeDamagePhotos?: boolean;
  brandingOverride?: Partial<GarageShopBranding>;
}

export async function renderGarageQuoteCanvases(
  quote: GarageQuoteCardData,
  options: RenderQuoteDocOptions = {},
): Promise<HTMLCanvasElement[]> {
  await readyHebrewFont();
  const branding = resolveShopBranding({
    ...(quote.shop_branding || DEFAULT_YONI_BRANDING),
    ...(options.brandingOverride || {}),
  });

  const logoImg = await loadImageSafe(branding.logo_url || DEFAULT_YONI_LOGO_SVG);
  const sigImg = quote.signature_data_url ? await loadImageSafe(quote.signature_data_url) : null;

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * SCALE;
  canvas.height = PAGE_H * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(SCALE, SCALE);

  // Page Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  const contentW = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  // 1. Branded Garage Header Banner (Never Dalia — Always the Garage's own branding!)
  drawRoundedRect(ctx, MARGIN, y, contentW, 92, 12, '#0f172a', '#1e293b', 1.5);

  // Draw garage logo on the left side of the RTL header
  if (logoImg) {
    try {
      ctx.drawImage(logoImg, MARGIN + 16, y + 14, 180, 64);
    } catch {
      // ignore logo draw error
    }
  }

  // Right-aligned garage title & business info
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 22px ${FONT}`;
  ctx.fillText(branding.shop_title || 'מוסך יוני – פחחות וצבע לרכב', PAGE_W - MARGIN - 18, y + 36);

  ctx.fillStyle = '#38bdf8';
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText(branding.subtitle || 'פחחות וצבע לרכב', PAGE_W - MARGIN - 18, y + 58);

  const contactParts = [
    branding.phone ? `טל׳: ${branding.phone}` : '',
    branding.email ? `דוא״ל: ${branding.email}` : '',
    branding.address ? `כתובת: ${branding.address}` : '',
    branding.business_id ? `ח.פ./ע.מ.: ${branding.business_id}` : '',
  ].filter(Boolean);
  if (contactParts.length > 0) {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `500 11px ${FONT}`;
    ctx.fillText(contactParts.join('  ·  '), PAGE_W - MARGIN - 18, y + 78);
  }

  y += 106;

  // 2. Quote Title & Case Metadata Bar
  drawRoundedRect(ctx, MARGIN, y, contentW, 66, 10, '#f8fafc', '#cbd5e1', 1);
  ctx.fillStyle = '#0f172a';
  ctx.font = `900 20px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(quote.quote_title || 'הצעת מחיר – עבודות פחחות וצבע', PAGE_W - MARGIN - 16, y + 30);

  if (quote.work_type) {
    ctx.fillStyle = '#334155';
    ctx.font = `600 12.5px ${FONT}`;
    ctx.fillText(`סוג עבודה: ${quote.work_type}`, PAGE_W - MARGIN - 16, y + 52);
  }

  // Metadata on the left side
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(`כרטיס עבודה: ${quote.case_number || '—'}`, MARGIN + 16, y + 24);
  ctx.fillText(`תאריך: ${quote.quote_date || '—'}`, MARGIN + 16, y + 42);
  ctx.fillStyle = '#475569';
  ctx.font = `600 11px ${FONT}`;
  ctx.fillText(`גרסת הצעה: #${quote.quote_version || 1}`, MARGIN + 16, y + 58);

  y += 78;

  // 3. Customer & Vehicle Details Box
  drawRoundedRect(ctx, MARGIN, y, contentW, 56, 10, '#eff6ff', '#bfdbfe', 1);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText('לכבוד (לקוח):', PAGE_W - MARGIN - 16, y + 20);
  ctx.fillStyle = '#0f172a';
  ctx.font = `900 16px ${FONT}`;
  ctx.fillText(quote.customer_name || '—', PAGE_W - MARGIN - 16, y + 42);

  const midX = PAGE_W / 2;
  ctx.fillStyle = '#64748b';
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText('מספר רכב:', midX, y + 20);
  ctx.fillStyle = '#0f172a';
  ctx.font = `900 16px ${FONT}`;
  ctx.fillText(
    `${quote.vehicle_plate || '—'}${quote.vehicle_label ? ` (${quote.vehicle_label})` : ''}`,
    midX,
    y + 42,
  );

  y += 70;

  // 4. Works Table
  const works = Array.isArray(quote.quote_works) ? quote.quote_works : [];
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 14px ${FONT}`;
  ctx.fillText(`פירוט העבודות – כל חלק בשורה נפרדת (${works.length} שורות)`, PAGE_W - MARGIN, y + 14);
  y += 22;

  // Table Header
  const colNumW = 34;
  const colPartW = 165;
  const colPriceW = 130;
  const colDescW = contentW - colNumW - colPartW - colPriceW;

  drawRoundedRect(ctx, MARGIN, y, contentW, 28, 6, '#1e293b');
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('#', PAGE_W - MARGIN - 10, y + 18);
  ctx.fillText('חלק / עבודה', PAGE_W - MARGIN - colNumW - 8, y + 18);
  ctx.fillText('תיאור מפורט', PAGE_W - MARGIN - colNumW - colPartW - 8, y + 18);
  ctx.textAlign = 'left';
  ctx.fillText('מחיר', MARGIN + 12, y + 18);
  y += 28;

  for (let i = 0; i < works.length; i++) {
    const w = works[i];
    const hasPrice = w.price !== null && w.price !== undefined && String(w.price).trim() !== '' && !w.unpriced;
    ctx.font = `500 12px ${FONT}`;
    const descLines = wrapTextLines(ctx, w.desc || w.type || '—', colDescW - 16);
    const partLines = wrapTextLines(ctx, w.part || w.type || 'עבודה', colPartW - 12);
    const rowLines = Math.max(descLines.length, partLines.length, 1);
    const rowH = Math.max(32, rowLines * 17 + 12);

    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    ctx.fillRect(MARGIN, y, contentW, rowH);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN, y, contentW, rowH);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(`${i + 1}.`, PAGE_W - MARGIN - 10, y + 20);

    ctx.fillStyle = '#0f172a';
    ctx.font = `800 12.5px ${FONT}`;
    partLines.forEach((ln, idx) => {
      ctx.fillText(ln, PAGE_W - MARGIN - colNumW - 8, y + 20 + idx * 16);
    });

    ctx.fillStyle = '#334155';
    ctx.font = `500 12px ${FONT}`;
    descLines.forEach((ln, idx) => {
      ctx.fillText(ln, PAGE_W - MARGIN - colNumW - colPartW - 8, y + 20 + idx * 16);
    });

    ctx.textAlign = 'left';
    if (hasPrice) {
      const lineTotal = (Number(w.price) || 0) * (Number(w.qty) || 1);
      ctx.fillStyle = '#0f172a';
      ctx.font = `800 13px ${FONT}`;
      ctx.fillText(`${lineTotal.toLocaleString()} ₪`, MARGIN + 12, y + 20);
    } else {
      drawRoundedRect(ctx, MARGIN + 8, y + 6, 114, 20, 4, '#fffbeb', '#fcd34d', 1);
      ctx.fillStyle = '#92400e';
      ctx.font = `700 10.5px ${FONT}`;
      ctx.fillText('ללא מחיר בשלב זה', MARGIN + 14, y + 20);
    }

    y += rowH;
  }

  // 5. Parts Table (if any)
  const parts = Array.isArray(quote.quote_parts) ? quote.quote_parts : [];
  if (parts.length > 0 && y < PAGE_H - 260) {
    y += 14;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillText(`פירוט חלקי חילוף (${parts.length})`, PAGE_W - MARGIN, y + 12);
    y += 18;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const rowH = 26;
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(MARGIN, y, contentW, rowH);
      ctx.strokeStyle = '#e2e8f0';
      ctx.strokeRect(MARGIN, y, contentW, rowH);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 12px ${FONT}`;
      ctx.fillText(`${p.name || 'חלק'} (כמות: ${p.qty || 1})`, PAGE_W - MARGIN - 12, y + 17);
      ctx.textAlign = 'left';
      const pTotal = p.supplier === 'customer' ? 'מסופק ע״י לקוח' : `${((Number(p.price) || 0) * (Number(p.qty) || 1)).toLocaleString()} ₪`;
      ctx.fillText(pTotal, MARGIN + 12, y + 17);
      y += rowH;
    }
  }

  y += 14;

  // 6. Financial Summary & VAT (18%) Box
  const pricedCount = Number(quote.priced_lines_count || 0);
  const unpricedCount = Number(quote.unpriced_lines_count || 0);
  const pricedSubtotal = Number(quote.priced_subtotal || 0);
  const vatRate = Number(quote.vat_rate || 18);
  const summaryH = unpricedCount > 0 ? 108 : 82;

  drawRoundedRect(ctx, MARGIN, y, contentW, summaryH, 10, '#f8fafc', '#94a3b8', 1.2);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 14px ${FONT}`;
  ctx.fillText(
    `סה"כ עבור ${pricedCount} השורות המתומחרות בלבד:`,
    PAGE_W - MARGIN - 16,
    y + 26,
  );
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = `900 18px ${FONT}`;
  ctx.fillText(`${pricedSubtotal.toLocaleString()} ₪`, MARGIN + 16, y + 27);

  let sumLineY = y + 48;
  if (unpricedCount > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#b45309';
    ctx.font = `700 11.5px ${FONT}`;
    ctx.fillText(
      `⚠️ הבהרה: סכום הביניים (${pricedSubtotal.toLocaleString()} ₪) מתייחס ל-${pricedCount} העבודות המתומחרות בלבד ואינו סופי (${unpricedCount} שורות "ללא מחיר בשלב זה").`,
      PAGE_W - MARGIN - 16,
      sumLineY,
    );
    sumLineY += 22;
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = '#334155';
  ctx.font = `700 11.5px ${FONT}`;
  const vatText =
    quote.vat_mode === 'plus_vat'
      ? `מע"מ (${vatRate}%): +${Math.round(pricedSubtotal * (vatRate / 100)).toLocaleString()} ₪ · סה"כ כולל מע"מ לשורות המתומחרות: ${Math.round(pricedSubtotal * (1 + vatRate / 100)).toLocaleString()} ₪`
      : quote.vat_mode === 'includes_vat'
      ? `מע"מ (${vatRate}%): המחירים כוללים מע"מ כדין (${vatRate}%)`
      : `מע"מ (${vatRate}%): מע"מ, ככל שחל, יחושב לפי שיעור המס התקף בישראל, ${vatRate}%, ובהתאם להגדרת המחירים ככוללים או לא כוללים מע"מ.`;
  ctx.fillText(vatText, PAGE_W - MARGIN - 16, sumLineY);

  if (quote.global_price && Number(quote.global_price) > 0) {
    ctx.fillText(
      `מחיר גלובלי / סכום הזמנה מאושר: ${Number(quote.global_price).toLocaleString()} ₪`,
      PAGE_W - MARGIN - 16,
      sumLineY + 18,
    );
  }

  y += summaryH + 12;

  // 7. Damage Photos Note / Section
  const includePhotos = options.includeDamagePhotos !== false;
  if (includePhotos) {
    drawRoundedRect(ctx, MARGIN, y, contentW, 38, 8, '#f1f5f9', '#cbd5e1', 1);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 12px ${FONT}`;
    const photosNote = quote.damage_photos_attached && quote.damage_photos_count > 0
      ? `📷 מצורפות תמונות המתעדות את הנזקים ברכב (${quote.damage_photos_count} תמונות נזק שמורות בכרטיס העבודה).`
      : `📷 מצורפות תמונות המתעדות את הנזקים ברכב.`;
    ctx.fillText(photosNote, PAGE_W - MARGIN - 14, y + 23);
    y += 48;
  }

  // 8. Signature Box
  const sigBoxH = 92;
  if (y + sigBoxH < PAGE_H - 40) {
    const isSigned = quote.status === 'signed' || Boolean(quote.signature_data_url);
    drawRoundedRect(
      ctx,
      MARGIN,
      y,
      contentW,
      sigBoxH,
      10,
      isSigned ? '#ecfdf5' : '#f8fafc',
      isSigned ? '#34d399' : '#cbd5e1',
      1.2,
    );
    ctx.textAlign = 'right';
    ctx.fillStyle = isSigned ? '#065f46' : '#0f172a';
    ctx.font = `800 13px ${FONT}`;
    ctx.fillText(
      isSigned
        ? `✓ הצעת המחיר אושרה ונחתמה דיגיטלית ע"י הלקוח: ${quote.signer_name || quote.customer_name}`
        : `אישור וחתימת הלקוח על הצעת המחיר (${quote.customer_name || ''}):`,
      PAGE_W - MARGIN - 16,
      y + 26,
    );
    ctx.fillStyle = '#475569';
    ctx.font = `500 11px ${FONT}`;
    ctx.fillText(
      isSigned && quote.signed_at
        ? `תאריך חתימה: ${new Date(quote.signed_at).toLocaleString('he-IL')} · גרסה #${quote.quote_version || 1}`
        : 'אני מאשר/ת את פירוט העבודות ותנאי הצעת המחיר המפורטים במסמך זה.',
      PAGE_W - MARGIN - 16,
      y + 48,
    );

    if (sigImg) {
      drawRoundedRect(ctx, MARGIN + 16, y + 12, 170, 68, 6, '#ffffff', '#cbd5e1', 1);
      try {
        ctx.drawImage(sigImg, MARGIN + 24, y + 16, 154, 60);
      } catch {}
    } else {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGIN + 20, y + 66);
      ctx.lineTo(MARGIN + 200, y + 66);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#64748b';
      ctx.font = `600 10.5px ${FONT}`;
      ctx.fillText('חתימת הלקוח', MARGIN + 110, y + 80);
    }
    y += sigBoxH + 10;
  }

  // 9. Footer Note (Garage's own footer — never Dalia!)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = `600 11px ${FONT}`;
  ctx.fillText(
    branding.footer_note || `מוסך יוני – פחחות וצבע לרכב · כרטיס עבודה ${quote.case_number || ''}`,
    PAGE_W / 2,
    PAGE_H - 18,
  );

  const canvases: HTMLCanvasElement[] = [canvas];

  // Optional Page 2: If includeDamagePhotos is true and signed URLs exist on quote.damage_photos
  const validPhotos = (quote.damage_photos || []).filter((p) => p.signed_url);
  if (includePhotos && validPhotos.length > 0) {
    const loadedImgs: Array<{ title: string; img: HTMLImageElement }> = [];
    for (const p of validPhotos.slice(0, 4)) {
      const im = await loadImageSafe(p.signed_url || '');
      if (im) loadedImgs.push({ title: p.title || 'תמונת נזק', img: im });
    }
    if (loadedImgs.length > 0) {
      const p2 = document.createElement('canvas');
      p2.width = PAGE_W * SCALE;
      p2.height = PAGE_H * SCALE;
      const ctx2 = p2.getContext('2d')!;
      ctx2.scale(SCALE, SCALE);
      ctx2.fillStyle = '#ffffff';
      ctx2.fillRect(0, 0, PAGE_W, PAGE_H);

      drawRoundedRect(ctx2, MARGIN, MARGIN, contentW, 54, 10, '#0f172a');
      ctx2.textAlign = 'right';
      ctx2.fillStyle = '#ffffff';
      ctx2.font = `800 16px ${FONT}`;
      ctx2.fillText(
        `${branding.shop_title} – תמונות נזק מצורפות להצעה (${quote.case_number} · רכב ${quote.vehicle_plate})`,
        PAGE_W - MARGIN - 16,
        MARGIN + 33,
      );

      const gridY = MARGIN + 72;
      const cellW = (contentW - 20) / 2;
      const cellH = 340;
      loadedImgs.forEach((item, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cx = MARGIN + col * (cellW + 20);
        const cy = gridY + row * (cellH + 24);
        drawRoundedRect(ctx2, cx, cy, cellW, cellH, 8, '#f8fafc', '#cbd5e1', 1);
        try {
          ctx2.drawImage(item.img, cx + 10, cy + 10, cellW - 20, cellH - 46);
        } catch {}
        ctx2.textAlign = 'right';
        ctx2.fillStyle = '#0f172a';
        ctx2.font = `700 12px ${FONT}`;
        ctx2.fillText(item.title, cx + cellW - 12, cy + cellH - 14);
      });
      canvases.push(p2);
    }
  }

  return canvases;
}

export function canvasToJpegBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) {
          reject(new Error('שגיאה בהפקת תמונת עמוד ל-PDF'));
          return;
        }
        void b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
      },
      'image/jpeg',
      0.92,
    );
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) {
          reject(new Error('שגיאה בהפקת קובץ תמונה'));
          return;
        }
        resolve(b);
      },
      'image/png',
    );
  });
}

export function getQuoteFileName(quote: GarageQuoteCardData, ext: 'pdf' | 'png' = 'pdf'): string {
  const cleanCase = String(quote.case_number || 'quote').replace(/[^A-Za-z0-9_-]/g, '');
  const cleanPlate = String(quote.vehicle_plate || '').replace(/[^0-9A-Za-z]/g, '');
  return `הצעת-מחיר-${cleanCase}${cleanPlate ? `-${cleanPlate}` : ''}.${ext}`;
}

export async function buildGarageQuotePdfFile(
  quote: GarageQuoteCardData,
  options: RenderQuoteDocOptions = {},
): Promise<File> {
  const canvases = await renderGarageQuoteCanvases(quote, options);
  const pages: PdfPage[] = [];
  for (const c of canvases) {
    const jpeg = await canvasToJpegBytes(c);
    pages.push({ jpeg, widthPx: c.width, heightPx: c.height });
  }
  const pdfBytes = wrapJpegsAsPdf(pages);
  const fileName = getQuoteFileName(quote, 'pdf');
  return new File([pdfBytes], fileName, { type: 'application/pdf', lastModified: Date.now() });
}

export async function buildGarageQuotePngFile(
  quote: GarageQuoteCardData,
  options: RenderQuoteDocOptions = {},
): Promise<File> {
  const canvases = await renderGarageQuoteCanvases(quote, options);
  const pngBlob = await canvasToPngBlob(canvases[0]);
  const fileName = getQuoteFileName(quote, 'png');
  return new File([pngBlob], fileName, { type: 'image/png', lastModified: Date.now() });
}

export function downloadFileInBrowser(file: File | Blob, fallbackName = 'quote.pdf'): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file instanceof File ? file.name : fallbackName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  }, 1500);
}

export async function shareGarageQuoteFileNative(
  file: File,
  quote: GarageQuoteCardData,
): Promise<{ shared: boolean; mode: 'native_file' | 'cancelled' | 'fallback_needed'; reason?: string }> {
  const branding = resolveShopBranding(quote.shop_branding);
  const title = `${quote.quote_title || 'הצעת מחיר'} – ${branding.shop_title}`;
  const signUrl = quote.quote_token
    ? `${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}/garage-quote?t=${quote.quote_token}`
    : '';
  const text = [
    `${branding.shop_title}`,
    `${quote.quote_title || 'הצעת מחיר'} עבור ${quote.customer_name || ''} (רכב ${quote.vehicle_plate || ''})`,
    `כרטיס עבודה: ${quote.case_number || ''}`,
    signUrl ? `לצפייה וחתימה דיגיטלית: ${signUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
    share?: (data?: ShareData) => Promise<void>;
  };

  if (typeof nav.share !== 'function') {
    return { shared: false, mode: 'fallback_needed', reason: 'הדפדפן במכשיר זה אינו תומך בתפריט שיתוף מובנה (Web Share API).' };
  }

  const sharePayload: ShareData = {
    files: [file],
    title,
    text,
  };

  if (typeof nav.canShare === 'function') {
    try {
      if (!nav.canShare({ files: [file] })) {
        return {
          shared: false,
          mode: 'fallback_needed',
          reason: 'המכשיר או הדפדפן אינם תומכים בשיתוף קובץ ישיר. הקובץ הוכן עבורך להורדה ולשיתוף ידני.',
        };
      }
    } catch {
      return {
        shared: false,
        mode: 'fallback_needed',
        reason: 'המכשיר או הדפדפן אינם תומכים בשיתוף קובץ ישיר.',
      };
    }
  }

  try {
    await nav.share(sharePayload);
    return { shared: true, mode: 'native_file' };
  } catch (err) {
    const errName = (err as Error)?.name || '';
    if (errName === 'AbortError') {
      return { shared: false, mode: 'cancelled' };
    }
    return {
      shared: false,
      mode: 'fallback_needed',
      reason: (err as Error)?.message || 'שיתוף הקובץ הישיר לא נתמך בדפדפן זה.',
    };
  }
}
