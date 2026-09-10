/**
 * Formal Hebrew letter/affidavit PDF. Canvas → JPEG → minimal PDF.
 * Same technique as signedClaimPdf.ts. No new library. Stored via claims-docs.
 */
const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 48;
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
  for (let i = 1; i <= objCount; i++) pushStr(`${String(off[i]).padStart(10, '0')} 00000 n \n`);
  pushStr(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
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
    }
    if (document.fonts?.ready) await document.fonts.ready;
  } catch { /* fallback fonts */ }
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
    }, 'image/jpeg', 0.92);
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const raw = String(text || '').replace(/\r/g, '');
  const out: string[] = [];
  for (const para of raw.split('\n')) {
    const words = para.trim() ? para.split(/\s+/) : [''];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

export type LetterPdfOpts = {
  title?: string;
  date: string;
  to: string;
  subject: string;
  body: string;
  clientName?: string;
  claimNum?: string;
  plate?: string;
  signaturePng?: string;
  fileName?: string;
};

export async function buildLetterPdf(opts: LetterPdfOpts): Promise<File> {
  await readyHebrewFont();
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');

  ctx.fillStyle = '#f7f4ee';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(MARGIN - 10, 28, PAGE_W - (MARGIN - 10) * 2, PAGE_H - 56);
  ctx.strokeStyle = '#1e3a5f';
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN - 10, 28, PAGE_W - (MARGIN - 10) * 2, PAGE_H - 56);

  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(MARGIN - 10, 28, PAGE_W - (MARGIN - 10) * 2, 58);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.direction = 'ltr';
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText('דליה ניהול תביעות', PAGE_W - MARGIN, 52);
  ctx.font = `600 11px ${FONT}`;
  ctx.fillText(opts.title || 'מסמך רשמי', PAGE_W - MARGIN, 72);

  ctx.fillStyle = '#0f172a';
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(`תאריך: ${opts.date || '—'}`, PAGE_W - MARGIN, 112);

  let y = 140;
  ctx.font = `700 13px ${FONT}`;
  ctx.fillText('לכבוד', PAGE_W - MARGIN, y);
  y += 22;
  ctx.font = `500 13px ${FONT}`;
  ctx.fillText(opts.to || '—', PAGE_W - MARGIN, y);
  y += 32;

  ctx.font = `700 13px ${FONT}`;
  ctx.fillText(`הנדון: ${opts.subject || '—'}`, PAGE_W - MARGIN, y);
  y += 18;
  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(PAGE_W - MARGIN, y);
  ctx.stroke();
  y += 24;

  const details = [
    opts.clientName ? `לקוח: ${opts.clientName}` : '',
    opts.claimNum ? `מס׳ תביעה: ${opts.claimNum}` : '',
    opts.plate ? `רכב: ${opts.plate}` : '',
  ].filter(Boolean);
  if (details.length) {
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(MARGIN, y, PAGE_W - MARGIN * 2, 28 + details.length * 18);
    ctx.fillStyle = '#334155';
    ctx.font = `600 12px ${FONT}`;
    details.forEach((d, i) => ctx.fillText(d, PAGE_W - MARGIN - 8, y + 22 + i * 18));
    y += 40 + details.length * 18;
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = `500 13px ${FONT}`;
  const lines = wrapLines(ctx, opts.body, PAGE_W - MARGIN * 2 - 8);
  const maxBody = Math.floor((PAGE_H - 260 - y) / 20);
  lines.slice(0, Math.max(8, maxBody)).forEach((ln) => {
    ctx.fillText(ln || ' ', PAGE_W - MARGIN, y);
    y += 20;
  });

  const sigTop = Math.max(y + 24, PAGE_H - 210);
  ctx.strokeStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(MARGIN, sigTop + 110);
  ctx.lineTo(MARGIN + 220, sigTop + 110);
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = `600 11px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('חתימה', MARGIN + 220, sigTop + 128);
  if (opts.signaturePng) {
    const img = await loadImage(opts.signaturePng);
    const maxW = 200;
    const maxH = 90;
    const r = Math.min(maxW / Math.max(img.width, 1), maxH / Math.max(img.height, 1), 1);
    ctx.drawImage(img, MARGIN + 10, sigTop + 8, img.width * r, img.height * r);
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 12px ${FONT}`;
    ctx.fillText('מקום לחתימה', MARGIN + 200, sigTop + 70);
  }

  const pdf = wrapJpegsAsPdf([{ jpeg: await canvasToJpeg(canvas), widthPx: PAGE_W, heightPx: PAGE_H }]);
  const name = opts.fileName || (opts.signaturePng ? 'מסמך-חתום.pdf' : 'מסמך-בקשה.pdf');
  return new File([pdf], name, { type: 'application/pdf' });
}
