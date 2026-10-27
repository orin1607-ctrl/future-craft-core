/**
 * Claims-only document reading.
 * Text comes from the file bytes (PDF text or OCR), never from the file name.
 * Automatic reading stays off until a later approval. Recommendations are display-only.
 */
import {
  MIN_TEXT_CHARS,
  NOT_IN_DOC,
  analyzeDocumentText,
  linesOf,
  normalizeDocText,
  unreadableDocumentRead,
  type DocumentRead,
} from '../../../supabase/functions/_shared/claimDocumentAnalyze.ts';
import { readPdfTextLayer } from '../../../supabase/functions/_shared/claimPdfText.ts';

export {
  analyzeDocumentText,
  unreadableDocumentRead,
  type DocumentRead,
  type DocumentReadSource,
  type DocumentReadStatus,
} from '../../../supabase/functions/_shared/claimDocumentAnalyze.ts';

export const DOCUMENT_READ_AUTORUN = false;
export const OCR_CONFIDENCE_MIN = 50;

export function pendingDocumentRead(sha: string): Pick<DocumentRead, 'read_status' | 'read_sha'> {
  return { read_status: 'pending', read_sha: sha };
}

function asMeta(meta: Record<string, string> | null | undefined) {
  return meta && typeof meta === 'object' ? meta : {};
}

export function storedReadIfFresh(
  meta: Record<string, string> | null | undefined,
  sha: string,
): DocumentRead | null {
  const row = asMeta(meta);
  if (!sha || row.read_sha !== sha) return null;
  if (row.read_status !== 'ready' && row.read_status !== 'unreadable') return null;
  return row as DocumentRead;
}

export function belongsToClaim(read: Pick<DocumentRead, 'read_claim_id'>, claimId: string) {
  return Boolean(claimId) && read.read_claim_id === claimId;
}

function isPdf(mime: string, fileName: string) {
  return /pdf/i.test(mime) || /\.pdf$/i.test(fileName);
}

function isReadableImage(mime: string, fileName: string) {
  return /image\/(jpeg|png|webp)/i.test(mime) || /\.(jpe?g|png|webp)$/i.test(fileName);
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // In a real browser pdf.js needs its worker URL ("No GlobalWorkerOptions.workerSrc specified" otherwise).
  // Node and jsdom have no Worker and keep working without it.
  if (typeof Worker !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjs;
}

export async function readPdfText(bytes: Uint8Array) {
  return readPdfTextLayer(await loadPdfjs(), bytes);
}

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function pngChunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function adler32(data: Uint8Array) {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function zlibStore(data: Uint8Array) {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  const max = 65535;
  for (let offset = 0; offset < data.length; offset += max) {
    const slice = data.subarray(offset, Math.min(data.length, offset + max));
    const last = offset + max >= data.length;
    const header = new Uint8Array(5);
    header[0] = last ? 1 : 0;
    header[1] = slice.length & 255;
    header[2] = (slice.length >> 8) & 255;
    const nlen = (~slice.length) & 0xffff;
    header[3] = nlen & 255;
    header[4] = (nlen >> 8) & 255;
    parts.push(header, slice);
  }
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, adler32(data));
  parts.push(tail);
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function concatBytes(parts: Uint8Array[]) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Turns a PDF page image into a PNG the OCR engine can read. No new dependency. */
export function bitmapToPng(width: number, height: number, data: Uint8Array, kind: number) {
  const channels = kind === 3 ? 4 : kind === 1 ? 1 : 3;
  const colorType = kind === 3 ? 6 : kind === 1 ? 0 : 2;
  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  const pixels = data.subarray(0, stride * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    raw.set(pixels.subarray(y * stride, (y + 1) * stride), row + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return concatBytes([signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStore(raw)), pngChunk('IEND', new Uint8Array())]);
}

async function pageImages(page: { getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>; objs: { get: (name: string, cb: (img: { width: number; height: number; kind: number; data: Uint8Array }) => void) => void } }, paintImage: number) {
  const op = await page.getOperatorList();
  const out: Uint8Array[] = [];
  for (let i = 0; i < op.fnArray.length; i += 1) {
    if (op.fnArray[i] !== paintImage) continue;
    const name = String(op.argsArray[i]?.[0] || '');
    if (!name) continue;
    const img = await new Promise<{ width: number; height: number; kind: number; data: Uint8Array }>((resolve) => page.objs.get(name, resolve));
    if (!img?.width || !img?.height || !img.data) continue;
    out.push(bitmapToPng(img.width, img.height, img.data, img.kind));
  }
  return out;
}

async function renderPdfPages(bytes: Uint8Array, maxPages = 2): Promise<Array<Blob | Uint8Array>> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const out: Array<Blob | Uint8Array> = [];
  const count = Math.min(doc.numPages, maxPages);
  for (let i = 1; i <= count; i += 1) {
    const page = await doc.getPage(i);
    out.push(...await pageImages(page, pdfjs.OPS.paintImageXObject));
  }
  if (out.length || typeof document === 'undefined' || (typeof process !== 'undefined' && process.versions?.node)) return out;
  for (let i = 1; i <= count; i += 1) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) out.push(blob);
  }
  return out;
}

export function readFromOcrText(text: string, confidence: number, claimId: string, sha: string) {
  if (normalizeDocText(text).length < MIN_TEXT_CHARS) {
    return unreadableDocumentRead(claimId, sha, 'התמונה אינה קריאה. לא זוהו בה תווים.');
  }
  if (!Number.isFinite(confidence) || confidence < OCR_CONFIDENCE_MIN) {
    return unreadableDocumentRead(claimId, sha, 'זיהוי התווים לא ודאי. לא נשמרו פרטים מהמסמך.');
  }
  return analyzeDocumentText(text, 'ocr', claimId, sha);
}

/** Same heb+eng OCR stack the garage already uses. Called only when useBuiltinOcr is on. */
export async function recognizeClaimImagesDetailed(blobs: Array<Blob | Uint8Array>, mimeHint = 'image/png') {
  const { createWorker } = await import('tesseract.js');
  const nodeWorker = typeof process !== 'undefined' && process.versions?.node
    ? `${process.cwd()}/node_modules/tesseract.js/src/worker-script/node/index.js`
    : '';
  const options = nodeWorker
    ? { workerPath: nodeWorker, langPath: 'https://tessdata.projectnaptha.com/4.0.0' }
    : {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7/tesseract-core.wasm.js',
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
    };
  let worker;
  try {
    worker = await createWorker('heb+eng', 1, options);
  } catch {
    worker = await createWorker('eng', 1, options);
  }
  try {
    const parts: string[] = [];
    const scores: number[] = [];
    for (const blob of blobs) {
      const image = blob instanceof Uint8Array
        ? (nodeWorker ? Buffer.from(blob) : new Blob([blob], { type: mimeHint }))
        : blob;
      const result = await worker.recognize(image);
      if (result.data?.text) parts.push(result.data.text);
      const score = Number(result.data?.confidence);
      if (Number.isFinite(score)) scores.push(score);
    }
    const confidence = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    return { text: parts.join('\n'), confidence };
  } finally {
    await worker.terminate();
  }
}

export async function recognizeClaimImages(blobs: Array<Blob | Uint8Array>, mimeHint = 'image/png') {
  const found = await recognizeClaimImagesDetailed(blobs, mimeHint);
  return found.text;
}

export async function readClaimDocument(input: {
  bytes: Uint8Array;
  mimeType?: string;
  fileName?: string;
  claimId: string;
  sha256: string;
  existingMeta?: Record<string, string> | null;
  ocr?: (blobs: Array<Blob | Uint8Array>) => Promise<string>;
  useBuiltinOcr?: boolean;
}): Promise<DocumentRead> {
  const cached = storedReadIfFresh(input.existingMeta, input.sha256);
  if (cached && cached.read_claim_id === input.claimId) return cached;

  const mime = String(input.mimeType || '');
  const fileName = String(input.fileName || '');
  const sha = input.sha256;
  const claimId = input.claimId;
  const runOcr = async (blobs: Array<Blob | Uint8Array>, mimeHint: string) => {
    if (input.ocr) return input.ocr(blobs);
    if (input.useBuiltinOcr) return recognizeClaimImages(blobs, mimeHint);
    return '';
  };

  try {
    if (isPdf(mime, fileName)) {
      const pdfText = await readPdfText(input.bytes);
      if (normalizeDocText(pdfText).length >= MIN_TEXT_CHARS) {
        return analyzeDocumentText(pdfText, 'pdf_text', claimId, sha);
      }
      if (input.ocr) {
        const ocrText = await input.ocr([input.bytes]);
        if (normalizeDocText(ocrText).length >= MIN_TEXT_CHARS) return analyzeDocumentText(ocrText, 'ocr', claimId, sha);
        return unreadableDocumentRead(claimId, sha, 'ה-PDF אינו קריא. לא נמצא בו טקסט ולא התקבל זיהוי תווים.');
      }
      if (input.useBuiltinOcr) {
        const pages = await renderPdfPages(input.bytes);
        if (!pages.length) return unreadableDocumentRead(claimId, sha, 'לא ניתן להמיר את עמודי ה-PDF לתמונה.');
        const found = await recognizeClaimImagesDetailed(pages, 'image/png');
        return readFromOcrText(found.text, found.confidence, claimId, sha);
      }
      return unreadableDocumentRead(claimId, sha, 'ה-PDF אינו קריא. לא נמצא בו טקסט ולא התקבל זיהוי תווים.');
    }
    if (isReadableImage(mime, fileName)) {
      if (input.useBuiltinOcr && !input.ocr) {
        const found = await recognizeClaimImagesDetailed([input.bytes], mime || 'image/jpeg');
        return readFromOcrText(found.text, found.confidence, claimId, sha);
      }
      const ocrText = await runOcr([input.bytes], mime || 'image/jpeg');
      if (normalizeDocText(ocrText).length >= MIN_TEXT_CHARS) {
        return analyzeDocumentText(ocrText, 'ocr', claimId, sha);
      }
      return unreadableDocumentRead(claimId, sha, 'התמונה אינה קריאה. לא זוהו בה תווים.');
    }
    return unreadableDocumentRead(claimId, sha, 'סוג הקובץ אינו נתמך לקריאה בשלב הזה.');
  } catch {
    return unreadableDocumentRead(claimId, sha, 'לא ניתן לקרוא את הקובץ. לא נוצרו פרטים משוערים.');
  }
}

/** Raw text of a PDF or image (PDF text layer first, OCR fallback). Used to read parts invoices into a quote. */
export async function extractClaimDocumentText(input: {
  bytes: Uint8Array;
  mimeType?: string;
  fileName?: string;
}): Promise<{ text: string; source: 'pdf_text' | 'ocr' | 'none'; confidence: number }> {
  const mime = String(input.mimeType || '');
  const fileName = String(input.fileName || '');
  try {
    if (isPdf(mime, fileName)) {
      const pdfText = await readPdfText(input.bytes);
      if (normalizeDocText(pdfText).length >= MIN_TEXT_CHARS) return { text: pdfText, source: 'pdf_text', confidence: 100 };
      const pages = await renderPdfPages(input.bytes);
      if (!pages.length) return { text: '', source: 'none', confidence: 0 };
      const found = await recognizeClaimImagesDetailed(pages, 'image/png');
      return { text: found.text, source: 'ocr', confidence: found.confidence };
    }
    if (isReadableImage(mime, fileName)) {
      const found = await recognizeClaimImagesDetailed([input.bytes], mime || 'image/jpeg');
      return { text: found.text, source: 'ocr', confidence: found.confidence };
    }
  } catch {
    /* unreadable → empty text, the user fills the lines by hand */
  }
  return { text: '', source: 'none', confidence: 0 };
}

export function mergeDocumentRead(
  row: { id: string; claim_id: string; storage_path?: string; original_name?: string; doc_meta?: Record<string, string> | null },
  read: DocumentRead,
) {
  if (!row.id || !row.claim_id || read.read_claim_id !== row.claim_id) {
    return { ok: false as const, reason: 'claim_mismatch' as const };
  }
  const prev = row.doc_meta && typeof row.doc_meta === 'object' ? row.doc_meta : {};
  return {
    ok: true as const,
    row: {
      id: row.id,
      claim_id: row.claim_id,
      storage_path: row.storage_path,
      original_name: row.original_name,
      doc_meta: { ...prev, ...read },
    },
  };
}

function sourceLabel(source: string) {
  if (source === 'pdf_text') return 'טקסט מתוך ה-PDF';
  if (source === 'ocr') return 'OCR על הקובץ';
  return 'לא נמצא טקסט בקובץ';
}

export function documentReadCaption(meta: Record<string, string> | null | undefined) {
  const row = asMeta(meta);
  if (!row.read_status) return null;
  if (row.read_status === 'pending') {
    return {
      summary: 'סיכום: המסמך ממתין לקריאה.',
      details: 'פרטים: עדיין לא חולצו.',
      source: 'מקור: המסמך שמור, ללא ניתוח.',
    };
  }
  if (row.read_status === 'processing') {
    return {
      summary: 'סיכום: המסמך בעיבוד.',
      details: 'פרטים: עדיין לא חולצו.',
      source: 'מקור: המסמך שמור. אין עדיין תוצאה.',
    };
  }
  if (row.read_status === 'failed') {
    return {
      summary: `סיכום: ${row.read_summary || 'הקריאה נכשלה.'}`,
      details: 'פרטים: לא נשמרו.',
      source: 'מקור: לא חולץ טקסט. לא נוסף מידע שאינו בקובץ.',
    };
  }
  if (row.read_status === 'unreadable') {
    return {
      summary: `סיכום: ${row.read_summary || 'הקובץ אינו קריא.'}`,
      details: 'פרטים: לא חולצו, כי אין טקסט קריא.',
      source: 'מקור: הקובץ עצמו. לא נוסף מידע שאינו בקובץ.',
    };
  }
  const details = [
    row.read_doc_type ? `סוג ${row.read_doc_type}` : '',
    row.read_claim_nums ? `תביעה ${row.read_claim_nums}${row.read_claim_src ? ` (מקור: "${row.read_claim_src}")` : ''}` : '',
    row.read_plates ? `רכב ${row.read_plates}${row.read_plate_src ? ` (מקור: "${row.read_plate_src}")` : ''}` : '',
    row.read_dates ? `תאריכים ${row.read_dates}${row.read_date_src ? ` (מקור: "${row.read_date_src}")` : ''}` : '',
    row.read_amounts ? `סכומים ${row.read_amounts}${row.read_amount_src ? ` (מקור: "${row.read_amount_src}")` : ''}` : '',
    row.read_insurer_decision ? `החלטה ${row.read_insurer_decision}` : '',
    row.read_missing ? `חסר ${row.read_missing}` : '',
    row.read_recommendation || '',
  ].filter(Boolean).join(' · ');
  const evidence = row.read_evidence ? ` ציטוט: "${row.read_evidence}"` : '';
  return {
    summary: `סיכום: ${row.read_summary || 'נקרא מסמך.'}`,
    details: `פרטים: ${details}`,
    source: `מקור: ${sourceLabel(row.read_source)}.${evidence}`,
  };
}

function fieldAnswer(label: string, value: string, evidence: string, source: string) {
  const missing = !value || value.startsWith('לא ');
  const answer = missing
    ? `${label}: ${value || NOT_IN_DOC}.`
    : `${label}: ${value}.`;
  return {
    answer,
    source: evidence ? `${source}. ציטוט מהמסמך: "${evidence}"` : source,
  };
}

export function answerFromDocumentRead(question: string, read: Partial<DocumentRead>) {
  const source = sourceLabel(String(read.read_source || ''));
  if (read.read_status === 'pending') {
    return { answer: 'המסמך ממתין לקריאה ועדיין לא נותח. אי אפשר לענות מתוכו.', source: 'מקור: אין טקסט שמור.' };
  }
  if (read.read_status === 'processing') {
    return { answer: 'המסמך בעיבוד. אין עדיין תוצאה לקריאה.', source: 'מקור: אין טקסט שמור.' };
  }
  if (read.read_status === 'failed') {
    return { answer: 'הקריאה נכשלה. לא נשמרו פרטים מהמסמך.', source: 'מקור: לא חולץ טקסט. לא נוסף מידע שאינו בקובץ.' };
  }
  if (read.read_status !== 'ready') {
    return {
      answer: read.read_summary || 'הקובץ אינו קריא. לא מופיע בו טקסט שאפשר לצטט.',
      source: 'מקור: הקובץ עצמו. לא נוסף מידע שאינו בקובץ.',
    };
  }
  const q = String(question || '');
  const topics: Array<[RegExp, string, string, string]> = [
    [/סכום|amount|כמה/, 'סכום', String(read.read_amounts || ''), String(read.read_amount_src || read.read_evidence || '')],
    [/רכב|לוחית|plate/, 'מספר רכב', String(read.read_plates || ''), String(read.read_plate_src || read.read_evidence || '')],
    [/תאריך|date/, 'תאריך', String(read.read_dates || ''), String(read.read_date_src || read.read_evidence || '')],
    [/החלט|אושר|נדחה|decision/, 'החלטת מבטח', String(read.read_insurer_decision || ''), String(read.read_evidence || '')],
    [/חסר|missing/, 'מסמכים חסרים', String(read.read_missing || ''), String(read.read_evidence || '')],
    [/סוג|מה המסמך|document type/, 'סוג מסמך', String(read.read_doc_type || ''), String(read.read_evidence || '')],
    [/תביעה|claim/, 'מספר תביעה', String(read.read_claim_nums || ''), String(read.read_claim_src || read.read_evidence || '')],
  ];
  const topic = topics.find(([re]) => re.test(q));
  if (topic) return fieldAnswer(topic[1], topic[2], topic[3], source);
  const evidence = String(read.read_evidence || '');

  const text = String(read.read_text || '');
  const token = q.split(/\s+/).map((w) => w.trim()).find((w) => w.length >= 4 && text.includes(w));
  const sentence = token ? linesOf(text).find((line) => line.includes(token)) : '';
  if (sentence) {
    return { answer: sentence, source: `${source}. ציטוט מהמסמך: "${sentence}"` };
  }
  return { answer: 'הפרט לא מופיע במסמך.', source: evidence ? `${source}. ציטוט מהמסמך: "${evidence}"` : source };
}
