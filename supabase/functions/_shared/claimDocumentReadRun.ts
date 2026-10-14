/**
 * One server-side reading run over claim documents (claims-doc-read).
 * Reuses the existing pieces: processStoredDocument / applyStoredReadMeta (fingerprint, same claim,
 * no overwrite of a good read) and analyzeDocumentText (the same analysis as the browser reader).
 *
 * Text PDFs: read on the server from the PDF text layer.
 * Scanned PDFs and images: read by OCR only when OCR is approved (code gate DOCUMENT_READ_OCR_PROVIDER and
 * CLAIMS_DOC_READ_OCR = 'true'); otherwise they are marked needs_ocr and left for the browser reader
 * (the chat card reads them when asked). Nothing here talks to a service by itself — OCR is a dependency.
 *
 * Control lives in claims_config, so it can be stopped without a deploy:
 *   CLAIMS_DOC_READ_ENABLED      'true' to run; anything else stops the run
 *   CLAIMS_DOC_READ_FROM         ISO time; documents created before it are backlog
 *   CLAIMS_DOC_READ_BACKLOG      'true' to include backlog (older gallery documents)
 *   CLAIMS_DOC_READ_MAX_PER_RUN  1..10, default 3
 *   CLAIMS_DOC_READ_ONLY_CLAIMS  comma-separated claim ids; when set, only these claims are read.
 *                                While the customer-documents code gate is off, this list is required
 *                                (a pilot on a test claim) and nothing outside it is touched.
 *   CLAIMS_DOC_READ_OCR          'true' to OCR scans and images (also needs the OCR code gate)
 */
import {
  applyStoredReadMeta,
  processStoredDocument,
  storedReadIsFresh,
  type ExtractedRead,
  type StoredClaimDoc,
} from './claimDocumentReadJob.ts';
import { MIN_TEXT_CHARS, analyzeDocumentText, normalizeDocText, unreadableDocumentRead } from './claimDocumentAnalyze.ts';
import { isApprovedQaClaimId } from './claimQaScope.ts';

export const RUN_CONFIG_KEYS = [
  'CLAIMS_DOC_READ_ENABLED',
  'CLAIMS_DOC_READ_FROM',
  'CLAIMS_DOC_READ_BACKLOG',
  'CLAIMS_DOC_READ_MAX_PER_RUN',
  'CLAIMS_DOC_READ_ONLY_CLAIMS',
  'CLAIMS_DOC_READ_OCR',
] as const;

export const MAX_PER_RUN_CAP = 10;
export const DEFAULT_MAX_PER_RUN = 3;
export const MAX_ATTEMPTS = 3;
export const MAX_BYTES = 15 * 1024 * 1024;
export const OCR_MAX_BYTES = 7 * 1024 * 1024;
/** CPU spent parsing PDFs in one run (the Edge Function CPU limit is 2s). */
export const RUN_BUDGET_MS = 1200;
/** Total time of one run (OCR is network wait; the Edge Function wall limit is 150s). */
export const RUN_WALL_BUDGET_MS = 100_000;
const RETRY_DELAYS_MIN = [15, 60, 360];
const PROCESSING_STALE_MIN = 15;

/** Images the OCR provider accepts. Others are marked unreadable (unsupported) instead of guessed. */
const OCR_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

/** Job bookkeeping kept next to the read_* fields in doc_meta. Written only by the server run. */
export const JOB_META_KEYS = ['read_job_state', 'read_job_attempts', 'read_job_next_at', 'read_job_at', 'read_job_error'] as const;
export type JobState = 'processing' | 'needs_ocr' | 'too_large' | 'retry' | 'failed' | 'done';

export type RunConfig = {
  enabled: boolean;
  from: string;
  backlog: boolean;
  maxPerRun: number;
  onlyClaims: string[];
  ocr: boolean;
  problem?: string;
};

export type RunDoc = StoredClaimDoc & { created_at?: string; byte_size?: number | null };

export function readRunConfig(rows: Array<{ key: string; value: string | null }>): RunConfig {
  const get = (k: string) => String(rows.find((r) => r.key === k)?.value ?? '').trim();
  const from = get('CLAIMS_DOC_READ_FROM');
  const fromOk = !!from && !Number.isNaN(Date.parse(from));
  const rawMax = Number.parseInt(get('CLAIMS_DOC_READ_MAX_PER_RUN') || String(DEFAULT_MAX_PER_RUN), 10);
  const maxPerRun = Number.isFinite(rawMax) ? Math.min(Math.max(rawMax, 1), MAX_PER_RUN_CAP) : DEFAULT_MAX_PER_RUN;
  const enabled = get('CLAIMS_DOC_READ_ENABLED') === 'true';
  const onlyClaims = [...new Set(get('CLAIMS_DOC_READ_ONLY_CLAIMS').split(',').map((v) => v.trim()).filter(Boolean))];
  return {
    enabled: enabled && fromOk,
    from: fromOk ? new Date(from).toISOString() : '',
    backlog: get('CLAIMS_DOC_READ_BACKLOG') === 'true',
    maxPerRun,
    onlyClaims,
    ocr: get('CLAIMS_DOC_READ_OCR') === 'true',
    ...(enabled && !fromOk ? { problem: 'from_missing' } : {}),
  };
}

function metaOf(doc: { doc_meta?: Record<string, string> | null }) {
  return doc.doc_meta && typeof doc.doc_meta === 'object' ? { ...doc.doc_meta } : {};
}

function isPdf(doc: RunDoc) {
  return /pdf/i.test(doc.mime_type || '') || /\.pdf$/i.test(doc.original_name || '');
}

/** Why a document is or is not taken in this run. */
export function pickReason(doc: RunDoc, cfg: RunConfig, now: Date): 'take' | 'fresh' | 'backlog' | 'waiting' | 'given_up' | 'busy' | 'needs_ocr' | 'too_large' | 'no_fingerprint' {
  const meta = metaOf(doc);
  if (!doc.content_sha256) return 'no_fingerprint';
  if (storedReadIsFresh(meta, doc.content_sha256, doc.claim_id)) return 'fresh';
  if (!cfg.backlog && (!doc.created_at || doc.created_at < cfg.from)) return 'backlog';
  const sameFile = meta.read_sha === doc.content_sha256;
  const state = sameFile ? meta.read_job_state : '';
  if (state === 'needs_ocr' && !cfg.ocr) return 'needs_ocr';
  if (state === 'too_large') return 'too_large';
  if (state === 'failed') return 'given_up';
  if (state === 'processing' && meta.read_job_at) {
    const started = Date.parse(meta.read_job_at);
    if (Number.isFinite(started) && now.getTime() - started < PROCESSING_STALE_MIN * 60_000) return 'busy';
  }
  if (state === 'retry' && meta.read_job_next_at && Date.parse(meta.read_job_next_at) > now.getTime()) return 'waiting';
  return 'take';
}

/**
 * Which claims may be read. Customer documents need the code gate; without it only the allowlist (a pilot).
 * Returns null when everything is allowed.
 */
/**
 * Which claims a run may read. null = all claims (only once customer documents are approved).
 * Until then the pilot list is honoured for QA claims only: a real claim id in the list is ignored.
 */
export function allowedClaims(cfg: RunConfig, customerDocsApproved: boolean): Set<string> | null {
  if (cfg.onlyClaims.length) {
    return new Set(customerDocsApproved ? cfg.onlyClaims : cfg.onlyClaims.filter(isApprovedQaClaimId));
  }
  return customerDocsApproved ? null : new Set<string>();
}

export function pickDocuments(docs: RunDoc[], cfg: RunConfig, now: Date, allowed: Set<string> | null = null) {
  const take: RunDoc[] = [];
  const skipped: Record<string, number> = {};
  if (allowed) {
    const outside = docs.filter((d) => !allowed.has(d.claim_id)).length;
    if (outside) skipped.not_allowed = outside;
    docs = docs.filter((d) => allowed.has(d.claim_id));
  }
  const sorted = [...docs].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const doc of sorted) {
    const reason = pickReason(doc, cfg, now);
    if (reason === 'take' && take.length < cfg.maxPerRun) take.push(doc);
    else skipped[reason === 'take' ? 'over_limit' : reason] = (skipped[reason === 'take' ? 'over_limit' : reason] || 0) + 1;
  }
  return { take, skipped };
}

function jobPatch(state: JobState, now: Date, extra: Partial<Record<(typeof JOB_META_KEYS)[number], string>> = {}) {
  return { read_job_state: state, read_job_at: now.toISOString(), ...extra };
}

/** Merge onto the latest doc_meta: read_* through applyStoredReadMeta, then job keys. Never touches staff fields. */
export function mergeServerResult(
  latest: Record<string, string>,
  claimId: string,
  sha: string,
  read: ExtractedRead | null,
  job: Record<string, string>,
) {
  // A good read of this exact file (e.g. saved by the browser meanwhile) is never replaced.
  if (storedReadIsFresh(latest, sha, claimId)) return { ok: true as const, meta: { ...latest }, unchanged: true };
  let meta = { ...latest };
  if (read) {
    const applied = applyStoredReadMeta(meta, read as unknown as Record<string, unknown>, claimId);
    if (!applied.ok) return { ok: false as const, error: applied.error };
    meta = applied.meta;
  }
  for (const [k, v] of Object.entries(job)) meta[k] = v;
  if (read && !meta.read_sha) meta.read_sha = read.read_sha;
  return { ok: true as const, meta, unchanged: false };
}

/** What the OCR provider found: the text, and whether the picture is a vehicle / damage photo. */
export type OcrResult = { text: string; kind: 'document' | 'vehicle_photo' | 'other_photo' | 'empty' };

export type RunDeps = {
  download: (doc: RunDoc) => Promise<Uint8Array | null>;
  extractText: (bytes: Uint8Array) => Promise<string>;
  /** OCR of a scan or image. Present only when OCR is approved. */
  ocr?: (bytes: Uint8Array, mimeType: string) => Promise<OcrResult>;
  /** Re-reads doc_meta, merges with mergeServerResult and writes. Returns false when the write failed. */
  save: (doc: RunDoc, read: ExtractedRead | null, job: Record<string, string>) => Promise<boolean>;
  now?: () => Date;
  /** Total time since the run started (wall clock). */
  elapsedMs?: () => number;
  /** Monotonic clock in ms, used to measure PDF parsing (CPU). Defaults to performance.now. */
  clock?: () => number;
};

export type RunSummary = {
  taken: number;
  ready: number;
  ocr_read: number;
  photos: number;
  unreadable: number;
  needs_ocr: number;
  too_large: number;
  retry: number;
  failed: number;
  save_failed: number;
  stopped_by_budget: boolean;
  file_ids: string[];
};

function readOnlyFields(read: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(read).filter(([k]) => k.startsWith('read_') && !k.startsWith('read_job_'))) as unknown as ExtractedRead;
}

/** A read built from OCR output. Photos without text are labelled as photos, never given invented details. */
export function readFromOcr(ocr: OcrResult, claimId: string, sha: string) {
  const text = String(ocr.text || '');
  if (normalizeDocText(text).length >= MIN_TEXT_CHARS) {
    return { read: analyzeDocumentText(text, 'ocr', claimId, sha), bucket: 'ocr_read' as const };
  }
  if (ocr.kind === 'vehicle_photo') {
    const base = analyzeDocumentText('', 'ocr', claimId, sha);
    return {
      read: { ...base, read_doc_type: 'צילום נזק', read_summary: 'צילום של רכב / נזק. לא נמצא בו טקסט.', read_evidence: '' },
      bucket: 'photos' as const,
    };
  }
  return {
    read: unreadableDocumentRead(claimId, sha, ocr.kind === 'other_photo' ? 'תמונה ללא טקסט קריא.' : 'לא נמצא טקסט קריא בקובץ.'),
    bucket: 'unreadable' as const,
  };
}

/**
 * Processes the picked documents one by one. Logs and returns ids and counts only — never document text.
 * `customerApproved` comes from the code gate (DOCUMENT_READ_CUSTOMER_DOCS) or the pilot allowlist.
 * `ocrApproved` = OCR code gate + CLAIMS_DOC_READ_OCR; without it scans and images are parked (needs_ocr).
 */
export async function runServerRead(
  take: RunDoc[],
  deps: RunDeps,
  opts: { customerApproved: boolean; ocrApproved?: boolean },
): Promise<RunSummary> {
  const now = deps.now || (() => new Date());
  const elapsed = deps.elapsedMs || (() => 0);
  const clock = deps.clock || (() => performance.now());
  const ocr = opts.ocrApproved && deps.ocr ? deps.ocr : null;
  let parseMs = 0;
  const out: RunSummary = {
    taken: 0, ready: 0, ocr_read: 0, photos: 0, unreadable: 0, needs_ocr: 0, too_large: 0, retry: 0, failed: 0, save_failed: 0,
    stopped_by_budget: false, file_ids: [],
  };
  if (!opts.customerApproved) return out;

  for (const doc of take) {
    if (parseMs > RUN_BUDGET_MS || elapsed() > RUN_WALL_BUDGET_MS) { out.stopped_by_budget = true; break; }
    out.taken += 1;
    out.file_ids.push(doc.id);
    const meta = metaOf(doc);
    const sha = doc.content_sha256;
    const mime = String(doc.mime_type || '').toLowerCase();
    const attempts = meta.read_sha === sha ? Number.parseInt(meta.read_job_attempts || '0', 10) || 0 : 0;
    const record = async (read: ExtractedRead | null, job: Record<string, string>, bucket: keyof RunSummary) => {
      const ok = await deps.save(doc, read, { ...job, ...(read ? {} : { read_sha: sha }) });
      if (!ok) out.save_failed += 1;
      else (out[bucket] as number) += 1;
    };
    const park = (state: 'needs_ocr' | 'too_large') => record(null, { read_status: 'pending', ...jobPatch(state, now()) }, state);
    const saveOcr = async (result: OcrResult) => {
      const built = readFromOcr(result, doc.claim_id, sha);
      await record(readOnlyFields(built.read as unknown as Record<string, unknown>), jobPatch('done', now(), { read_job_attempts: '0', read_job_error: '' }), built.bucket);
    };

    const pdf = isPdf(doc);
    if (!pdf) {
      if (!ocr) { await park('needs_ocr'); continue; }
      if (!OCR_IMAGE_MIMES.has(mime)) {
        await record(readOnlyFields(unreadableDocumentRead(doc.claim_id, sha, 'סוג הקובץ אינו נתמך לקריאה.') as unknown as Record<string, unknown>), jobPatch('done', now()), 'unreadable');
        continue;
      }
    }
    if (doc.byte_size && doc.byte_size > (pdf ? MAX_BYTES : OCR_MAX_BYTES)) { await park('too_large'); continue; }

    let failure = '';
    try {
      const bytes = await deps.download(doc);
      if (!bytes || !bytes.byteLength) {
        failure = 'download_empty';
      } else if (!pdf) {
        await saveOcr(await ocr!(bytes, mime));
        continue;
      } else {
        const t0 = clock();
        const text = await deps.extractText(bytes);
        parseMs += clock() - t0;
        if (normalizeDocText(text).length < MIN_TEXT_CHARS) {
          if (!ocr) { await park('needs_ocr'); continue; }
          if (bytes.byteLength > OCR_MAX_BYTES) { await park('too_large'); continue; }
          await saveOcr(await ocr(bytes, 'application/pdf'));
          continue;
        }
        const result = await processStoredDocument(
          doc,
          bytes,
          async () => analyzeDocumentText(text, 'pdf_text', doc.claim_id, sha) as unknown as ExtractedRead,
          { customerApproved: true },
        );
        const read = result.doc?.doc_meta as unknown as ExtractedRead | undefined;
        if (result.reason === 'already_read') { out.taken -= 1; out.file_ids.pop(); continue; }
        if (!result.wrote || !read || read.read_status !== 'ready') {
          failure = String(result.reason || 'read_failed');
        } else {
          await record(readOnlyFields(read as unknown as Record<string, unknown>), jobPatch('done', now(), { read_job_attempts: '0', read_job_error: '' }), 'ready');
          continue;
        }
      }
    } catch {
      failure = pdf ? 'read_error' : 'ocr_error';
    }

    const nextAttempts = attempts + 1;
    if (nextAttempts >= MAX_ATTEMPTS) {
      await record(
        { read_status: 'failed', read_sha: sha, read_claim_id: doc.claim_id, read_source: 'none', read_summary: 'הקריאה נכשלה כמה פעמים. נדרשת בדיקה ידנית.' },
        jobPatch('failed', now(), { read_job_attempts: String(nextAttempts), read_job_error: failure }),
        'failed',
      );
    } else {
      const delay = RETRY_DELAYS_MIN[Math.min(nextAttempts - 1, RETRY_DELAYS_MIN.length - 1)];
      await record(
        null,
        jobPatch('retry', now(), {
          read_job_attempts: String(nextAttempts),
          read_job_next_at: new Date(now().getTime() + delay * 60_000).toISOString(),
          read_job_error: failure,
        }),
        'retry',
      );
    }
  }
  return out;
}
