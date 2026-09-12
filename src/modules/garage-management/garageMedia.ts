/**
 * Isolated garage-case media.
 * Photos/documents belong to garage_case_id only — never claim_id.
 * Private bucket garage-media. Signed URLs only. No Claims Storage / claims-docs.
 */
import { supabase } from '@/integrations/supabase/client';
import { isGarageSchemaMissing } from './garageBook';

export const GARAGE_MEDIA_BUCKET = 'garage-media';
export const GARAGE_MEDIA_TABLE = 'garage_media';

export const GARAGE_MEDIA_CATEGORIES = [
  { id: 'customer_order', label: 'הזמנת לקוח' },
  { id: 'quote_photos', label: 'תמונות להצעת מחיר' },
  { id: 'intake', label: 'תמונות קבלת רכב' },
  { id: 'angles', label: 'קבלת רכב' },
  { id: 'damage', label: 'תמונות נזק' },
  { id: 'during_work', label: 'במהלך עבודה' },
  { id: 'finish', label: 'תמונות סיום' },
  { id: 'parts_invoices', label: 'חלקים / חשבוניות חלקים' },
  { id: 'quotes', label: 'הצעות מחיר' },
  { id: 'customer_approvals', label: 'אישורי לקוח' },
  { id: 'intake_docs', label: 'מסמכי קבלה' },
  { id: 'delivery', label: 'מסירה' },
  { id: 'other', label: 'אחר' },
] as const;

export type GarageMediaCategoryId = (typeof GARAGE_MEDIA_CATEGORIES)[number]['id'];

export type GarageMediaItem = {
  id: string;
  garage_case_id: string;
  category: GarageMediaCategoryId;
  title: string;
  storage_path?: string;
  mime_type?: string;
  byte_size?: number;
  created_at?: string;
  signedUrl?: string;
};

export const GARAGE_MEDIA_PENDING_MESSAGE =
  'שמירת תמונות מוסך ממתינה ל-bucket הפרטי garage-media ולטבלת garage_media ב-Staging. לא משתמשים ב-Claims Storage.';

function tbl(name: string) {
  return supabase.from(name as never);
}

export function emptyGarageGallery(garageCaseId: string): Record<GarageMediaCategoryId, GarageMediaItem[]> {
  const out = {} as Record<GarageMediaCategoryId, GarageMediaItem[]>;
  for (const cat of GARAGE_MEDIA_CATEGORIES) out[cat.id] = [];
  void garageCaseId;
  return out;
}

export function groupGarageMedia(garageCaseId: string, items: GarageMediaItem[]) {
  const grouped = emptyGarageGallery(garageCaseId);
  for (const item of items) {
    if (grouped[item.category]) grouped[item.category].push(item);
    else grouped.other.push(item);
  }
  return grouped;
}

export async function probeGarageMedia(): Promise<{ ready: boolean; pending: boolean; error?: string }> {
  const { error } = await tbl(GARAGE_MEDIA_TABLE).select('id').limit(1);
  if (!error) return { ready: true, pending: false };
  if (isGarageSchemaMissing(error)) return { ready: false, pending: true, error: GARAGE_MEDIA_PENDING_MESSAGE };
  return { ready: false, pending: false, error: error.message || GARAGE_MEDIA_PENDING_MESSAGE };
}

export async function listGarageMedia(garageCaseId: string): Promise<GarageMediaItem[]> {
  if (!garageCaseId) return [];
  const { data, error } = await tbl(GARAGE_MEDIA_TABLE)
    .select('*')
    .eq('garage_case_id', garageCaseId)
    .order('created_at', { ascending: true });
  if (error) {
    if (isGarageSchemaMissing(error)) return [];
    throw new Error(error.message || 'טעינת מדיה נכשלה');
  }
  const rows = (data || []) as GarageMediaItem[];
  const withUrls: GarageMediaItem[] = [];
  for (const row of rows) {
    let signedUrl = '';
    if (row.storage_path) {
      const signed = await supabase.storage.from(GARAGE_MEDIA_BUCKET).createSignedUrl(row.storage_path, 3600);
      signedUrl = signed.data?.signedUrl || '';
    }
    withUrls.push({ ...row, signedUrl });
  }
  return withUrls;
}

function extOf(name: string, mime: string) {
  const fromName = String(name || '').split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  return 'jpg';
}

export function garageMediaObjectPath(input: {
  garageCaseId: string;
  category: string;
  fileName: string;
  mimeType: string;
  id?: string;
}) {
  const id = input.id || crypto.randomUUID();
  const ext = extOf(input.fileName, input.mimeType);
  return `${input.garageCaseId}/${input.category}/${id}.${ext}`;
}

export async function uploadGarageMedia(input: {
  garageCaseId: string;
  category: GarageMediaCategoryId;
  title: string;
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
  actorId?: string;
}): Promise<GarageMediaItem> {
  if (!input.garageCaseId) throw new Error('אין מזהה תיק להעלאה');
  const id = crypto.randomUUID();
  const path = garageMediaObjectPath({
    garageCaseId: input.garageCaseId,
    category: input.category,
    fileName: input.fileName,
    mimeType: input.mimeType,
    id,
  });
  const blob = new Blob([input.bytes], { type: input.mimeType || 'application/octet-stream' });
  const { error: upErr } = await supabase.storage.from(GARAGE_MEDIA_BUCKET).upload(path, blob, {
    contentType: input.mimeType || undefined,
    upsert: false,
  });
  if (upErr) {
    if (/not found|does not exist|Bucket not found/i.test(upErr.message)) {
      throw new Error(GARAGE_MEDIA_PENDING_MESSAGE);
    }
    throw new Error(upErr.message || 'העלאת הקובץ נכשלה');
  }
  const insert = {
    id,
    garage_case_id: input.garageCaseId,
    category: input.category,
    title: input.title || input.fileName || 'קובץ',
    storage_path: path,
    mime_type: input.mimeType || '',
    byte_size: input.bytes.byteLength,
    created_by: input.actorId || null,
  };
  const { data, error } = await tbl(GARAGE_MEDIA_TABLE).insert(insert as never).select('*').single();
  if (error) {
    await supabase.storage.from(GARAGE_MEDIA_BUCKET).remove([path]);
    if (isGarageSchemaMissing(error)) throw new Error(GARAGE_MEDIA_PENDING_MESSAGE);
    throw new Error(error.message || 'שמירת רשומת מדיה נכשלה');
  }
  const row = data as GarageMediaItem;
  const signed = await supabase.storage.from(GARAGE_MEDIA_BUCKET).createSignedUrl(path, 3600);
  return { ...row, signedUrl: signed.data?.signedUrl || '' };
}
