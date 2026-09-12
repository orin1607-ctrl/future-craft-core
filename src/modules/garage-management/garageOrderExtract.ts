/**
 * Read customer-order documents for garage cases.
 * Fields come from document text or real OCR only — never from the filename,
 * and never from the already-known garage_case customer.
 */
export type CustomerOrderExtractSource = 'pdf_text' | 'ocr' | 'none' | 'reading';

export type CustomerOrderFields = {
  order_number: string;
  case_ref: string;
  order_date: string;
};

export type CustomerOrderExtract = {
  source: CustomerOrderExtractSource;
  fields: CustomerOrderFields;
  note: string;
};

const EMPTY_FIELDS: CustomerOrderFields = {
  order_number: '',
  case_ref: '',
  order_date: '',
};

const MIN_TEXT_CHARS = 20;

function normalizeDocText(raw: string) {
  return String(raw || '')
    .replace(/\r/g, '\n')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[״"׳']/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labelPattern(label: string) {
  const escaped = escapeRe(label);
  if (/^[A-Za-z0-9. #'-]+$/.test(label)) {
    return `(?:^|[^A-Za-z])${escaped}(?=$|[^A-Za-z])`;
  }
  return escaped;
}

function captureLabeled(text: string, labels: string[], valueRe: RegExp) {
  const label = labels.map(labelPattern).join('|');
  const re = new RegExp(`(?:${label})\\s*[:.\\-]?\\s*(${valueRe.source})`, 'i');
  const match = text.match(re);
  return match?.[1] ? String(match[1]).trim() : '';
}

function normalizeDate(raw: string) {
  const v = String(raw || '').trim();
  const iso = v.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (iso) {
    return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  }
  const dmy = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!dmy) return '';
  const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
  return `${dmy[1].padStart(2, '0')}/${dmy[2].padStart(2, '0')}/${year}`;
}

export function extractCustomerOrderFields(text: string): CustomerOrderFields {
  const hay = normalizeDocText(text);
  if (!hay) return { ...EMPTY_FIELDS };

  const token = /[A-Za-z0-9][A-Za-z0-9\\/_.-]{1,24}/;
  const dateToken = /\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2}/;

  const order_number = captureLabeled(hay, [
    "מספר הזמנה",
    "מס' הזמנה",
    "מס הזמנה",
    'הזמנה מספר',
    "הזמנה מס'",
    'הזמנה מס',
    'order number',
    'order no',
    'order #',
    'po number',
    'p.o.',
    'p.o',
  ], token);

  const case_ref = captureLabeled(hay, [
    'מספר תיק / אסמכתא',
    'מספר תיק',
    "מס' תיק",
    'מס תיק',
    "תיק מס'",
    'תיק מספר',
    'מספר אסמכתא',
    'אסמכתא',
    'סימוכין',
    'מספר פניה',
    'מספר פנייה',
    'file number',
    'file no',
    'claim number',
    'claim no',
    'reference',
    'ref no',
  ], token);

  const labeledDate = captureLabeled(hay, [
    'תאריך הזמנה',
    'תאריך המסמך',
    'order date',
    'date',
    'תאריך',
  ], dateToken);

  return {
    order_number: order_number && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(order_number) ? order_number : '',
    case_ref: case_ref && !/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(case_ref) ? case_ref : '',
    order_date: normalizeDate(labeledDate),
  };
}

export function extractNote(source: CustomerOrderExtractSource, fields: CustomerOrderFields) {
  const found = [
    fields.order_number ? 'מספר הזמנה' : '',
    fields.case_ref ? 'מספר תיק / אסמכתא' : '',
    fields.order_date ? 'תאריך הזמנה' : '',
  ].filter(Boolean);
  if (source === 'reading') return 'קורא את המסמך (טקסט PDF או OCR)... לא נשמר לתיק עד אישור ושמירת הזמנה.';
  if (source === 'pdf_text') {
    return (found.length ? `חולץ מטקסט המסמך: ${found.join(', ')}.` : 'נקרא טקסט מה-PDF אך לא זוהו שדות. מלא ידנית.')
      + ' הלקוח כבר ידוע מהתיק ולא משתנה. לא נשמר לתיק עד אישור ושמירת הזמנה.';
  }
  if (source === 'ocr') {
    return (found.length ? `חולץ ב-OCR מהסריקה: ${found.join(', ')}.` : 'ה-OCR לא זיהה שדות. מלא ידנית.')
      + ' הלקוח כבר ידוע מהתיק ולא משתנה. לא נשמר לתיק עד אישור ושמירת הזמנה.';
  }
  return 'לא נמצא טקסט במסמך. מלא ידנית. לא משתמשים בשם הקובץ. הלקוח כבר ידוע מהתיק ולא משתנה.';
}

function isPdf(mime: string, fileName: string) {
  return /pdf/i.test(mime) || /\.pdf$/i.test(fileName);
}

function isImage(mime: string, fileName: string) {
  return /image\//i.test(mime) || /\.(jpe?g|png|webp|gif|bmp|tif{1,2})$/i.test(fileName);
}

async function loadPdfjs() {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

async function readPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await task.promise;
  const pages: string[] = [];
  const max = Math.min(doc.numPages, 4);
  for (let i = 1; i <= max; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => ('str' in item ? String(item.str || '') : ''))
      .join(' ');
    pages.push(line);
  }
  return pages.join('\n');
}

async function renderPdfPages(bytes: Uint8Array, maxPages = 2): Promise<Blob[]> {
  if (typeof document === 'undefined') return [];
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: bytes,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const out: Blob[] = [];
  const count = Math.min(doc.numPages, maxPages);
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

async function ocrBlobs(blobs: Array<Blob | Uint8Array>, mimeHint = 'image/png'): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const options = {
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
    for (const blob of blobs) {
      const image = blob instanceof Uint8Array
        ? new Blob([blob], { type: mimeHint })
        : blob;
      const result = await worker.recognize(image);
      if (result.data?.text) parts.push(result.data.text);
    }
    return parts.join('\n');
  } finally {
    await worker.terminate();
  }
}

export async function extractCustomerOrderDocument(input: {
  bytes: ArrayBuffer | Uint8Array;
  mimeType?: string;
  fileName?: string;
}): Promise<CustomerOrderExtract> {
  const mime = String(input.mimeType || '');
  const fileName = String(input.fileName || '');
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);

  const finish = (source: CustomerOrderExtractSource, text: string): CustomerOrderExtract => {
    const fields = extractCustomerOrderFields(text);
    return { source, fields, note: extractNote(source, fields) };
  };

  try {
    if (isPdf(mime, fileName)) {
      const pdfText = await readPdfText(bytes);
      if (normalizeDocText(pdfText).length >= MIN_TEXT_CHARS) {
        return finish('pdf_text', pdfText);
      }
      const pages = await renderPdfPages(bytes);
      if (pages.length) {
        const ocrText = await ocrBlobs(pages);
        if (normalizeDocText(ocrText).length >= 3) return finish('ocr', ocrText);
      }
      return finish('none', '');
    }
    if (isImage(mime, fileName)) {
      const ocrText = await ocrBlobs([bytes], mime || 'image/jpeg');
      if (normalizeDocText(ocrText).length >= 3) return finish('ocr', ocrText);
      return finish('none', '');
    }
    return finish('none', '');
  } catch {
    return {
      source: 'none',
      fields: { ...EMPTY_FIELDS },
      note: extractNote('none', EMPTY_FIELDS),
    };
  }
}
