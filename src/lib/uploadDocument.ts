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
  displayName?: string;
  documentDate?: string;
  accidentId?: string;
  claimNumber?: string;
}

export async function uploadDocument(options: UploadDocumentOptions): Promise<UploadDocumentResult> {
  const {
    file,
    storageFolder,
    category,
    companyName,
    vehiclePlate,
    manufacturer,
    model,
    driverName,
    displayName,
    documentDate,
    accidentId,
    claimNumber,
  } = options;

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

  const publicUrl = filePath;

  // A missing company must not silently skip registration: without a
  // document_metadata row the file exists in storage but never shows up in the
  // vehicle documents area.
  if (category) {
    const { data: metadata, error: metaError } = await supabase
      .from('document_metadata')
      .insert({
        file_path: filePath,
        category,
        company_name: companyName || '',
        vehicle_plate: vehiclePlate || '',
        driver_name: driverName || '',
        manufacturer: manufacturer || '',
        model: model || '',
        original_name: file.name,
        display_name: displayName || null,
        document_date: documentDate || null,
        claim_number: claimNumber || '',
        uploaded_by: userId,
      })
      .select('id')
      .single();

    if (metaError) {
      console.error('document_metadata insert error:', metaError);
      if (accidentId) await supabase.storage.from('documents').remove([filePath]);
      return { ok: false, error: `הקובץ הועלה אך לא נרשם במערכת המסמכים: ${metaError.message}` };
    }

    // Accident documents reuse the existing document version/entity mechanism.
    // The same storage object and metadata row are referenced; no duplicate file.
    if (accidentId) {
      const { error: versionError } = await supabase.from('document_versions').insert({
        company_name: companyName || '',
        document_type_key: category,
        entity_type: 'accident',
        entity_id: accidentId,
        version_no: 1,
        is_current: true,
        file_path: filePath,
        public_url: publicUrl,
        original_name: file.name,
        content_type: contentType || '',
        file_size_bytes: file.size,
        source: 'manager_upload',
        uploaded_by: userId,
        metadata_id: metadata.id,
      });
      if (versionError) {
        console.error('document_versions insert error:', versionError);
        await supabase.from('document_metadata').delete().eq('id', metadata.id);
        await supabase.storage.from('documents').remove([filePath]);
        return { ok: false, error: `המסמך לא שויך לתאונה: ${versionError.message}` };
      }
    }
  }

  return { ok: true, publicUrl, filePath };
}

export async function deleteStoredDocument(
  filePath: string,
  metadataId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: storageErr } = await supabase.storage.from('documents').remove([filePath]);
  if (storageErr) return { ok: false, error: storageErr.message };

  if (metadataId) {
    const { error: metaErr } = await supabase.from('document_metadata').delete().eq('id', metadataId);
    if (metaErr) return { ok: false, error: metaErr.message };
  }

  return { ok: true };
}
