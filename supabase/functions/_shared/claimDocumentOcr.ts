/**
 * OCR of a claim scan or image through the Gemini API (Hebrew and English).
 * Used by claims-doc-read only when DOCUMENT_READ_OCR_PROVIDER = 'gemini' and CLAIMS_DOC_READ_OCR = 'true'.
 * Transcription only: no summary, no translation, no guessing. Returns text and a coarse kind.
 * Never logs the file or the text.
 */
import type { OcrResult } from './claimDocumentReadRun.ts';

export const OCR_DEFAULT_MODEL = 'gemini-2.5-flash';
const OCR_TEXT_LIMIT = 8000;
const OCR_TIMEOUT_MS = 60_000;

export const OCR_PROMPT = [
  'You are an OCR engine for vehicle insurance claim documents in Hebrew and English.',
  'Transcribe ALL readable text in the file exactly as written, in its original language, keeping line breaks.',
  'Do not summarize, translate, correct, explain, or add anything that is not visibly written.',
  'If a part is unreadable, skip it. If there is no readable text, return an empty text.',
  'Also set kind: "document" (a form, letter, invoice, report, license or other paper/screen with text),',
  '"vehicle_photo" (a photo of a vehicle or vehicle damage), "other_photo" (any other photo), or "empty".',
].join(' ');

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function ocrRequestBody(bytes: Uint8Array, mimeType: string) {
  return {
    contents: [{
      role: 'user',
      parts: [
        { text: OCR_PROMPT },
        { inlineData: { mimeType, data: bytesToBase64(bytes) } },
      ],
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          text: { type: 'STRING' },
          kind: { type: 'STRING', enum: ['document', 'vehicle_photo', 'other_photo', 'empty'] },
        },
        required: ['text', 'kind'],
      },
    },
  };
}

/** Reads the model answer. Anything unexpected becomes an error (the run retries), never invented text. */
export function parseOcrResponse(json: unknown): OcrResult {
  const parts = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts || [];
  const raw = parts.map((p) => p.text || '').join('').trim();
  if (!raw) throw new Error('ocr_empty_response');
  const data = JSON.parse(raw) as { text?: unknown; kind?: unknown };
  const kinds = new Set(['document', 'vehicle_photo', 'other_photo', 'empty']);
  const kind = kinds.has(String(data.kind)) ? String(data.kind) as OcrResult['kind'] : 'document';
  return { text: String(data.text ?? '').slice(0, OCR_TEXT_LIMIT), kind };
}

export function geminiOcr(apiKey: string, model = OCR_DEFAULT_MODEL, fetchImpl: typeof fetch = fetch) {
  if (!apiKey) throw new Error('ocr_key_missing');
  return async (bytes: Uint8Array, mimeType: string): Promise<OcrResult> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OCR_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(ocrRequestBody(bytes, mimeType)),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`ocr_http_${res.status}`);
      return parseOcrResponse(await res.json());
    } finally {
      clearTimeout(timer);
    }
  };
}
