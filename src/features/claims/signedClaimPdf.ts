/**
 * Client-side opening-form PDF using canvas → JPEG → minimal PDF.
 * Existing claims-docs / claims-intake upload path. No new library or schema.
 *
 * Mobile Safari + `direction:rtl` + `textAlign:right` at x=width-margin
 * draws Hebrew off the canvas, so the saved page looked like signature-only.
 * Draw LTR with right-aligned text so every field stays on the page.
 */
import type { IntakeDraft } from './claimIntakeModel';

const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 40;
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
  return v || '—';
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const raw = String(text || '—').replace(/\s+/g, ' ').trim() || '—';
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
      await document.fonts.load(`400 16px ${FONT}`);
      await document.fonts.load(`700 20px ${FONT}`);
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
    }, 'image/jpeg', 0.88);
  });
}

type Block = { kind: 'h' | 'kv' | 'p' | 'sig'; text: string };

export async function buildSignedOpeningFormPdf(opts: {
  clientName: string;
  plate: string;
  eventDate: string;
  eventLocation: string;
  eventDesc: string;
  signaturePng?: string;
  claimNum?: string;
  draft?: IntakeDraft;
}): Promise<File> {
  await readyHebrewFont();
  const d = opts.draft || ({} as IntakeDraft);
  const claimNum = opts.claimNum || d.claimNum || 'טרם התקבל';
  const maxW = PAGE_W - MARGIN * 2;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('canvas');
  measure.font = `16px ${FONT}`;

  const blocks: Block[] = [];
  const h = (t: string) => blocks.push({ kind: 'h', text: t });
  const kv = (k: string, v: string | undefined) => blocks.push({ kind: 'kv', text: `${k}: ${v || '—'}` });
  const p = (t: string) => blocks.push({ kind: 'p', text: t });

  h(opts.signaturePng ? 'טופס אירוע / פתיחת תביעה — חתום' : 'טופס אירוע / פתיחת תביעה');
  kv('מספר תביעה', claimNum);
  kv('סוג התביעה', d.claimKind || '—');

  h('הלקוח / המבוטח');
  kv('שם לקוח', opts.clientName || d.clientName);
  kv('ת״ז / ח.פ.', d.clientId);
  kv('טלפון', d.clientPhone);
  kv('דוא״ל', d.clientEmail);
  kv('כתובת', d.clientAddress);
  kv('מיקוד', d.clientZip);

  h('הרכב');
  kv('מספר רכב', opts.plate || d.plate);
  kv('יצרן', d.carMake);
  kv('דגם', d.carModel);
  kv('שנת ייצור', d.carYear);
  kv('סוג הרכב', d.carType);

  h('ביטוח');
  kv('חברת ביטוח', d.insCompany);
  kv('סוג ביטוח', d.insType);
  kv('מספר פוליסה', d.policyNum);
  kv('מספר תביעה בחברת הביטוח', d.claimNum);

  if (d.driverDifferent === 'true' || d.driverName) {
    h('פרטי הנהג');
    kv('הנהג שונה מהלקוח', yesNo(d.driverDifferent));
    kv('שם נהג', d.driverName);
    kv('ת״ז נהג', d.driverId);
    kv('טלפון נהג', d.driverPhone);
    kv('מספר רישיון', d.driverLicense);
    kv('סוג רישיון', d.driverLicenseType);
    kv('תוקף רישיון', d.driverLicenseValid);
    kv('שנת הוצאת רישיון', d.driverLicenseYear);
    kv('תאריך לידה', d.driverBirthDate);
    kv('מין', d.driverGender);
    kv('נהג ברשות המבוטח', yesNo(d.driverPermission));
  }

  h('פרטי האירוע');
  kv('תאריך אירוע', opts.eventDate || d.eventDate);
  kv('שעת אירוע', d.eventTime);
  kv('מקום האירוע', opts.eventLocation || [d.eventPlace, d.eventCity, d.eventStreet].filter(Boolean).join(', '));
  kv('יישוב', d.eventCity);
  kv('רחוב', d.eventStreet);
  p(`תיאור האירוע: ${opts.eventDesc || d.eventDesc || '—'}`);
  p(`תיאור הנזק: ${d.damageDesc || '—'}`);
  kv('מיקום הנזק ברכב', d.damageLocation);
  kv('הייתה משטרה', yesNo(d.police));
  if (d.police === 'true') {
    kv('תחנת משטרה', d.policeStation);
    kv('מספר תיק משטרה', d.policeFile);
    kv('תאריך דיווח למשטרה', d.policeDate);
  }
  kv('היה גרר', yesNo(d.tow));
  p(`עדים: ${d.witnesses || '—'}`);

  if (d.claimKind === 'תביעת צד ג׳' || d.thirdDriver || d.thirdPlate) {
    h('צד ג׳');
    kv('נהג צד ג׳', d.thirdDriver);
    kv('בעל הרכב', d.thirdOwner);
    kv('ת״ז', d.thirdId);
    kv('טלפון', d.thirdPhone);
    kv('מספר רכב', d.thirdPlate);
    kv('יצרן / דגם', d.thirdMakeModel);
    kv('חברת ביטוח', d.thirdInsCompany);
    kv('פוליסה', d.thirdPolicy);
    kv('מספר תביעה', d.thirdClaimNum);
    p(`נזק לצד ג׳: ${d.thirdDamage || '—'}`);
  }

  h('הצהרה וחתימה');
  kv('הצהרה אושרה', yesNo(d.declarationAck));
  kv('הטופס מולא ע״י', d.formFilledBy);
  kv('קבלת הודעות — דוא״ל', yesNo(d.contactPrefEmail));
  kv('קבלת הודעות — נייד', yesNo(d.contactPrefMobile));
  kv('קבלת הודעות — דואר', yesNo(d.contactPrefPost));
  blocks.push({ kind: 'sig', text: opts.signaturePng ? 'חתימת הלקוח:' : 'חתימה: טרם נחתם' });

  const sigH = opts.signaturePng ? 188 : 36;
  const blockH = (b: Block) => {
    if (b.kind === 'h') return 34;
    if (b.kind === 'sig') return sigH;
    measure.font = b.kind === 'p' ? `15px ${FONT}` : `16px ${FONT}`;
    return wrapLines(measure, b.text, maxW).length * 22 + 6;
  };

  const pages: Block[][] = [[]];
  let used = 78;
  const bodyLimit = PAGE_H - 56;
  for (const b of blocks) {
    const need = blockH(b);
    if (used + need > bodyLimit && pages[pages.length - 1].length) {
      pages.push([]);
      used = 78;
    }
    pages[pages.length - 1].push(b);
    used += need;
  }

  const drawChrome = (ctx: CanvasRenderingContext2D, pageNo: number, pageCount: number) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(0, 0, PAGE_W, 46);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.direction = 'ltr';
    ctx.font = `700 16px ${FONT}`;
    ctx.fillText('דליה ניהול תביעות', PAGE_W - MARGIN, 30);
    ctx.textAlign = 'left';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(claimNum, MARGIN, 30);
    ctx.strokeStyle = '#dbe4f3';
    ctx.strokeRect(MARGIN - 10, 58, PAGE_W - (MARGIN - 10) * 2, PAGE_H - 86);
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(`עמ׳ ${pageNo} מתוך ${pageCount}`, PAGE_W / 2, PAGE_H - 18);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111111';
  };

  const paintPage = async (pageBlocks: Block[], pageNo: number, pageCount: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    drawChrome(ctx, pageNo, pageCount);
    let cy = 82;
    for (const b of pageBlocks) {
      if (b.kind === 'h') {
        ctx.font = `700 18px ${FONT}`;
        ctx.fillStyle = '#1d4ed8';
        ctx.textAlign = 'right';
        ctx.fillText(b.text, PAGE_W - MARGIN, cy + 16);
        ctx.strokeStyle = '#93c5fd';
        ctx.beginPath();
        ctx.moveTo(PAGE_W - MARGIN, cy + 22);
        ctx.lineTo(MARGIN, cy + 22);
        ctx.stroke();
        ctx.fillStyle = '#111111';
        cy += 34;
        continue;
      }
      if (b.kind === 'sig') {
        ctx.font = `700 15px ${FONT}`;
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'right';
        ctx.fillText(b.text, PAGE_W - MARGIN, cy + 14);
        cy += 22;
        if (opts.signaturePng) {
          const img = await loadImage(opts.signaturePng);
          const maxSW = 340;
          const maxSH = 140;
          const r = Math.min(maxSW / Math.max(img.width, 1), maxSH / Math.max(img.height, 1), 1);
          const dw = Math.max(80, img.width * r);
          const dh = Math.max(40, img.height * r);
          const x = PAGE_W - MARGIN - dw;
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(x - 6, cy, dw + 12, dh + 12);
          ctx.strokeStyle = '#94a3b8';
          ctx.strokeRect(x - 6, cy, dw + 12, dh + 12);
          ctx.drawImage(img, x, cy + 6, dw, dh);
          cy += dh + 20;
        }
        continue;
      }
      ctx.font = b.kind === 'p' ? `15px ${FONT}` : `16px ${FONT}`;
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'right';
      for (const line of wrapLines(ctx, b.text, maxW)) {
        ctx.fillText(line, PAGE_W - MARGIN, cy + 16);
        cy += 22;
      }
      cy += 6;
    }
    return canvasToJpeg(canvas);
  };

  const jpegs: PdfPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    jpegs.push({
      jpeg: await paintPage(pages[i], i + 1, pages.length),
      widthPx: PAGE_W,
      heightPx: PAGE_H,
    });
  }
  const pdf = wrapJpegsAsPdf(jpegs);
  return new File([pdf], opts.signaturePng ? 'טופס-אירוע-חתום.pdf' : 'טופס-אירוע.pdf', { type: 'application/pdf' });
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
