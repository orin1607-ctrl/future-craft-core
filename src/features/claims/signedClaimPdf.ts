/**
 * Client-side opening-form PDF using canvas → JPEG → minimal PDF.
 * Existing claims-docs / claims-intake upload path. No new library or schema.
 *
 * Layout follows טופס "הודעה על תאונת רכב" (sections א–ד + הצהרה + חתימה).
 * Mobile Safari + `direction:rtl` + `textAlign:right` at x=width-margin
 * draws Hebrew off the canvas, so draw LTR with right-aligned text.
 */
import {
  CAR_TYPES,
  DAMAGE_ZONES,
  DECLARATION_TEXT,
  INS_TYPES,
  TRIP_PURPOSES,
  displayDriverId,
  displayDriverName,
  displayDriverPhone,
  hasZone,
  tripPurposeLabel,
  type IntakeDraft,
} from './claimIntakeModel';

const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 28;
const FONT = 'Heebo, "Arial Hebrew", "Noto Sans Hebrew", Arial, sans-serif';

type PdfPage = { jpeg: Uint8Array; widthPx: number; heightPx: number };

function wrapJpegsAsPdf(pages: PdfPage[]): Uint8Array {
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

function yesNo(v: string | undefined) {
  if (v === 'true') return 'כן';
  if (v === 'false') return 'לא';
  return v || '';
}

function dash(v: string | undefined) {
  const s = String(v || '').trim();
  return s || '—';
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const raw = String(text || '').replace(/\s+/g, ' ').trim() || '—';
  const out: string[] = [];
  let line = '';
  for (const ch of raw) {
    const next = line + ch;
    if (ctx.measureText(next).width > maxW && line) {
      out.push(line);
      line = ch.trimStart();
    } else line = next;
  }
  if (line) out.push(line);
  return out.length ? out : ['—'];
}

async function readyHebrewFont() {
  try {
    if (!document.getElementById('claims-heebo')) {
      const l = document.createElement('link');
      l.id = 'claims-heebo';
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800;900&display=swap';
      document.head.appendChild(l);
    }
    if (document.fonts?.load) {
      await document.fonts.load(`400 12px ${FONT}`);
      await document.fonts.load(`700 16px ${FONT}`);
      await document.fonts.load(`800 22px ${FONT}`);
    }
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* fallback fonts still draw */
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('signature image'));
    img.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) { reject(new Error('jpeg')); return; }
      void b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
    }, 'image/jpeg', 0.9);
  });
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = '#ffffff') {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function sectionHead(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, letter: string, title: string) {
  box(ctx, x, y, w, 22, '#1e3a5f');
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.direction = 'ltr';
  ctx.font = `800 12px ${FONT}`;
  ctx.fillText(`${letter}  ${title}`, x + w - 8, y + 15);
  return y + 22;
}

function cell(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string, value: string, opts?: { small?: boolean },
) {
  box(ctx, x, y, w, h, '#ffffff');
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.direction = 'ltr';
  ctx.font = `600 ${opts?.small ? 8 : 9}px ${FONT}`;
  ctx.fillText(label, x + w - 5, y + 11);
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 ${opts?.small ? 11 : 12}px ${FONT}`;
  const maxW = w - 12;
  const lines = wrapLines(ctx, dash(value), maxW).slice(0, h > 36 ? 3 : 1);
  lines.forEach((ln, i) => ctx.fillText(ln, x + w - 5, y + 25 + i * 13));
}

function checkRow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string,
  items: Array<{ label: string; on: boolean }>,
) {
  box(ctx, x, y, w, h, '#ffffff');
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.direction = 'ltr';
  ctx.font = `600 9px ${FONT}`;
  ctx.fillText(label, x + w - 5, y + 11);
  const slot = Math.min(128, Math.max(72, (w - 12) / Math.max(items.length, 1)));
  items.forEach((item, i) => {
    const ox = x + w - 8 - i * slot;
    ctx.strokeStyle = '#1e293b';
    ctx.strokeRect(ox - 9, y + 16, 9, 9);
    if (item.on) {
      ctx.fillStyle = '#1e3a5f';
      ctx.fillRect(ox - 8, y + 17, 7, 7);
    }
    ctx.fillStyle = '#0f172a';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(item.label, ox - 13, y + 25);
  });
}

function checks(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string, options: string[], selected: string,
) {
  checkRow(ctx, x, y, w, h, label, options.map((opt) => ({ label: opt, on: selected === opt })));
}

function yn(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, value: string) {
  checks(ctx, x, y, w, h, label, ['כן', 'לא'], yesNo(value) || '');
}

function markZones(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  title: string, csv: string,
) {
  box(ctx, x, y, w, h, '#f8fafc');
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.direction = 'ltr';
  ctx.font = `600 9px ${FONT}`;
  ctx.fillText(title, x + w - 6, y + 12);
  const carX = x + 16;
  const carY = y + 22;
  const carW = Math.min(86, w - 28);
  const carH = h - 36;
  ctx.strokeStyle = '#334155';
  ctx.strokeRect(carX, carY, carW, carH);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(carX + 18, carY + 10, carW - 36, carH - 20);
  const marks: Array<{ z: string; lx: number; ly: number }> = [
    { z: 'חזית', lx: carX + carW / 2, ly: carY + 8 },
    { z: 'אחור', lx: carX + carW / 2, ly: carY + carH - 4 },
    { z: 'ימין', lx: carX + carW - 4, ly: carY + carH / 2 },
    { z: 'שמאל', lx: carX + 4, ly: carY + carH / 2 },
    { z: 'גג', lx: carX + carW / 2, ly: carY + carH / 2 },
  ];
  ctx.font = `700 9px ${FONT}`;
  ctx.textAlign = 'center';
  marks.forEach((m) => {
    ctx.fillStyle = hasZone(csv, m.z) ? '#b91c1c' : '#94a3b8';
    ctx.fillText(m.z, m.lx, m.ly);
  });
  ctx.textAlign = 'right';
  ctx.fillStyle = '#0f172a';
  ctx.font = `600 10px ${FONT}`;
  ctx.fillText(dash(csv), x + w - 6, y + h - 8);
}

function para(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string, text: string) {
  box(ctx, x, y, w, h, '#ffffff');
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'right';
  ctx.direction = 'ltr';
  ctx.font = `600 9px ${FONT}`;
  ctx.fillText(label, x + w - 5, y + 11);
  ctx.fillStyle = '#0f172a';
  ctx.font = `500 11px ${FONT}`;
  const lines = wrapLines(ctx, dash(text), w - 12);
  const max = Math.max(1, Math.floor((h - 18) / 13));
  lines.slice(0, max).forEach((ln, i) => ctx.fillText(ln, x + w - 5, y + 26 + i * 13));
}

function eventPlace(d: IntakeDraft, fallback: string) {
  return [d.eventPlace, d.eventStreet, d.eventCity].filter(Boolean).join(', ') || fallback;
}

export async function buildSignedOpeningFormPdf(opts: {
  clientName: string;
  plate: string;
  eventDate: string;
  eventLocation: string;
  eventDesc: string;
  signaturePng?: string;
  claimNum?: string;
  claimId?: string;
  signedAt?: string;
  draft?: IntakeDraft;
}): Promise<File> {
  await readyHebrewFont();
  const d = opts.draft || ({} as IntakeDraft);
  const caseNumber = opts.claimId || opts.claimNum || d.claimNum || 'טרם התקבל';
  const claimKind = (d.claimKind && d.claimKind !== 'תביעה במסגרת פוליסת הלקוח') ? d.claimKind : 'הפעלת פוליסה';
  const signedTimestamp = opts.signedAt || new Date().toLocaleString('he-IL', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const inner = PAGE_W - MARGIN * 2;
  const col = (n: number, i: number, gap = 4) => {
    const w = (inner - gap * (n - 1)) / n;
    return { x: MARGIN + (n - 1 - i) * (w + gap), w };
  };

  const paintChrome = (ctx: CanvasRenderingContext2D, pageNo: number, pageCount: number) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(MARGIN - 6, 18, PAGE_W - (MARGIN - 6) * 2, PAGE_H - 40);
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 2;
    ctx.strokeRect(MARGIN - 6, 18, PAGE_W - (MARGIN - 6) * 2, PAGE_H - 40);
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(MARGIN - 6, 18, PAGE_W - (MARGIN - 6) * 2, 50);

    // Original Dalia logo mark in top-right of header
    const logoX = PAGE_W - MARGIN - 34;
    const logoY = 25;
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(logoX, logoY, 34, 34);
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(logoX, logoY, 34, 34);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.font = `900 20px ${FONT}`;
    ctx.fillText('ד', logoX + 17, logoY + 24);

    // Branded title & subtitle
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.direction = 'ltr';
    ctx.font = `800 19px ${FONT}`;
    ctx.fillText('דליה – תביעת רכב  |  הודעה על תאונת רכב', logoX - 10, 40);
    ctx.font = `600 10px ${FONT}`;
    ctx.fillText(`סוג התביעה: ${claimKind}  ·  תיק דליה: ${caseNumber}`, logoX - 10, 58);

    // Case number on top-left
    ctx.textAlign = 'left';
    ctx.font = `800 12px ${FONT}`;
    ctx.fillText(`מספר תיק: ${caseNumber}`, MARGIN + 4, 40);
    ctx.font = `600 10px ${FONT}`;
    ctx.fillText(`חתימה: ${signedTimestamp}`, MARGIN + 4, 58);

    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`דליה – תביעת רכב · תיק ${caseNumber} · עמ׳ ${pageNo} מתוך ${pageCount}`, PAGE_W / 2, PAGE_H - 10);
    ctx.textAlign = 'right';
  };

  const page1 = document.createElement('canvas');
  page1.width = PAGE_W;
  page1.height = PAGE_H;
  const c1 = page1.getContext('2d');
  if (!c1) throw new Error('canvas');

  const page2 = document.createElement('canvas');
  page2.width = PAGE_W;
  page2.height = PAGE_H;
  const c2 = page2.getContext('2d');
  if (!c2) throw new Error('canvas');

  paintChrome(c1, 1, 2);
  paintChrome(c2, 2, 2);

  let y = 74;
  y = sectionHead(c1, MARGIN, y, inner, 'א', 'פרטי המבוטח, סוג התביעה והפוליסה');
  let a = col(4, 0); cell(c1, a.x, y, a.w, 34, 'מספר תיק דליה', caseNumber);
  a = col(4, 1); cell(c1, a.x, y, a.w, 34, 'סוג התביעה', claimKind);
  a = col(4, 2); cell(c1, a.x, y, a.w, 34, 'מס׳ הפוליסה', d.policyNum);
  a = col(4, 3); cell(c1, a.x, y, a.w, 34, 'בתוקף עד', d.policyValidUntil);
  y += 34;
  a = col(3, 0); cell(c1, a.x, y, a.w, 34, 'שם המבוטח', opts.clientName || d.clientName);
  a = col(3, 1); cell(c1, a.x, y, a.w, 34, 'מס׳ ת.ז.', d.clientId);
  a = col(3, 2); yn(c1, a.x, y, a.w, 34, 'עוסק מורשה', d.licensedDealer);
  y += 34;
  a = col(4, 0); cell(c1, a.x, y, a.w, 34, 'כתובת', d.clientAddress);
  a = col(4, 1); cell(c1, a.x, y, a.w, 34, 'רחוב', d.addressStreet);
  a = col(4, 2); cell(c1, a.x, y, a.w, 34, 'ישוב', d.addressCity);
  a = col(4, 3); cell(c1, a.x, y, a.w, 34, 'מיקוד', d.clientZip);
  y += 34;
  a = col(4, 0); cell(c1, a.x, y, a.w, 34, 'טלפון בית', d.phoneHome);
  a = col(4, 1); cell(c1, a.x, y, a.w, 34, 'טלפון נייד', d.phoneMobile || d.clientPhone);
  a = col(4, 2); cell(c1, a.x, y, a.w, 34, 'פקס', d.clientFax);
  a = col(4, 3); cell(c1, a.x, y, a.w, 34, 'דואר אלקטרוני', d.clientEmail, { small: true });
  y += 34;
  checks(c1, MARGIN, y, inner * 0.46, 34, 'סוג ביטוח', [...INS_TYPES], d.insType);
  checks(c1, MARGIN + inner * 0.46 + 4, y, inner * 0.54 - 4, 34, 'סוג הרכב', [...CAR_TYPES], d.carType);
  y += 34;
  a = col(4, 0); cell(c1, a.x, y, a.w, 34, 'תוצר', d.carMake);
  a = col(4, 1); cell(c1, a.x, y, a.w, 34, 'דגם', String(d.carModel || '').replace(d.carMake ? new RegExp(`^${d.carMake}\\s+`) : /^$/, '') || d.carModel);
  a = col(4, 2); cell(c1, a.x, y, a.w, 34, 'שנת ייצור', d.carYear);
  a = col(4, 3); cell(c1, a.x, y, a.w, 34, 'מס׳ רישוי', opts.plate || d.plate);
  y += 34;
  a = col(2, 0); cell(c1, a.x, y, a.w, 34, 'שם בעל הרכב', d.vehicleOwnerName || opts.clientName || d.clientName);
  a = col(2, 1); cell(c1, a.x, y, a.w, 34, 'חברת הביטוח / מס׳ תביעה', [d.insCompany, d.claimNum].filter(Boolean).join(' · '));
  y += 40;

  y = sectionHead(c1, MARGIN, y, inner, 'ב', 'פרטי הנהג  (חובה למלא את כל הפרטים בפרק זה)');
  a = col(3, 0); cell(c1, a.x, y, a.w, 34, 'שם הנהג', displayDriverName(d));
  a = col(3, 1); cell(c1, a.x, y, a.w, 34, 'מס׳ ת.ז.', displayDriverId(d));
  a = col(3, 2); yn(c1, a.x, y, a.w, 34, 'האם נהג ברשות מבוטח', d.driverPermission);
  y += 34;
  a = col(4, 0); cell(c1, a.x, y, a.w, 34, 'כתובת', d.driverAddress);
  a = col(4, 1); cell(c1, a.x, y, a.w, 34, 'רחוב', d.driverStreet);
  a = col(4, 2); cell(c1, a.x, y, a.w, 34, 'ישוב', d.driverCity);
  a = col(4, 3); cell(c1, a.x, y, a.w, 34, 'מיקוד', d.driverZip);
  y += 34;
  a = col(4, 0); cell(c1, a.x, y, a.w, 34, 'טלפון בית', d.driverPhoneHome);
  a = col(4, 1); cell(c1, a.x, y, a.w, 34, 'טלפון נייד', displayDriverPhone(d));
  a = col(4, 2); cell(c1, a.x, y, a.w, 34, 'תאריך לידה', d.driverBirthDate);
  a = col(4, 3); cell(c1, a.x, y, a.w, 34, 'מין', d.driverGender);
  y += 34;
  a = col(4, 0); cell(c1, a.x, y, a.w, 34, 'מס׳ רישיון נהיגה', d.driverLicense);
  a = col(4, 1); cell(c1, a.x, y, a.w, 34, 'סוג רישיון', d.driverLicenseType);
  a = col(4, 2); cell(c1, a.x, y, a.w, 34, 'תוקף רישיון', d.driverLicenseValid);
  a = col(4, 3); cell(c1, a.x, y, a.w, 34, 'שנת הוצאת רישיון', d.driverLicenseYear);
  y += 40;

  y = sectionHead(c1, MARGIN, y, inner, 'ג', 'פרטי התאונה');
  a = col(3, 0); cell(c1, a.x, y, a.w, 34, 'תאריך', opts.eventDate || d.eventDate);
  a = col(3, 1); cell(c1, a.x, y, a.w, 34, 'שעה', d.eventTime);
  a = col(3, 2); cell(c1, a.x, y, a.w, 34, 'מקום / כתובת אתר התאונה', eventPlace(d, opts.eventLocation));
  y += 34;
  checkRow(c1, MARGIN, y, inner, 34, 'האם היה באירוע?', [
    { label: 'משטרה', on: d.police === 'true' },
    { label: 'גרר', on: d.tow === 'true' },
    { label: 'מכבי אש', on: d.fireDept === 'true' },
  ]);
  y += 34;
  a = col(4, 0); cell(c1, a.x, y, a.w, 34, 'נגבתה עדות בתחנת', d.policeStation);
  a = col(4, 1); cell(c1, a.x, y, a.w, 34, 'מס׳ תיק', d.policeFile);
  a = col(4, 2); cell(c1, a.x, y, a.w, 34, 'מס׳ יומן', d.journalNumber);
  a = col(4, 3); cell(c1, a.x, y, a.w, 34, 'בתאריך', d.policeDate);
  y += 36;
  para(c1, MARGIN, y, inner, 118, 'תיאור מפורט של התאונה (מספר הרכב במידה והמקום לא מספיק ניתן להוסיף דף מלווה)', opts.eventDesc || d.eventDesc);
  y += 122;
  para(c1, MARGIN, y, inner * 0.58, 96, 'תרשים ממקום התאונה', d.accidentDiagramNotes);
  markZones(c1, MARGIN + inner * 0.58 + 4, y, inner * 0.42 - 4, 96, 'איזורי פגיעה רכב מבוטח', d.damageLocation);
  y += 100;
  para(c1, MARGIN, y, inner, 52, 'תיאור הנזק / מיקום הנזק ברכב המבוטח', d.damageDesc);

  y = 74;
  y = sectionHead(c2, MARGIN, y, inner, 'ג', 'פרטי התאונה — המשך');
  a = col(2, 0);
  cell(c2, a.x, y, a.w, 48, 'עד 1 — שם / כתובת', [d.witness1Name, d.witness1Address].filter(Boolean).join(' · '));
  a = col(2, 1);
  cell(c2, a.x, y, a.w, 48, 'עד 2 — שם / כתובת', [d.witness2Name, d.witness2Address].filter(Boolean).join(' · '));
  y += 48;
  para(c2, MARGIN, y, inner, 36, 'עדים — הערות נוספות', d.witnesses);
  y += 36;
  checks(c2, MARGIN, y, inner * 0.62, 34, 'המקרה אירע', TRIP_PURPOSES.map((p) => p.label), tripPurposeLabel(d.tripPurpose));
  a = col(5, 4);
  cell(c2, MARGIN + inner * 0.62 + 4, y, inner * 0.38 - 4, 34, 'מוסך / שמאי', [d.garageName, d.surveyorName].filter(Boolean).join(' · '));
  y += 40;

  y = sectionHead(c2, MARGIN, y, inner, 'ד', 'פרטי המעורב — צד ג׳  (חובה למלא את כל הפרטים בפרק זה)');
  a = col(3, 0); cell(c2, a.x, y, a.w, 34, 'שם הנהג', d.thirdDriver);
  a = col(3, 1); cell(c2, a.x, y, a.w, 34, 'מס׳ ת.ז.', d.thirdId);
  a = col(3, 2); cell(c2, a.x, y, a.w, 34, 'טלפון', d.thirdPhone);
  y += 34;
  a = col(3, 0); cell(c2, a.x, y, a.w, 34, 'כתובת', d.thirdAddress);
  a = col(3, 1); cell(c2, a.x, y, a.w, 34, 'שם בעל הרכב', d.thirdOwner);
  a = col(3, 2); cell(c2, a.x, y, a.w, 34, 'מס׳ רישוי', d.thirdPlate);
  y += 34;
  checks(c2, MARGIN, y, inner * 0.5, 34, 'סוג הרכב', [...CAR_TYPES], d.thirdCarType);
  a = col(2, 1); cell(c2, MARGIN + inner * 0.5 + 4, y, inner * 0.5 - 4, 34, 'תוצר ודגם', d.thirdMakeModel);
  y += 34;
  a = col(3, 0); cell(c2, a.x, y, a.w, 34, 'שם חברת הביטוח', d.thirdInsCompany);
  a = col(3, 1); cell(c2, a.x, y, a.w, 34, 'מס׳ הפוליסה', d.thirdPolicy);
  a = col(3, 2); checks(c2, a.x, y, a.w, 34, 'סוג הביטוח', [...INS_TYPES], d.thirdInsType);
  y += 34;
  para(c2, MARGIN, y, inner * 0.58, 72, 'תיאור הנזק / מיקום הנזק לצד ג׳', d.thirdDamage);
  markZones(c2, MARGIN + inner * 0.58 + 4, y, inner * 0.42 - 4, 72, 'איזורי פגיעה רכב צד ג׳', d.thirdDamageLocation);
  y += 78;

  y = sectionHead(c2, MARGIN, y, inner, 'ה', 'הצהרת המבוטח/ת');
  yn(c2, MARGIN, y, inner, 32, 'הנני מעוניין/ת כי תביעת צד ג׳ שתוגש נגדי תטופל ו/או תשולם על ידי החברה', d.thirdClaimAgainstMe);
  y += 32;
  para(c2, MARGIN, y, inner, 92, 'הצהרה', DECLARATION_TEXT.replace(/\n/g, ' '));
  y += 94;
  const prefs = [
    d.contactPrefEmail === 'true' ? 'דואר אלקטרוני' : '',
    d.contactPrefMobile === 'true' ? 'טלפון נייד' : '',
    d.contactPrefPost === 'true' ? 'דואר ישראל' : '',
  ].filter(Boolean).join(' · ');
  cell(c2, MARGIN, y, inner, 34, 'אמצעי קבלת הודעות', prefs);
  y += 40;

  const sigTop = Math.max(y, PAGE_H - 210);
  box(c2, MARGIN, sigTop, inner, 168, '#ffffff');
  c2.fillStyle = '#64748b';
  c2.textAlign = 'right';
  c2.font = `600 9px ${FONT}`;
  const third = inner / 3;
  c2.fillText('תאריך ושעת חתימה', MARGIN + inner - 8, sigTop + 14);
  c2.fillText('הטופס מולא ע״י', MARGIN + inner - third - 8, sigTop + 14);
  c2.fillText('חתימת המבוטח/ת', MARGIN + third - 8, sigTop + 14);
  c2.fillStyle = '#0f172a';
  c2.font = `700 12px ${FONT}`;
  c2.fillText(signedTimestamp, MARGIN + inner - 8, sigTop + 34);
  if (d.declarationDate) {
    c2.font = `600 10px ${FONT}`;
    c2.fillStyle = '#475569';
    c2.fillText(`תאריך הצהרה: ${d.declarationDate}`, MARGIN + inner - 8, sigTop + 50);
  }
  c2.fillStyle = '#0f172a';
  c2.font = `700 13px ${FONT}`;
  c2.fillText(dash(d.formFilledBy || opts.clientName || d.clientName), MARGIN + inner - third - 8, sigTop + 34);
  c2.strokeStyle = '#94a3b8';
  c2.beginPath();
  c2.moveTo(MARGIN + 10, sigTop + 150);
  c2.lineTo(MARGIN + third - 10, sigTop + 150);
  c2.stroke();
  if (opts.signaturePng) {
    const img = await loadImage(opts.signaturePng);
    const maxSW = third - 24;
    const maxSH = 108;
    const r = Math.min(maxSW / Math.max(img.width, 1), maxSH / Math.max(img.height, 1), 1);
    const dw = Math.max(70, img.width * r);
    const dh = Math.max(32, img.height * r);
    const sx = MARGIN + 12;
    const sy = sigTop + 36;
    c2.drawImage(img, sx, sy, dw, dh);
  } else {
    c2.fillStyle = '#94a3b8';
    c2.font = `600 11px ${FONT}`;
    c2.fillText('טרם נחתם', MARGIN + third - 16, sigTop + 80);
  }

  const jpegs: PdfPage[] = [
    { jpeg: await canvasToJpeg(page1), widthPx: PAGE_W, heightPx: PAGE_H },
    { jpeg: await canvasToJpeg(page2), widthPx: PAGE_W, heightPx: PAGE_H },
  ];
  const pdf = wrapJpegsAsPdf(jpegs);
  return new File([pdf], opts.signaturePng ? 'טופס-הודעה-על-תאונת-רכב-חתום.pdf' : 'טופס-הודעה-על-תאונת-רכב.pdf', { type: 'application/pdf' });
}

export async function buildInsurancePackageSummaryPdf(opts: {
  claimId: string;
  clientName: string;
  clientPhone: string;
  clientId?: string;
  plate: string;
  carModel?: string;
  claimKind: string;
  insCompany?: string;
  policyNum?: string;
  claimNum?: string;
  eventDate?: string;
  eventDesc?: string;
  documents: Array<{ title: string; category: string; source: string; createdAt?: string; fileName?: string }>;
  missingDocs?: string[];
  extraPagesJpegs?: Array<{ title: string; dataUrl: string }>;
}): Promise<File> {
  await readyHebrewFont();
  const inner = PAGE_W - MARGIN * 2;
  const col = (n: number, i: number, gap = 4) => {
    const w = (inner - gap * (n - 1)) / n;
    return { x: MARGIN + (n - 1 - i) * (w + gap), w };
  };
  const nowHe = new Date().toLocaleString('he-IL', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  const paintHeader = (ctx: CanvasRenderingContext2D, pageNo: number, totalPages: number) => {
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(MARGIN - 6, 18, PAGE_W - (MARGIN - 6) * 2, PAGE_H - 40);
    ctx.strokeStyle = '#1e3a5f';
    ctx.lineWidth = 2;
    ctx.strokeRect(MARGIN - 6, 18, PAGE_W - (MARGIN - 6) * 2, PAGE_H - 40);
    ctx.fillStyle = '#1e3a5f';
    ctx.fillRect(MARGIN - 6, 18, PAGE_W - (MARGIN - 6) * 2, 54);

    const logoX = PAGE_W - MARGIN - 36;
    const logoY = 26;
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(logoX, logoY, 36, 36);
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(logoX, logoY, 36, 36);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.font = `900 22px ${FONT}`;
    ctx.fillText('ד', logoX + 18, logoY + 26);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.direction = 'ltr';
    ctx.font = `800 20px ${FONT}`;
    ctx.fillText('דליה – תביעת רכב  |  תיק תביעה מלא לחברת הביטוח', logoX - 12, 42);
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(`מספר תיק דליה: ${opts.claimId}  ·  סוג תביעה: ${opts.claimKind || 'הפעלת פוליסה'}`, logoX - 12, 61);

    ctx.textAlign = 'left';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(`הופק: ${nowHe}`, MARGIN + 6, 42);
    ctx.fillText(`רכב: ${opts.plate || '—'}`, MARGIN + 6, 61);

    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`דליה – תביעת רכב · חבילת תביעה ${opts.claimId} · עמ׳ ${pageNo} מתוך ${totalPages}`, PAGE_W / 2, PAGE_H - 10);
    ctx.textAlign = 'right';
  };

  const extraImgs: Array<{ title: string; img: HTMLImageElement }> = [];
  if (opts.extraPagesJpegs?.length) {
    for (const item of opts.extraPagesJpegs) {
      try {
        const img = await loadImage(item.dataUrl);
        extraImgs.push({ title: item.title, img });
      } catch {
        /* ignore non-image attachment */
      }
    }
  }

  const totalPages = 1 + extraImgs.length;
  const page1 = document.createElement('canvas');
  page1.width = PAGE_W;
  page1.height = PAGE_H;
  const c1 = page1.getContext('2d');
  if (!c1) throw new Error('canvas');
  paintHeader(c1, 1, totalPages);

  let y = 80;
  y = sectionHead(c1, MARGIN, y, inner, '1', 'פרטי התיק, המבוטח והרכב');
  let a = col(3, 0); cell(c1, a.x, y, a.w, 36, 'מספר תיק דליה', opts.claimId);
  a = col(3, 1); cell(c1, a.x, y, a.w, 36, 'סוג התביעה', opts.claimKind || 'הפעלת פוליסה');
  a = col(3, 2); cell(c1, a.x, y, a.w, 36, 'תאריך אירוע', opts.eventDate || '—');
  y += 36;
  a = col(3, 0); cell(c1, a.x, y, a.w, 36, 'שם הלקוח / המבוטח', opts.clientName);
  a = col(3, 1); cell(c1, a.x, y, a.w, 36, 'טלפון נייד', opts.clientPhone);
  a = col(3, 2); cell(c1, a.x, y, a.w, 36, 'מס׳ ת.ז.', opts.clientId || '—');
  y += 36;
  a = col(3, 0); cell(c1, a.x, y, a.w, 36, 'מספר רישוי', opts.plate);
  a = col(3, 1); cell(c1, a.x, y, a.w, 36, 'דגם רכב', opts.carModel || '—');
  a = col(3, 2); cell(c1, a.x, y, a.w, 36, 'חברת ביטוח / פוליסה', [opts.insCompany, opts.policyNum, opts.claimNum].filter(Boolean).join(' · ') || '—');
  y += 40;
  if (opts.eventDesc) {
    para(c1, MARGIN, y, inner, 64, 'תיאור האירוע והנזק', opts.eventDesc);
    y += 70;
  }

  y = sectionHead(c1, MARGIN, y, inner, '2', `תוכן עניינים — מסמכי תיק התביעה (${opts.documents.length} קבצים)`);
  const rowH = 28;
  opts.documents.slice(0, 18).forEach((doc, idx) => {
    box(c1, MARGIN, y, inner, rowH, idx % 2 === 0 ? '#ffffff' : '#f8fafc');
    c1.fillStyle = '#1e3a5f';
    c1.textAlign = 'right';
    c1.font = `700 11px ${FONT}`;
    c1.fillText(`${idx + 1}. ${doc.title}`, PAGE_W - MARGIN - 8, y + 18);
    c1.fillStyle = '#475569';
    c1.textAlign = 'left';
    c1.font = `600 10px ${FONT}`;
    c1.fillText(`${doc.category}  |  ${doc.fileName || ''}`, MARGIN + 8, y + 18);
    y += rowH;
  });

  if (opts.missingDocs && opts.missingDocs.length > 0) {
    y += 10;
    box(c1, MARGIN, y, inner, 44, '#fffbeb');
    c1.fillStyle = '#b45309';
    c1.textAlign = 'right';
    c1.font = `700 11px ${FONT}`;
    c1.fillText(`הערה — מסמכים שטרם התקבלו: ${opts.missingDocs.join(', ')}`, PAGE_W - MARGIN - 8, y + 26);
  }

  const pages: PdfPage[] = [{ jpeg: await canvasToJpeg(page1), widthPx: PAGE_W, heightPx: PAGE_H }];

  for (let i = 0; i < extraImgs.length; i++) {
    const item = extraImgs[i];
    const pg = document.createElement('canvas');
    pg.width = PAGE_W;
    pg.height = PAGE_H;
    const ctx = pg.getContext('2d');
    if (!ctx) continue;
    paintHeader(ctx, i + 2, totalPages);
    let py = 80;
    py = sectionHead(ctx, MARGIN, py, inner, `נספח ${i + 1}`, item.title);
    const availW = inner - 16;
    const availH = PAGE_H - py - 50;
    const scale = Math.min(availW / Math.max(item.img.width, 1), availH / Math.max(item.img.height, 1), 1);
    const dw = item.img.width * scale;
    const dh = item.img.height * scale;
    const dx = MARGIN + (inner - dw) / 2;
    const dy = py + 12;
    ctx.drawImage(item.img, dx, dy, dw, dh);
    pages.push({ jpeg: await canvasToJpeg(pg), widthPx: PAGE_W, heightPx: PAGE_H });
  }

  const pdfBytes = wrapJpegsAsPdf(pages);
  return new File([pdfBytes], `תיק-תביעה-מלא-${opts.claimId}.pdf`, { type: 'application/pdf' });
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
