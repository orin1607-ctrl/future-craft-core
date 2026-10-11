import { documentReadCaption, readClaimDocument, storedReadIfFresh } from './claimDocumentRead';
import { applyStoredReadMeta, readMetaPatch } from '../../../supabase/functions/_shared/claimDocumentReadJob';

export async function prepareSelectedDocumentRead(input: {
  claimId: string;
  fileName: string;
  mimeType?: string;
  existingMeta?: Record<string, string> | null;
  bytes: Uint8Array;
  sha256: string;
  save?: (patch: Record<string, string>) => Promise<{ success?: boolean; doc_meta?: Record<string, string> | null }>;
}) {
  const prev = input.existingMeta && typeof input.existingMeta === 'object' ? { ...input.existingMeta } : {};
  const fresh = storedReadIfFresh(prev, input.sha256);
  if (fresh && fresh.read_claim_id === input.claimId) {
    return { saved: false, message: 'המסמך כבר נותח לפי טביעת הקובץ. לא תבוצע קריאה נוספת.', meta: prev };
  }
  let read;
  try {
    read = await readClaimDocument({
      bytes: input.bytes,
      mimeType: input.mimeType,
      fileName: input.fileName,
      claimId: input.claimId,
      sha256: input.sha256,
      existingMeta: prev,
      useBuiltinOcr: true,
    });
  } catch {
    return { saved: false, message: 'הקריאה נכשלה. הניתוח הקודם נשמר.', meta: prev };
  }
  const applied = applyStoredReadMeta(prev, read, input.claimId);
  if (!applied.ok) return { saved: false, message: 'המסמך שייך לתיק אחר ולא נשמר.', meta: prev };
  if (!applied.changed) {
    return { saved: false, message: 'המסמך כבר נותח לפי טביעת הקובץ. לא תבוצע קריאה נוספת.', meta: applied.meta };
  }
  const patch = readMetaPatch(applied.meta);
  if (!input.save) {
    const caption = documentReadCaption(applied.meta);
    return { saved: true, message: caption?.summary || 'המסמך נשמר.', meta: applied.meta, patch };
  }
  const stored = await input.save(patch);
  if (!stored.success) return { saved: false, message: 'השמירה נכשלה. הניתוח הקודם נשמר.', meta: prev };
  const meta = stored.doc_meta && typeof stored.doc_meta === 'object' ? stored.doc_meta : applied.meta;
  const caption = documentReadCaption(meta);
  return { saved: true, message: caption?.summary || 'המסמך נשמר.', meta };
}
