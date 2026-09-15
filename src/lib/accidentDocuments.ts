import { supabase } from '@/integrations/supabase/client';
import { uploadDocument, type UploadDocumentOptions, type UploadDocumentResult } from '@/lib/uploadDocument';

export type AccidentDocRef = {
  id: string;
  claim_number?: string | null;
  vehicle_plate?: string | null;
};

export type AccidentAttachedDoc = {
  id: string;
  file_path: string;
  original_name: string;
  created_at: string;
  source: 'version' | 'metadata';
};

const DOCUMENT_SIGNED_URL_TTL_SEC = 900;
const signedUrlCache = new Map<string, { url: string; exp: number }>();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function collectImageValue(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw || raw === '[]' || raw === 'null') return [];
    if (raw.startsWith('[') || raw.startsWith('{')) {
      try {
        return collectImageValue(JSON.parse(raw));
      } catch {
        return [raw];
      }
    }
    return [raw];
  }
  if (Array.isArray(value)) return value.flatMap(collectImageValue);
  const obj = asRecord(value);
  if (!obj) return [];
  return collectImageValue(obj.file_path || obj.path || obj.public_url || obj.url);
}

export function parseAccidentImages(images: string | null | undefined): string[] {
  return collectImageValue(images).filter((item, index, all) => all.indexOf(item) === index);
}

export function normalizePlateKey(plate: string | null | undefined): string {
  return (plate || '').replace(/[-\s]/g, '').toLowerCase();
}

export function extractDocumentsStoragePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const raw = urlOrPath.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    if (raw.startsWith('data:') || raw.startsWith('blob:')) return null;
    return raw.replace(/^\/+/, '');
  }
  const match = raw.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/documents\/([^?]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export async function createDocumentSignedUrl(filePath: string): Promise<string | null> {
  const path = extractDocumentsStoragePath(filePath);
  if (!path) return null;
  const now = Date.now();
  const hit = signedUrlCache.get(path);
  if (hit && hit.exp > now + 15_000) return hit.url;

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, DOCUMENT_SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    console.error('createDocumentSignedUrl', error?.message || 'no url');
    return null;
  }
  signedUrlCache.set(path, { url: data.signedUrl, exp: now + DOCUMENT_SIGNED_URL_TTL_SEC * 1000 });
  return data.signedUrl;
}

export function normalizeAccidentFilePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  const extracted = extractDocumentsStoragePath(urlOrPath);
  if (!extracted) return null;
  return extracted.replace(/^documents\//i, '');
}

export function accidentDocumentMatches(
  doc: { claim_number?: string | null; vehicle_plate?: string | null; display_name?: string | null },
  accident: AccidentDocRef,
): boolean {
  const claim = (accident.claim_number || '').trim();
  const docClaim = (doc.claim_number || '').trim();
  if (claim && docClaim && claim === docClaim) return true;

  const plate = normalizePlateKey(accident.vehicle_plate);
  const docPlate = normalizePlateKey(doc.vehicle_plate);
  if (plate && docPlate && plate === docPlate) {
    if (!claim || !docClaim) return true;
    return claim === docClaim;
  }

  const display = (doc.display_name || '').trim();
  return !!claim && display.includes(claim);
}

export function mergeAccidentDocuments(
  versions: Array<{ id?: string; file_path?: string | null; public_url?: string | null; original_name?: string | null; created_at?: string | null }>,
  metadata: Array<{ id?: string; file_path?: string | null; original_name?: string | null; created_at?: string | null; claim_number?: string | null; vehicle_plate?: string | null; display_name?: string | null }>,
  accident: AccidentDocRef,
): AccidentAttachedDoc[] {
  const seen = new Set<string>();
  const docs: AccidentAttachedDoc[] = [];

  const push = (
    row: { id?: string; file_path?: string | null; public_url?: string | null; original_name?: string | null; created_at?: string | null },
    source: AccidentAttachedDoc['source'],
  ) => {
    const filePath = normalizeAccidentFilePath(row.file_path || row.public_url || '') || row.file_path || row.public_url || '';
    if (!filePath) return;
    const key = filePath.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    docs.push({
      id: row.id || `${source}:${filePath}`,
      file_path: filePath,
      original_name: row.original_name || 'מסמך',
      created_at: row.created_at || '',
      source,
    });
  };

  versions.forEach((row) => push(row, 'version'));
  metadata.filter((row) => accidentDocumentMatches(row, accident)).forEach((row) => push(row, 'metadata'));
  return docs;
}

export async function resolveAccidentFileUrl(urlOrPath: string | null | undefined): Promise<string> {
  if (!urlOrPath) return '';
  const path = normalizeAccidentFilePath(urlOrPath);
  if (path) {
    const signed = await createDocumentSignedUrl(path);
    return signed || '';
  }
  if (/^https?:\/\//i.test(urlOrPath) || urlOrPath.startsWith('data:') || urlOrPath.startsWith('blob:')) {
    return urlOrPath;
  }
  return '';
}

export async function loadAccidentAttachedDocuments(accident: AccidentDocRef): Promise<{
  docs: AccidentAttachedDoc[];
  error: string | null;
}> {
  const versionsQuery = supabase
    .from('document_versions' as never)
    .select('id, file_path, public_url, original_name, created_at')
    .eq('entity_type', 'accident')
    .eq('entity_id', accident.id)
    .order('created_at', { ascending: false });

  const metadataQuery = supabase
    .from('document_metadata')
    .select('id, file_path, original_name, created_at, claim_number, vehicle_plate, display_name')
    .eq('category', 'accident-document')
    .order('created_at', { ascending: false });

  const [versionsRes, metadataRes] = await Promise.all([versionsQuery, metadataQuery]);
  const error = versionsRes.error?.message || metadataRes.error?.message || null;
  return {
    docs: mergeAccidentDocuments(
      (versionsRes.data as never as Array<Record<string, string>>) || [],
      (metadataRes.data as Array<Record<string, string>>) || [],
      accident,
    ),
    error,
  };
}

export async function uploadAccidentAttachedFile(options: UploadDocumentOptions): Promise<UploadDocumentResult> {
  const first = await uploadDocument(options);
  if (first.ok || !options.accidentId) return first;
  if (!/לא שויך לתאונה|document_versions/i.test(first.error)) return first;
  return uploadDocument({ ...options, accidentId: undefined });
}

export async function currentAuthUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id || null;
}
