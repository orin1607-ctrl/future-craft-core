// No network: fetch is faked. Fictitious content only.
import { describe, expect, it, vi } from 'vitest';
import {
  OCR_DEFAULT_MODEL,
  bytesToBase64,
  geminiOcr,
  ocrRequestBody,
  parseOcrResponse,
} from '../../../supabase/functions/_shared/claimDocumentOcr';

const answer = (obj: unknown) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

describe('OCR request', () => {
  it('sends the file inline with a transcription-only prompt and a strict JSON answer', () => {
    const body = ocrRequestBody(new Uint8Array([104, 105]), 'image/png');
    const parts = body.contents[0].parts as Array<Record<string, unknown>>;
    expect(String(parts[0].text)).toMatch(/Transcribe ALL readable text/);
    expect(String(parts[0].text)).toMatch(/Do not summarize, translate/);
    expect(parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'aGk=' } });
    expect(body.generationConfig).toMatchObject({ temperature: 0, responseMimeType: 'application/json' });
  });

  it('encodes large files in chunks', () => {
    const big = new Uint8Array(100_000).fill(65);
    expect(bytesToBase64(big)).toBe(btoa('A'.repeat(100_000)));
  });
});

describe('OCR answer', () => {
  it('reads text and kind', () => {
    expect(parseOcrResponse(answer({ text: 'שלום', kind: 'document' }))).toEqual({ text: 'שלום', kind: 'document' });
    expect(parseOcrResponse(answer({ text: '', kind: 'vehicle_photo' }))).toEqual({ text: '', kind: 'vehicle_photo' });
  });

  it('turns a strange answer into an error, never into invented text', () => {
    expect(() => parseOcrResponse({ candidates: [] })).toThrow('ocr_empty_response');
    expect(() => parseOcrResponse({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] })).toThrow();
    expect(parseOcrResponse(answer({ text: 'x', kind: 'weird' })).kind).toBe('document');
  });
});

describe('geminiOcr', () => {
  it('calls the Gemini generateContent endpoint with the key in a header (not in the URL)', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(answer({ text: 'דוח', kind: 'document' })), { status: 200 }));
    const ocr = geminiOcr('test-key', undefined, fetchImpl as unknown as typeof fetch);
    const out = await ocr(new Uint8Array([1, 2]), 'application/pdf');
    expect(out).toEqual({ text: 'דוח', kind: 'document' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${OCR_DEFAULT_MODEL}:generateContent`);
    expect(url).not.toContain('test-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
  });

  it('fails on an HTTP error (the run retries later)', async () => {
    const ocr = geminiOcr('k', undefined, (async () => new Response('no', { status: 429 })) as unknown as typeof fetch);
    await expect(ocr(new Uint8Array([1]), 'image/jpeg')).rejects.toThrow('ocr_http_429');
  });

  it('refuses to start without a key', () => {
    expect(() => geminiOcr('')).toThrow('ocr_key_missing');
  });
});
