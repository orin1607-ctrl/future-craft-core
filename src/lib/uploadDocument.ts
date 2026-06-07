import { supabase } from '@/integrations/supabase/client';
import { buildStoragePath } from '@/lib/storage';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
};

export function guessContentType(fileName: string, fileType?: string): string | undefined {
  if (fileType && fileType !== 'application/octet-stream') return fileType;
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] : undefined;
}

export function isPdfUrl(url: string): boolean {
  return /\.pdf($|[?#])/i.test(url);
}

export type UploadDocumentResult =
  | { ok: true; publicUrl: string; filePath: string }
  | { ok: false; error: string };

export interface UploadDocumentOptions {
  file: File;
  storageFolder: string;
  category?: string;
  companyName?: string;
  vehiclePlate?: string;
  manufacturer?: string;
  model?: string;
  driverName?: string;
}

export async function uploadDocument(options: UploadDocumentOptions): Promise<UploadDocumentResult> {
  const { file, storageFolder, category, companyName, vehiclePlate, manufacturer, model, driverName } = options;

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, error: 'יש להתחבר מחדש לפני העלאת קובץ' };
  }

  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'הקובץ גדול מדי (מקסימום 10MB)' };
  }

  const filePath = buildStoragePath(userId, storageFolder, file.name);
  const contentType = guessContentType(file.name, file.type);

  const { error: storageError } = await supabase.storage.from('documents').upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  });

  if (storageError) {
    console.error('Upload error:', storageError);
    return { ok: false, error: storageError.message };
  }

  const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);

  if (category && companyName) {
    const { error: metaError } = await supabase.from('document_metadata').insert({
      file_path: filePath,
      category,
      company_name: companyName,
      vehicle_plate: vehiclePlate || '',
      driver_name: driverName || '',
      manufacturer: manufacturer || '',
      model: model || '',
      original_name: file.name,
      uploaded_by: userId,
    });

    if (metaError) {
      console.error('document_metadata insert error:', metaError);
      return { ok: false, error: `הקובץ הועלה אך לא נרשם במערכת המסמכים: ${metaError.message}` };
    }
  }

  return { ok: true, publicUrl, filePath };
}
