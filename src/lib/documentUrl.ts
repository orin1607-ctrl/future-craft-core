import { supabase } from '@/integrations/supabase/client';

/** Short-lived view/download access for private documents bucket. */
export const DOCUMENT_SIGNED_URL_TTL_SEC = 900;

const cache = new Map<string, { url: string; exp: number }>();

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
  const hit = cache.get(path);
  if (hit && hit.exp > now + 15_000) return hit.url;

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, DOCUMENT_SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    console.error('createDocumentSignedUrl', error?.message || 'no url');
    return null;
  }
  cache.set(path, { url: data.signedUrl, exp: now + DOCUMENT_SIGNED_URL_TTL_SEC * 1000 });
  return data.signedUrl;
}

export async function resolveDocumentUrl(urlOrPath: string | null | undefined): Promise<string> {
  if (!urlOrPath) return '';
  const path = extractDocumentsStoragePath(urlOrPath);
  if (!path) return urlOrPath;
  const signed = await createDocumentSignedUrl(path);
  return signed || '';
}
