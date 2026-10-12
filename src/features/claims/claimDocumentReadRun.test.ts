// Fictitious documents only. No network, no database.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ATTEMPTS,
  allowedClaims,
  mergeServerResult,
  pickDocuments,
  readRunConfig,
  runServerRead,
  type RunConfig,
  type RunDeps,
  type RunDoc,
} from '../../../supabase/functions/_shared/claimDocumentReadRun';
import { readPdfTextLayer } from '../../../supabase/functions/_shared/claimPdfText';
import { DOCUMENT_READ_CUSTOMER_DOCS } from '../../../supabase/functions/_shared/claimDocumentReadJob';

const root = process.cwd();
const NOW = new Date('2026-10-12T10:00:00Z');

function pdfWithText(text: string) {
  const stream = text.split('\n').map((line, i) => `BT /F1 12 Tf 40 ${720 - i * 18} Td (${line.replace(/[()\\]/g, '')}) Tj ET`).join('\n');
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) { offsets.push(body.length); body += `${obj}\n`; }
  const xrefPos = body.length;
  let xref = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i += 1) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `${xref}trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return new TextEncoder().encode(body);
}

async function realPdfText(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return readPdfTextLayer(pdfjs as never, bytes);
}

const on: RunConfig = { enabled: true, from: '2026-10-12T00:00:00.000Z', backlog: false, maxPerRun: 3, onlyClaims: [] };

function doc(p: Partial<RunDoc> & Pick<RunDoc, 'id'>): RunDoc {
  return {
    claim_id: 'CLAIM-T',
    content_sha256: `sha-${p.id}`,
    storage_path: `CLAIM-T/gmail/${p.id}.pdf`,
    original_name: `${p.id}.pdf`,
    mime_type: 'application/pdf',
    byte_size: 2000,
    created_at: '2026-10-12T08:00:00Z',
    doc_meta: { staff_title: 'כותרת ידנית' },
    ...p,
  };
}

/** In-memory doc_meta store that saves through mergeServerResult, like the Edge function. */
function harness(files: Record<string, Uint8Array | null | Error>, docs: RunDoc[]) {
  const store = new Map(docs.map((d) => [d.id, { ...(d.doc_meta || {}) } as Record<string, string>]));
  const deps: RunDeps = {
    now: () => NOW,
    download: vi.fn(async (d: RunDoc) => {
      const f = files[d.id];
      if (f instanceof Error) throw f;
      return f ?? null;
    }),
    extractText: realPdfText,
    save: vi.fn(async (d, read, job) => {
      const merged = mergeServerResult(store.get(d.id) || {}, d.claim_id, d.content_sha256, read, job);
      if (!merged.ok) return false;
      store.set(d.id, merged.meta);
      return true;
    }),
  };
  return { store, deps };
}

describe('server read run — switches', () => {
  it('is off unless enabled with a start time, and caps the batch size', () => {
    expect(readRunConfig([]).enabled).toBe(false);
    expect(readRunConfig([{ key: 'CLAIMS_DOC_READ_ENABLED', value: 'true' }])).toMatchObject({ enabled: false, problem: 'from_missing' });
    const cfg = readRunConfig([
      { key: 'CLAIMS_DOC_READ_ENABLED', value: 'true' },
      { key: 'CLAIMS_DOC_READ_FROM', value: '2026-10-12T00:00:00Z' },
      { key: 'CLAIMS_DOC_READ_MAX_PER_RUN', value: '500' },
    ]);
    expect(cfg).toMatchObject({ enabled: true, backlog: false, maxPerRun: 10 });
    expect(readRunConfig([{ key: 'CLAIMS_DOC_READ_MAX_PER_RUN', value: 'x' }]).maxPerRun).toBe(3);
  });

  it('keeps the code gate for customer documents off in this commit', () => {
    expect(DOCUMENT_READ_CUSTOMER_DOCS).toBe(false);
  });

  it('reads nothing when the code gate is off', async () => {
    const { deps } = harness({ A: pdfWithText('Survey report\nPlate 98-765-43') }, [doc({ id: 'A' })]);
    const out = await runServerRead([doc({ id: 'A' })], deps, { customerApproved: false });
    expect(out.taken).toBe(0);
    expect(deps.download).not.toHaveBeenCalled();
  });
});

describe('server read run — picking', () => {
  it('skips read, backlog, parked, busy and waiting documents, and honours the limit', () => {
    const docs = [
      doc({ id: 'fresh', doc_meta: { read_status: 'ready', read_sha: 'sha-fresh', read_claim_id: 'CLAIM-T' } }),
      doc({ id: 'old', created_at: '2026-09-01T00:00:00Z' }),
      doc({ id: 'ocr', doc_meta: { read_sha: 'sha-ocr', read_job_state: 'needs_ocr' } }),
      doc({ id: 'busy', doc_meta: { read_sha: 'sha-busy', read_job_state: 'processing', read_job_at: '2026-10-12T09:55:00Z' } }),
      doc({ id: 'wait', doc_meta: { read_sha: 'sha-wait', read_job_state: 'retry', read_job_next_at: '2026-10-12T11:00:00Z' } }),
      doc({ id: 'due', created_at: '2026-10-12T01:00:00Z', doc_meta: { read_sha: 'sha-due', read_job_state: 'retry', read_job_next_at: '2026-10-12T09:00:00Z' } }),
      doc({ id: 'n1', created_at: '2026-10-12T02:00:00Z' }),
      doc({ id: 'n2', created_at: '2026-10-12T03:00:00Z' }),
      doc({ id: 'n3', created_at: '2026-10-12T04:00:00Z' }),
    ];
    const { take, skipped } = pickDocuments(docs, on, NOW);
    expect(take.map((d) => d.id)).toEqual(['due', 'n1', 'n2']);
    expect(skipped).toMatchObject({ fresh: 1, backlog: 1, needs_ocr: 1, busy: 1, waiting: 1, over_limit: 1 });
  });

  it('without the customer gate reads only the allowlisted pilot claim, and nothing without a list', () => {
    const docs = [doc({ id: 'pilot', claim_id: 'TEST-CLAIM' }), doc({ id: 'real', claim_id: 'CLAIM-REAL' })];
    const pilot = { ...on, onlyClaims: ['TEST-CLAIM'] };
    const picked = pickDocuments(docs, pilot, NOW, allowedClaims(pilot, false));
    expect(picked.take.map((d) => d.id)).toEqual(['pilot']);
    expect(picked.skipped).toMatchObject({ not_allowed: 1 });
    expect(pickDocuments(docs, on, NOW, allowedClaims(on, false)).take).toHaveLength(0);
    expect(allowedClaims(on, true)).toBeNull();
    expect(readRunConfig([{ key: 'CLAIMS_DOC_READ_ONLY_CLAIMS', value: ' A, B ,A,' }]).onlyClaims).toEqual(['A', 'B']);
  });

  it('includes older gallery documents only when backlog is switched on', () => {
    const old = doc({ id: 'old', created_at: '2026-09-01T00:00:00Z' });
    expect(pickDocuments([old], on, NOW).take).toHaveLength(0);
    expect(pickDocuments([old], { ...on, backlog: true }, NOW).take).toHaveLength(1);
  });

  it('reads a changed file again even if an older version was read', () => {
    const changed = doc({ id: 'c', content_sha256: 'sha-new', doc_meta: { read_status: 'ready', read_sha: 'sha-old', read_claim_id: 'CLAIM-T' } });
    expect(pickDocuments([changed], on, NOW).take).toHaveLength(1);
  });
});

describe('server read run — results', () => {
  it('reads a text PDF, saves type and fields on the same row, and keeps the manual title', async () => {
    const d = doc({ id: 'T' });
    const { store, deps } = harness({ T: pdfWithText('Survey report\nClaim DAL-2026-0042\nPlate 98-765-43\nDate 05/10/2026\nAmount 1250 NIS') }, [d]);
    const out = await runServerRead([d], deps, { customerApproved: true });
    expect(out).toMatchObject({ taken: 1, ready: 1, needs_ocr: 0, failed: 0 });
    const meta = store.get('T')!;
    expect(meta).toMatchObject({ read_status: 'ready', read_source: 'pdf_text', read_sha: 'sha-T', read_claim_id: 'CLAIM-T', read_doc_type: 'דוח שמאי', read_job_state: 'done' });
    expect(meta.read_plates).toContain('9876543');
    expect(meta.read_amounts).toContain('1250');
    expect(meta.staff_title).toBe('כותרת ידנית');
  });

  it('keeps PDF line breaks, so fields far down the page are still found', async () => {
    const filler = Array.from({ length: 12 }, (_, i) => `General note line ${i + 1} about the inspection of the vehicle`).join('\n');
    const d = doc({ id: 'L' });
    const { store, deps } = harness({ L: pdfWithText(`Survey report\n${filler}\nApproved repair amount 4,850 NIS\nMissing: repair invoice`) }, [d]);
    await runServerRead([d], deps, { customerApproved: true });
    const meta = store.get('L')!;
    expect(meta.read_amounts).toBe('4,850');
    expect(meta.read_amount_src).toBe('Approved repair amount 4,850 NIS');
    expect(meta.read_missing).toBe('Missing: repair invoice');
  });

  it('parks a scanned PDF for the browser reader without inventing details', async () => {
    const scan = readFileSync(resolve(root, 'docs/audit-reports/claims-doc-read-live-ocr-2026-10-11/samples/sample-scan-he.pdf'));
    const d = doc({ id: 'S' });
    const { store, deps } = harness({ S: new Uint8Array(scan) }, [d]);
    const out = await runServerRead([d], deps, { customerApproved: true });
    expect(out).toMatchObject({ needs_ocr: 1, ready: 0 });
    expect(store.get('S')).toMatchObject({ read_status: 'pending', read_job_state: 'needs_ocr', read_sha: 'sha-S' });
    expect(store.get('S')!.read_text).toBeUndefined();
  });

  it('parks an image without downloading it', async () => {
    const d = doc({ id: 'I', mime_type: 'image/jpeg', original_name: 'damage.jpg' });
    const { store, deps } = harness({}, [d]);
    await runServerRead([d], deps, { customerApproved: true });
    expect(deps.download).not.toHaveBeenCalled();
    expect(store.get('I')!.read_job_state).toBe('needs_ocr');
  });

  it('retries a failed download later and gives up after the last attempt', async () => {
    let d = doc({ id: 'E' });
    const { store, deps } = harness({ E: new Error('network') }, [d]);
    await runServerRead([d], deps, { customerApproved: true });
    expect(store.get('E')).toMatchObject({ read_job_state: 'retry', read_job_attempts: '1', read_job_error: 'read_error', read_job_next_at: '2026-10-12T10:15:00.000Z' });
    expect(store.get('E')!.read_status).toBeUndefined();

    for (let i = 2; i <= MAX_ATTEMPTS; i += 1) {
      d = { ...d, doc_meta: store.get('E')! };
      await runServerRead([d], deps, { customerApproved: true });
    }
    expect(store.get('E')).toMatchObject({ read_status: 'failed', read_job_state: 'failed', read_job_attempts: String(MAX_ATTEMPTS) });
    expect(pickDocuments([{ ...d, doc_meta: store.get('E')! }], on, NOW).skipped).toMatchObject({ given_up: 1 });
  });

  it('stops when the time budget is used up', async () => {
    const docs = [doc({ id: 'B1' }), doc({ id: 'B2' })];
    const { deps } = harness({ B1: pdfWithText('Invoice\nAmount 80 NIS\nPlate 11-222-33'), B2: pdfWithText('Invoice 2') }, docs);
    let t = 0;
    const out = await runServerRead(docs, { ...deps, elapsedMs: () => (t += 1000) }, { customerApproved: true });
    expect(out).toMatchObject({ taken: 1, stopped_by_budget: true });
  });

  it('never replaces a read the browser saved meanwhile, and never writes another claim', () => {
    const latest = { read_status: 'ready', read_sha: 'sha-X', read_claim_id: 'CLAIM-T', read_summary: 'מהדפדפן' };
    const kept = mergeServerResult(latest, 'CLAIM-T', 'sha-X', null, { read_status: 'pending', read_job_state: 'needs_ocr' });
    expect(kept).toMatchObject({ ok: true, unchanged: true, meta: latest });
    const other = mergeServerResult({}, 'CLAIM-T', 'sha-Y', { read_status: 'ready', read_sha: 'sha-Y', read_claim_id: 'CLAIM-OTHER' } as never, {});
    expect(other.ok).toBe(false);
  });

  it('returns ids and counts only, never document text', async () => {
    const d = doc({ id: 'P' });
    const { deps } = harness({ P: pdfWithText('Survey report\nSecret line 12345\nPlate 98-765-43') }, [d]);
    const out = await runServerRead([d], deps, { customerApproved: true });
    expect(JSON.stringify(out)).not.toContain('Secret line');
  });
});

describe('claims-doc-read function', () => {
  const src = readFileSync(resolve(root, 'supabase/functions/claims-doc-read/index.ts'), 'utf8');

  it('accepts only the internal scheduler on Staging and calls no AI service', () => {
    expect(src).toContain('x-dalia-internal-key');
    expect(src).toContain('wrong_project');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/gemini|generativelanguage|anthropic|openai|GEMINI_API_KEY/i);
    expect(code).not.toMatch(/\bfetch\(/);
    expect(src).not.toContain('jwtRoleRef');
  });

  it('logs only the run summary', () => {
    const logs = src.match(/console\.(log|error|warn)\([^;]*\);/g) || [];
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('...summary');
    expect(logs[0]).not.toMatch(/read_text|text|meta/);
  });
});
