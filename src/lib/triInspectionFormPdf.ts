/**
 * Download the existing tri/semi inspection as a PDF.
 * Same fields, status stamp and signature as the inspection card. No new form text.
 */
import whiteLogo from '@/assets/white-logo.png';
import { supabase } from '@/integrations/supabase/client';
import {
  assembleTriInspectionForm,
  canDownloadTriForm,
  type TriInspectionFormModel,
  type TriFormSource,
} from '@/lib/triInspectionFormModel';

const PAGE_W = 794;
const PAGE_H = 1123;
const MARGIN = 36;
const BOTTOM = 46;
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
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

async function readyHebrewFont() {
  try {
    if (!document.getElementById('tri-form-heebo')) {
      const link = document.createElement('link');
      link.id = 'tri-form-heebo';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap';
      document.head.appendChild(link);
    }
    if (document.fonts?.load) {
      await document.fonts.load(`400 13px ${FONT}`);
      await document.fonts.load(`800 20px ${FONT}`);
    }
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* system Hebrew fonts remain available */
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('jpeg'));
        return;
      }
      void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
    }, 'image/jpeg', 0.92);
  });
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(text || '').replace(/\r/g, '').split('\n')) {
    const words = para.trim() ? para.split(/\s+/) : [''];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

function drawStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, label: string, passed: boolean) {
  const color = passed ? '#166534' : '#b91c1c';
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 42, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 36, 0, Math.PI * 2);
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.direction = 'ltr';
  ctx.font = `800 13px ${FONT}`;
  ctx.fillText('דליה', cx, cy - 2);
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(label, cx, cy + 16);
  ctx.restore();
}

interface Sheet {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  y: number;
}

function openSheet(form: TriInspectionFormModel, logo: HTMLImageElement | null, pageNo: number): Sheet {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 2;
  ctx.strokeRect(12, 12, PAGE_W - 24, PAGE_H - 24);
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(14, 14, PAGE_W - 28, 64);
  if (logo) ctx.drawImage(logo, 28, 20, 110, 50);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'right';
  ctx.direction = 'ltr';
  ctx.font = `800 20px ${FONT}`;
  ctx.fillText('טופס בדיקה תלת / חצי', PAGE_W - MARGIN, 40);
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(form.title, PAGE_W - MARGIN, 62);
  drawStamp(ctx, 78, 132, form.stamp, form.passed);
  ctx.fillStyle = '#64748b';
  ctx.font = `600 11px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(String(pageNo), MARGIN, PAGE_H - 24);
  ctx.textAlign = 'right';
  ctx.fillText(form.fileName.replace(/\.pdf$/, ''), PAGE_W - MARGIN, PAGE_H - 24);
  return { canvas, ctx, y: 188 };
}

export async function buildTriInspectionFormPdf(source: TriFormSource): Promise<File> {
  await readyHebrewFont();
  const form = assembleTriInspectionForm(source);
  const [logo, signature] = await Promise.all([
    loadImage(whiteLogo),
    form.signatureSrc ? loadImage(form.signatureSrc) : Promise.resolve(null),
  ]);
  if (form.signatureSrc && !signature) {
    throw new Error('signature');
  }

  const sheets: Sheet[] = [];
  let sheet = openSheet(form, logo, 1);
  sheets.push(sheet);
  const right = PAGE_W - MARGIN;
  const innerW = PAGE_W - MARGIN * 2;

  const need = (height: number) => {
    if (sheet.y + height <= PAGE_H - BOTTOM) return;
    sheet = openSheet(form, logo, sheets.length + 1);
    sheets.push(sheet);
  };

  const heading = (text: string) => {
    need(34);
    const ctx = sheet.ctx;
    ctx.fillStyle = '#1e3a8a';
    ctx.textAlign = 'right';
    ctx.direction = 'ltr';
    ctx.font = `800 15px ${FONT}`;
    ctx.fillText(text, right, sheet.y);
    sheet.y += 8;
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(MARGIN, sheet.y);
    ctx.lineTo(right, sheet.y);
    ctx.stroke();
    sheet.y += 16;
  };

  const paragraph = (label: string, text: string) => {
    const ctx = sheet.ctx;
    ctx.font = `600 13px ${FONT}`;
    const lines = wrapLines(ctx, text || '—', innerW - 8);
    need(22 + lines.length * 18);
    ctx.fillStyle = '#64748b';
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(label, right, sheet.y);
    sheet.y += 18;
    ctx.fillStyle = '#0f172a';
    ctx.font = `500 13px ${FONT}`;
    lines.forEach((line) => {
      ctx.fillText(line || ' ', right, sheet.y);
      sheet.y += 18;
    });
    sheet.y += 6;
  };

  heading('פרטי הביקורת');
  for (let i = 0; i < form.fields.length; i += 2) {
    need(46);
    const pair = form.fields.slice(i, i + 2);
    pair.forEach((field, index) => {
      const x = index === 0 ? right : right - innerW / 2;
      sheet.ctx.fillStyle = '#64748b';
      sheet.ctx.font = `600 11px ${FONT}`;
      sheet.ctx.textAlign = 'right';
      sheet.ctx.fillText(field.label, x, sheet.y);
      sheet.ctx.fillStyle = '#0f172a';
      sheet.ctx.font = `700 14px ${FONT}`;
      sheet.ctx.fillText(field.value, x, sheet.y + 18);
    });
    sheet.y += 42;
  }

  if (form.signatureSrc && signature) {
    heading('חתימת קצין הרכב');
    need(128);
    const top = sheet.y;
    sheet.ctx.strokeStyle = '#1e3a8a';
    sheet.ctx.lineWidth = 1.5;
    sheet.ctx.strokeRect(MARGIN, top, innerW, 112);
    const maxW = 240;
    const maxH = 84;
    const ratio = Math.min(maxW / Math.max(signature.width, 1), maxH / Math.max(signature.height, 1), 1);
    const w = signature.width * ratio;
    const h = signature.height * ratio;
    sheet.ctx.drawImage(signature, right - w - 12, top + 14, w, h);
    if (form.inspectorName) {
      sheet.ctx.fillStyle = '#334155';
      sheet.ctx.font = `600 12px ${FONT}`;
      sheet.ctx.textAlign = 'right';
      sheet.ctx.fillText(form.inspectorName, right - 12, top + 104);
    }
    sheet.y = top + 124;
  }

  heading(form.notes.length ? `הערות הביקורת (${form.notes.length})` : 'הערות הביקורת');
  if (form.notes.length === 0) paragraph('הערות', 'לא נרשמו הערות בביקורת זו');
  form.notes.forEach((note) => paragraph(note.label, note.text));

  if (form.defects.length) {
    heading(`תקלות שסומנו (${form.defects.length})`);
    form.defects.forEach((defect) => paragraph(defect.label, defect.text));
  }

  heading('סעיפי הבדיקה');
  if (form.items.length === 0) {
    paragraph('סעיפים', 'אין סעיפי בדיקה שמורים לביקורת זו');
  } else {
    form.items.forEach((item, index) => {
      const ctx = sheet.ctx;
      ctx.font = `500 12px ${FONT}`;
      const noteLines = item.text ? wrapLines(ctx, item.text, innerW - 220) : [];
      const rowH = Math.max(28, 16 + noteLines.length * 16);
      need(rowH + 4);
      ctx.fillStyle = index % 2 === 0 ? '#f8fafc' : '#ffffff';
      ctx.fillRect(MARGIN, sheet.y - 14, innerW, rowH);
      ctx.fillStyle = '#0f172a';
      ctx.font = `700 13px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(item.label, right - 4, sheet.y);
      ctx.fillStyle = form.itemResult[index] === 'ליקוי' ? '#b91c1c' : '#166534';
      ctx.font = `700 12px ${FONT}`;
      ctx.fillText(form.itemResult[index] || '—', right - 250, sheet.y);
      ctx.fillStyle = '#334155';
      ctx.font = `500 12px ${FONT}`;
      noteLines.forEach((line, lineIndex) => {
        ctx.fillText(line, right - 320, sheet.y + lineIndex * 16);
      });
      sheet.y += rowH;
    });
    sheet.y += 8;
  }

  if (form.tasks.length) {
    heading('משימות טיפול שנפתחו מהביקורת');
    form.tasks.forEach((task) => paragraph(task.label, task.text));
  }

  const pdf = wrapJpegsAsPdf(await Promise.all(sheets.map(async (page) => ({
    jpeg: await canvasToJpeg(page.canvas),
    widthPx: PAGE_W,
    heightPx: PAGE_H,
  }))));
  return new File([pdf], form.fileName, { type: 'application/pdf' });
}

function savePdfFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const DIGITAL_SIGNATURE_ITEM = '__digital_signature__';

function signatureFromItems(items: Array<{ item_name?: string | null; notes?: string | null }> | null | undefined): string {
  const match = (items || []).find((item) => item?.item_name === DIGITAL_SIGNATURE_ITEM);
  return String(match?.notes || '').trim();
}

function checklistWithoutSignature<T extends { item_name?: string | null }>(items: T[] | null | undefined): T[] {
  return (items || []).filter((item) => item?.item_name !== DIGITAL_SIGNATURE_ITEM);
}

function documentsStoragePath(urlOrPath: string): string | null {
  const raw = urlOrPath.trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '');
  const match = raw.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/documents\/([^?]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function readableSignature(src: string): Promise<string> {
  const value = src.trim();
  if (!value || value.startsWith('data:image/')) return value;
  const direct = /^https?:/i.test(value) ? value : '';
  const path = documentsStoragePath(value);
  if (path) {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 900);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return direct;
}

export async function downloadTriInspectionForm(inspectionId: string): Promise<File> {
  const id = String(inspectionId || '').trim();
  if (!id) throw new Error('missing inspection');
  const { data, error } = await supabase
    .from('vehicle_inspections')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || 'not found');
  if (!canDownloadTriForm(data.inspection_type)) throw new Error('not tri form');

  const [itemsRes, tasksRes, vehicleRes] = await Promise.all([
    supabase.from('inspection_items').select('item_name,status,notes').eq('inspection_id', id),
    supabase.from('vehicle_tasks').select('title,description,status').eq('inspection_id', id).order('created_at', { ascending: false }),
    data.vehicle_id
      ? supabase.from('vehicles').select('internal_number,year').eq('id', data.vehicle_id).maybeSingle()
      : Promise.resolve({ data: null as { internal_number?: string | null; year?: number | string | null } | null }),
  ]);

  const items = checklistWithoutSignature(itemsRes.data || []);
  const row = data as { signature_url?: string | null; notes?: string | null };
  let signatureSrc = signatureFromItems(itemsRes.data || []);
  if (!signatureSrc) signatureSrc = String(row.signature_url || '').trim();
  if (!signatureSrc) {
    const embedded = String(row.notes || '').match(/data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+/i);
    signatureSrc = embedded?.[0] || '';
  }
  signatureSrc = await readableSignature(signatureSrc);

  const file = await buildTriInspectionFormPdf({
    plate: data.vehicle_plate || '',
    internalNumber: vehicleRes.data?.internal_number,
    year: vehicleRes.data?.year,
    inspectionDate: data.inspection_date,
    nextDueDate: data.next_due_date,
    inspectorName: data.inspector_name,
    overallStatus: data.overall_status,
    notes: data.notes,
    signatureSrc,
    items: items as TriFormSource['items'],
    tasks: (tasksRes.data || []) as TriFormSource['tasks'],
  });
  savePdfFile(file);
  return file;
}
