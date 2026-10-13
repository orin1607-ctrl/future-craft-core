/**
 * Queue and result rules for claim document reading.
 * Customer documents stay off, and no schedule is created here.
 * The caller supplies text extraction. This file does not call Gemini.
 */
export const DOCUMENT_READ_CRON_ENABLED = false;
export const DOCUMENT_READ_CUSTOMER_DOCS = false;
/**
 * Server OCR for scans and images. 'none' = off: documents are not sent anywhere.
 * 'gemini' sends the file to the Gemini API — only after the owner approves sending document content.
 */
export const DOCUMENT_READ_OCR_PROVIDER: 'none' | 'gemini' = 'none';

export type StoredReadStatus = 'pending' | 'processing' | 'ready' | 'unreadable' | 'failed';

export type StoredClaimDoc = {
  id: string;
  claim_id: string;
  content_sha256: string;
  storage_path?: string;
  original_name?: string;
  mime_type?: string;
  doc_meta?: Record<string, string> | null;
};

export type ExtractedRead = {
  read_status: StoredReadStatus;
  read_sha: string;
  read_claim_id: string;
  read_source?: string;
  read_summary?: string;
  read_text?: string;
  [key: string]: string | undefined;
};

export function serverReadGate() {
  return {
    cronEnabled: DOCUMENT_READ_CRON_ENABLED,
    customerApproved: DOCUMENT_READ_CUSTOMER_DOCS,
    autorun: false,
    gemini: false,
  };
}

function metaOf(doc: StoredClaimDoc) {
  return doc.doc_meta && typeof doc.doc_meta === 'object' ? { ...doc.doc_meta } : {};
}

export function storedReadIsFresh(meta: Record<string, string> | null | undefined, sha: string, claimId: string) {
  const row = meta && typeof meta === 'object' ? meta : {};
  if (!sha || row.read_sha !== sha) return false;
  if (row.read_claim_id !== claimId) return false;
  return row.read_status === 'ready' || row.read_status === 'unreadable';
}

export function planExistingDocument(doc: StoredClaimDoc, expectedClaimId: string, opts?: { customerApproved?: boolean }) {
  if (doc.claim_id !== expectedClaimId) {
    return { ok: false as const, reason: 'other_claim' as const, wrote: false, doc };
  }
  const approved = opts?.customerApproved === true || DOCUMENT_READ_CUSTOMER_DOCS;
  if (!approved) {
    return { ok: false as const, reason: 'customer_not_approved' as const, wrote: false, doc };
  }
  if (storedReadIsFresh(doc.doc_meta, doc.content_sha256, doc.claim_id)) {
    return { ok: true as const, reason: 'already_read' as const, wrote: false, doc };
  }
  return {
    ok: true as const,
    reason: 'queued' as const,
    wrote: false,
    doc: {
      ...doc,
      doc_meta: { ...metaOf(doc), read_status: 'pending', read_sha: doc.content_sha256 },
    },
  };
}

export function planClaimDocuments(docs: StoredClaimDoc[], claimId: string, opts?: { customerApproved?: boolean }) {
  const leftAlone = docs.filter((d) => d.claim_id !== claimId).map((d) => d.id);
  const mine = docs.filter((d) => d.claim_id === claimId);
  const approved = opts?.customerApproved === true || DOCUMENT_READ_CUSTOMER_DOCS;
  if (!approved) {
    return {
      ok: false as const,
      reason: 'customer_not_approved' as const,
      queued: [] as string[],
      fresh: [] as string[],
      candidates: mine.map((d) => d.id),
      leftAlone,
    };
  }
  const queued: string[] = [];
  const fresh: string[] = [];
  for (const doc of mine) {
    const plan = planExistingDocument(doc, claimId, opts);
    if (plan.reason === 'already_read') fresh.push(doc.id);
    else if (plan.reason === 'queued') queued.push(doc.id);
  }
  return { ok: true as const, reason: 'planned' as const, queued, fresh, candidates: mine.map((d) => d.id), leftAlone };
}

export function prepareReadMessage(doc: StoredClaimDoc, claimId: string) {
  const plan = planExistingDocument(doc, claimId);
  if (plan.reason === 'other_claim') return 'המסמך שייך לתיק אחר ולא נקרא.';
  if (plan.reason === 'customer_not_approved') return 'המסמך נבחר. הקריאה תרוץ רק אחרי אישור נפרד, ולא בוצעה עכשיו.';
  if (plan.reason === 'already_read') return 'המסמך כבר נותח לפי טביעת הקובץ. לא תבוצע קריאה נוספת.';
  return 'המסמך סומן כממתין לקריאה.';
}

function failedRead(claimId: string, sha: string, summary: string): ExtractedRead {
  return {
    read_status: 'failed',
    read_sha: sha,
    read_source: 'none',
    read_claim_id: claimId,
    read_summary: summary,
    read_text: '',
    read_evidence: '',
    read_doc_type: '',
    read_claim_nums: '',
    read_claim_src: '',
    read_plates: '',
    read_plate_src: '',
    read_dates: '',
    read_date_src: '',
    read_amounts: '',
    read_amount_src: '',
    read_insurer_decision: '',
    read_missing: '',
    read_recommendation: 'ההמלצה לתצוגה בלבד. לא שונה סטטוס ולא נשלחה הודעה.',
  };
}

export async function processStoredDocument(
  doc: StoredClaimDoc,
  bytes: Uint8Array | null,
  extract: (input: {
    bytes: Uint8Array;
    mimeType: string;
    filename: string;
    claimId: string;
    contentSha256: string;
  }) => Promise<ExtractedRead>,
  opts?: { customerApproved?: boolean },
) {
  const approved = opts?.customerApproved === true || DOCUMENT_READ_CUSTOMER_DOCS;
  if (!approved) {
    return { ok: false, reason: 'customer_not_approved', wrote: false, extracted: false, doc };
  }
  if (!doc.id || !doc.claim_id) {
    return { ok: false, reason: 'missing_document', wrote: false, extracted: false, doc };
  }
  if (storedReadIsFresh(doc.doc_meta, doc.content_sha256, doc.claim_id)) {
    return { ok: true, reason: 'already_read', wrote: false, extracted: false, doc };
  }
  const processing: StoredClaimDoc = {
    ...doc,
    storage_path: doc.storage_path,
    doc_meta: { ...metaOf(doc), read_status: 'processing', read_sha: doc.content_sha256 },
  };
  const finish = (read: ExtractedRead, extracted: boolean) => {
    if (read.read_claim_id !== doc.claim_id) {
      return { ok: false, reason: 'other_claim', wrote: false, extracted, doc };
    }
    return {
      ok: read.read_status === 'ready' || read.read_status === 'unreadable',
      reason: read.read_status,
      wrote: true,
      extracted,
      doc: {
        ...processing,
        id: doc.id,
        claim_id: doc.claim_id,
        storage_path: doc.storage_path,
        original_name: doc.original_name,
        doc_meta: { ...metaOf(processing), ...read },
      },
    };
  };
  if (!bytes || !bytes.byteLength) {
    return finish(failedRead(doc.claim_id, doc.content_sha256, 'הקריאה נכשלה. לא התקבל תוכן הקובץ.'), false);
  }
  try {
    const read = await extract({
      bytes,
      mimeType: doc.mime_type || '',
      filename: doc.original_name || '',
      claimId: doc.claim_id,
      contentSha256: doc.content_sha256,
    });
    return finish(read, true);
  } catch {
    return finish(failedRead(doc.claim_id, doc.content_sha256, 'הקריאה נכשלה. לא נשמרו פרטים.'), false);
  }
}

export const READ_META_KEYS = [
  'read_status',
  'read_sha',
  'read_source',
  'read_claim_id',
  'read_summary',
  'read_text',
  'read_evidence',
  'read_doc_type',
  'read_claim_nums',
  'read_claim_src',
  'read_plates',
  'read_plate_src',
  'read_dates',
  'read_date_src',
  'read_amounts',
  'read_amount_src',
  'read_insurer_decision',
  'read_missing',
  'read_recommendation',
] as const;

const READ_STATUSES = new Set(['pending', 'processing', 'ready', 'unreadable', 'failed']);
const READ_SOURCES = new Set(['pdf_text', 'ocr', 'none', '']);
const READ_LIMITS: Record<string, number> = {
  read_text: 4000,
  read_summary: 800,
  read_evidence: 800,
  read_recommendation: 400,
  read_sha: 128,
  read_claim_id: 80,
};

export function readMetaPatch(meta: Record<string, string>) {
  const patch: Record<string, string> = {};
  for (const key of READ_META_KEYS) {
    if (typeof meta[key] === 'string') patch[key] = meta[key];
  }
  return patch;
}

export function applyStoredReadMeta(
  prev: Record<string, string>,
  patch: Record<string, unknown>,
  claimId: string,
) {
  const present = READ_META_KEYS.filter((key) => patch[key] !== undefined);
  if (!present.length) return { ok: true as const, meta: { ...prev }, changed: false };
  if (typeof patch.read_claim_id !== 'string' || patch.read_claim_id !== claimId) {
    return { ok: false as const, error: 'other_claim' as const };
  }
  if (typeof patch.read_status !== 'string' || !READ_STATUSES.has(patch.read_status)) {
    return { ok: false as const, error: 'invalid_read_status' as const };
  }
  if (patch.read_source !== undefined && (typeof patch.read_source !== 'string' || !READ_SOURCES.has(patch.read_source))) {
    return { ok: false as const, error: 'invalid_read_source' as const };
  }
  for (const key of present) {
    if (typeof patch[key] !== 'string') return { ok: false as const, error: 'invalid_read_value' as const };
  }
  const prevStatus = prev.read_status;
  const previousKept = (prevStatus === 'ready' || prevStatus === 'unreadable') && prev.read_claim_id === claimId;
  const sameFile = previousKept && !!prev.read_sha && prev.read_sha === patch.read_sha;
  if (sameFile || (patch.read_status === 'failed' && previousKept)) {
    return { ok: true as const, meta: { ...prev }, changed: false };
  }
  const meta = { ...prev };
  for (const key of present) meta[key] = String(patch[key]).slice(0, READ_LIMITS[key] || 240);
  meta.read_claim_id = claimId;
  return { ok: true as const, meta, changed: true };
}
