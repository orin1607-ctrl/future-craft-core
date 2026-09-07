/**
 * Client-side opening-form PDF using canvas → JPEG → minimal PDF.
 * Existing claims-docs / claims-intake upload path. No new library or schema.
 */
import type { IntakeDraft } from './claimIntakeModel';

function wrapJpegAsPdf(jpeg: Uint8Array, widthPx: number, heightPx: number): Uint8Array {
  const pageW = 595;
  const pageH = Math.max(200, Math.round((heightPx / widthPx) * pageW));
  const stream = jpeg;
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const pushStr = (s: string) => chunks.push(encoder.encode(s));

  pushStr("%PDF-1.4\n");
  const off: number[] = [0];
  const pos = () => chunks.reduce((n, c) => n + c.length, 0);

  off.push(pos());
  pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  off.push(pos());
  pushStr("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  off.push(pos());
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  off.push(pos());
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${stream.length} >>\nstream\n`,
  );
  chunks.push(stream);
  pushStr("\nendstream\nendobj\n");
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  off.push(pos());
  pushStr(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  const xrefAt = pos();
  pushStr(`xref\n0 6\n0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) {
    pushStr(`${String(off[i]).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

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
  const d = opts.draft || ({} as IntakeDraft);
  const W = 794;
  const margin = 40;
  const maxW = W - margin * 2;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('canvas');

  type Block = { kind: 'h' | 'kv' | 'p' | 'sig'; text: string; extra?: string };
  const blocks: Block[] = [];
  const h = (t: string) => blocks.push({ kind: 'h', text: t });
  const kv = (k: string, v: string | undefined) => blocks.push({ kind: 'kv', text: `${k}: ${v || '—'}` });
  const p = (t: string) => blocks.push({ kind: 'p', text: t });

  h(opts.signaturePng ? 'טופס אירוע / פתיחת תביעה — חתום' : 'טופס אירוע / פתיחת תביעה');
  kv('מספר תביעה', opts.claimNum || d.claimNum || 'טרם התקבל');
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
  blocks.push({ kind: 'sig', text: opts.signaturePng ? 'חתימה:' : 'חתימה: טרם נחתם' });

  measure.font = '16px Arial, sans-serif';
  let y = 56;
  for (const b of blocks) {
    if (b.kind === 'h') y += 36;
    else if (b.kind === 'sig') y += opts.signaturePng ? 200 : 28;
    else {
      measure.font = b.kind === 'p' ? '15px Arial, sans-serif' : '16px Arial, sans-serif';
      y += wrapLines(measure, b.text, maxW).length * 24 + 4;
    }
  }
  const H = Math.max(1123, y + 60);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111111';
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';

  let cy = 56;
  for (const b of blocks) {
    if (b.kind === 'h') {
      cy += 18;
      ctx.font = 'bold 20px Arial, sans-serif';
      ctx.fillStyle = '#1d4ed8';
      ctx.fillText(b.text, W - margin, cy);
      ctx.fillStyle = '#111111';
      cy += 18;
      continue;
    }
    if (b.kind === 'sig') {
      ctx.font = 'bold 16px Arial, sans-serif';
      ctx.fillText(b.text, W - margin, cy);
      cy += 8;
      if (opts.signaturePng) {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const maxSW = 360;
            const maxSH = 160;
            const r = Math.min(maxSW / img.width, maxSH / img.height, 1);
            ctx.strokeStyle = '#d4d4d4';
            ctx.strokeRect(W - margin - img.width * r - 8, cy, img.width * r + 8, img.height * r + 8);
            ctx.drawImage(img, W - margin - img.width * r, cy + 4, img.width * r, img.height * r);
            cy += img.height * r + 24;
            resolve();
          };
          img.onerror = () => reject(new Error('signature image'));
          img.src = opts.signaturePng!;
        });
      } else {
        cy += 20;
      }
      continue;
    }
    ctx.font = b.kind === 'p' ? '15px Arial, sans-serif' : '16px Arial, sans-serif';
    for (const line of wrapLines(ctx, b.text, maxW)) {
      ctx.fillText(line, W - margin, cy);
      cy += 24;
    }
    cy += 4;
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('jpeg'))), 'image/jpeg', 0.86);
  });
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const pdf = wrapJpegAsPdf(jpeg, W, H);
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
