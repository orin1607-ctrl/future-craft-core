import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  answerFromDocumentRead,
  documentReadCaption,
  mergeDocumentRead,
  readClaimDocument,
} from './claimDocumentRead';

const projectRoot = process.cwd();
const samples = resolve(projectRoot, 'docs/audit-reports/claims-doc-read-live-ocr-2026-10-11/samples');

function substQuiet(command: string) {
  try { execSync(command, { stdio: 'ignore' }); } catch { /* drive was not mapped */ }
}

async function withAsciiProjectRoot<T>(run: () => Promise<T>) {
  if (!/[^\u0000-\u007f]/.test(projectRoot)) return run();
  substQuiet('subst Q: /d');
  execSync(`subst Q: "${projectRoot}"`);
  process.chdir('Q:\\');
  try {
    return await run();
  } finally {
    process.chdir(projectRoot);
    substQuiet('subst Q: /d');
  }
}

function readSample(name: string, mime: string, sha: string) {
  return withAsciiProjectRoot(() => readClaimDocument({
    bytes: load(name),
    mimeType: mime,
    fileName: 'DAL-2099-9999-secret.jpg',
    claimId: 'CLAIM-SAMPLE',
    sha256: sha,
    useBuiltinOcr: true,
  }));
}

function load(name: string) {
  return new Uint8Array(readFileSync(resolve(samples, name)));
}

describe('live sample document reading', () => {
  it('reads a real text PDF without OCR', async () => {
    const read = await readClaimDocument({
      bytes: load('sample-text.pdf'),
      mimeType: 'application/pdf',
      fileName: 'sample-text.pdf',
      claimId: 'CLAIM-SAMPLE',
      sha256: 'sample-text',
    });
    expect(read.read_source).toBe('pdf_text');
    expect(read.read_claim_nums).toContain('DAL-2026-2042');
    expect(read.read_plates).toContain('9000001');
    expect(read.read_amounts).toContain('1500');
    expect(read.read_dates).toContain('2026-09-12');
    expect(read.read_claim_src).toContain('DAL-2026-2042');
    expect(read.read_amount_src.toLowerCase()).toContain('1500');
  }, 20000);

  it('runs real OCR on an English image and a Hebrew image', async () => {
    const en = await readSample('sample-en.jpg', 'image/jpeg', 'sample-en');
    const he = await readSample('sample-he.jpg', 'image/jpeg', 'sample-he');
    writeFileSync(resolve(samples, 'ocr-images.json'), JSON.stringify({ en, he }, null, 2));
    expect(en.read_status).toBe('ready');
    expect(en.read_source).toBe('ocr');
    expect(en.read_text.toLowerCase()).toContain('approved');
    expect(en.read_claim_nums).toContain('DAL-2026-2042');
    expect(en.read_claim_nums).not.toContain('2099');
    expect(en.read_plates).toContain('9000001');
    expect(en.read_amounts).toContain('1500');
    expect(en.read_plate_src.toLowerCase()).toContain('plate');
    expect(he.read_status).toBe('ready');
    expect(he.read_text).toMatch(/שמאי|אושר|רכב/);
    expect(he.read_claim_nums).toContain('DAL-2026-2042');
    expect(he.read_amounts).toContain('1500');
    expect(he.read_amount_src).toContain('1500');
    const caption = documentReadCaption(he);
    expect(caption?.summary.length).toBeGreaterThan(10);
    expect(caption?.details).toContain('מקור');
    const amount = answerFromDocumentRead('מה הסכום?', he);
    expect(amount.answer).toContain('1500');
    expect(amount.source).toContain('1500');
  }, 180000);

  it('reads a scanned PDF by turning the page into an image inside the reader', async () => {
    const scan = await withAsciiProjectRoot(() => readClaimDocument({
      bytes: load('sample-scan-he.pdf'),
      mimeType: 'application/pdf',
      fileName: 'DAL-2099-9999-secret.pdf',
      claimId: 'CLAIM-SAMPLE',
      sha256: 'sample-scan-he',
      useBuiltinOcr: true,
    }));
    writeFileSync(resolve(samples, 'ocr-scan.json'), JSON.stringify(scan, null, 2));
    expect(scan.read_status).toBe('ready');
    expect(scan.read_source).toBe('ocr');
    expect(scan.read_claim_nums).toContain('DAL-2026-2042');
    expect(scan.read_claim_nums).not.toContain('2099');
    expect(scan.read_plates).toContain('9000001');
    expect(scan.read_plate_src).toMatch(/רכב|90-000-01/);
    expect(scan.read_amounts).toContain('1500');
    expect(scan.read_dates).toContain('2026-09-12');
    const saved = mergeDocumentRead({
      id: 'DOC-SAMPLE',
      claim_id: 'CLAIM-SAMPLE',
      storage_path: 'CLAIM-SAMPLE/gmail/sample/sample-scan-he.pdf',
      doc_meta: { staff_type: 'surveyor_report', read_status: 'pending', read_sha: 'sample-scan-he' },
    }, scan);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.row.id).toBe('DOC-SAMPLE');
    expect(saved.row.storage_path).toContain('sample-scan-he.pdf');
    expect(saved.row.doc_meta?.staff_type).toBe('surveyor_report');
    expect(saved.row.doc_meta?.read_status).toBe('ready');
    expect(mergeDocumentRead({ id: 'DOC-SAMPLE', claim_id: 'CLAIM-OTHER' }, scan).ok).toBe(false);
  }, 180000);

  it('does not invent facts from a dense page or from uncertain OCR', async () => {
    const dense = await readSample('sample-dense.jpg', 'image/jpeg', 'sample-dense');
    const noise = await readSample('sample-noise.jpg', 'image/jpeg', 'sample-noise');
    writeFileSync(resolve(samples, 'ocr-dense.json'), JSON.stringify({ dense, noise }, null, 2));
    expect(dense.read_status).toBe('ready');
    expect(dense.read_plates).toBe('9000001');
    expect(dense.read_plates).not.toContain('11111111');
    expect(dense.read_plates).not.toContain('22222222');
    expect(dense.read_claim_nums).toContain('DAL-2026-2042');
    expect(dense.read_claim_nums).not.toContain('2099');
    expect(noise.read_status).toBe('unreadable');
    expect(noise.read_claim_nums).toBe('לא מופיע במסמך');
    expect(noise.read_plates).toBe('לא מופיע במסמך');
    expect(noise.read_amounts).toBe('לא מופיע במסמך');
    expect(JSON.stringify(noise)).not.toContain('DAL-2026-2042');
    expect(JSON.stringify(noise)).not.toContain('2099');
  }, 180000);
});
