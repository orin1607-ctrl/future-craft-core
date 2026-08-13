/** Oren Car production deploy 2026-08-10 — code-only, no data changes */
import { supabase } from '@/integrations/supabase/client';
import { computeExpiryFromValidity } from '@/lib/driverDocumentExpiry';

export type DocumentEntityType =
  | 'driver'
  | 'vehicle'
  | 'employee'
  | 'customer'
  | 'supplier'
  | 'accident'
  | 'company';

export type DocumentTypeDef = {
  id: string;
  key: string;
  label_he: string;
  category: string;
  entity_scopes: string[];
  requires_expiry: boolean;
  requires_manager_approval: boolean;
  allowed_mime_types: string[];
  max_file_bytes: number;
  allow_multiple: boolean;
  storage_folder: string;
  message_template_he: string;
  is_active: boolean;
  sort_order: number;
  validity_years?: number | null;
};

export type DocumentRequestRow = {
  id: string;
  company_name: string;
  document_type_key: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  recipient_name: string;
  recipient_phone: string;
  channel: string;
  status: string;
  requested_by_name: string;
  sent_at: string | null;
  opened_at: string | null;
  uploaded_at: string | null;
  token_expires_at: string;
  created_at: string;
  notes: string;
};

export type DocumentVersionRow = {
  id: string;
  document_type_key: string;
  version_no: number;
  is_current: boolean;
  public_url: string;
  original_name: string;
  created_at: string;
  source: string;
  request_id: string | null;
  expiry_date?: string | null;
};

function publicAppOrigin(): string {
  const origin = window.location.origin;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  // GH Pages: https://host/future-craft-core
  if (base && base !== '/') return `${origin}${base}`;
  return origin;
}

async function invoke(body: Record<string, unknown> | FormData) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const headers: Record<string, string> = {
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-request`, {
    method: 'POST',
    headers: isForm ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(json.error || `document-request failed (${res.status})`);
  }
  return json;
}

export async function listDocumentTypes(entityType: DocumentEntityType): Promise<DocumentTypeDef[]> {
  const json = await invoke({ action: 'list_types', entity_type: entityType });
  return json.types as DocumentTypeDef[];
}

export async function createDocumentRequest(input: {
  document_type_key: string;
  entity_type: DocumentEntityType;
  entity_id: string;
  entity_label: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_email?: string;
  channel?: string;
  notes?: string;
  expires_hours?: number;
}) {
  const origin = publicAppOrigin();
  return invoke({
    action: 'create',
    ...input,
    channel: input.channel || 'link',
    public_app_origin: origin,
  }) as Promise<{
    success: true;
    request_id: string;
    status: string;
    token: string;
    upload_url: string;
    token_expires_at: string;
    message_preview: string;
    whatsapp_hint: string;
  }>;
}

export async function listEntityDocumentHistory(entityType: DocumentEntityType, entityId: string) {
  const json = await invoke({
    action: 'list_for_entity',
    entity_type: entityType,
    entity_id: entityId,
  });
  return {
    requests: (json.requests || []) as DocumentRequestRow[],
    versions: (json.versions || []) as DocumentVersionRow[],
  };
}

/** Public (no login) — used by /upload-request page */
export async function publicGetDocumentRequest(token: string) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-request?action=get&token=${encodeURIComponent(token)}`,
    {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    },
  );
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'not_found');
  return json.request;
}

export async function publicOpenDocumentRequest(token: string) {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-request`, {
    method: 'POST',
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'open', token }),
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'open_failed');
  return json.request;
}

export async function publicUploadDocumentRequest(params: {
  token: string;
  file: File;
  expiry_date?: string;
}) {
  const form = new FormData();
  form.set('action', 'upload');
  form.set('token', params.token);
  if (params.expiry_date) form.set('expiry_date', params.expiry_date);
  form.set('file', params.file);
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/document-request`, {
    method: 'POST',
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: form,
  });
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || 'upload_failed');
  return json;
}

export async function decideDocumentRequest(params: {
  request_id: string;
  decision: 'approve' | 'reject';
  note?: string;
}) {
  return invoke({
    action: params.decision,
    request_id: params.request_id,
    note: params.note || '',
  }) as Promise<{ success: true; request_id: string; status: string }>;
}

const META_CATEGORY_MAP: Record<string, string> = {
  driver_license: 'driver-license',
  vehicle_license: 'vehicle-license',
  mandatory_insurance: 'insurance',
  comprehensive_insurance: 'comprehensive',
  health_declaration: 'health',
  medical_certificate: 'health',
  traffic_info: 'other',
  traffic_ticket: 'other',
  invoice: 'vendors',
  receipt: 'receipts',
  vehicle_photo: 'other',
  general_document: 'other',
};

function sanitizeFileName(name: string): string {
  return (name || 'upload.bin').replace(/[^\w.\-()א-ת\s]/g, '_').slice(0, 180);
}

function fileAllowed(file: File, allowed: string[]): boolean {
  const mime = file.type || 'application/octet-stream';
  if (!allowed.length || allowed.includes('*') || allowed.includes(mime)) return true;
  const lower = file.name.toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.heic', '.heif'].some((ext) => lower.endsWith(ext));
}

/** Manager uploads a document directly from computer (does not replace driver link flow). */
export async function adminUploadEntityDocument(params: {
  entityType: DocumentEntityType;
  entityId: string;
  entityLabel: string;
  documentTypeKey: string;
  file: File;
  expiryDate?: string;
  documentDate?: string;
  companyName?: string;
}) {
  const types = await listDocumentTypes(params.entityType);
  const typeDef = types.find((t) => t.key === params.documentTypeKey);
  if (!typeDef) throw new Error('סוג מסמך לא נמצא');

  const allowed = typeDef.allowed_mime_types?.length ? typeDef.allowed_mime_types : ['image/jpeg', 'image/png', 'application/pdf'];
  const maxBytes = Number(typeDef.max_file_bytes || 10 * 1024 * 1024);
  if (params.file.size > maxBytes) throw new Error('הקובץ גדול מדי');
  if (!fileAllowed(params.file, allowed)) throw new Error('סוג קובץ לא נתמך');

  const issueDate = params.documentDate || new Date().toISOString().split('T')[0];
  let resolvedExpiry = params.expiryDate || null;
  if (!resolvedExpiry && typeDef.validity_years) {
    resolvedExpiry = computeExpiryFromValidity(issueDate, typeDef.validity_years);
  }
  if (typeDef.requires_expiry && !resolvedExpiry) {
    throw new Error('נדרש תאריך תוקף למסמך זה');
  }

  let companyName = params.companyName || '';
  let resolvedVehiclePlate = '';
  if (params.entityType === 'vehicle') {
    const { data: veh } = await supabase
      .from('vehicles')
      .select('license_plate, company_name')
      .eq('id', params.entityId)
      .maybeSingle();
    resolvedVehiclePlate = veh?.license_plate || params.entityLabel || '';
    if (!companyName) companyName = veh?.company_name || '';
  }
  if (!companyName && params.entityType === 'driver') {
    const { data: d } = await supabase.from('drivers').select('company_name').eq('id', params.entityId).maybeSingle();
    companyName = d?.company_name || '';
  }

  const folder = typeDef.storage_folder || 'general';
  const safeName = sanitizeFileName(params.file.name);
  const filePath = `admin-uploads/${params.entityType}/${params.entityId}/${Date.now()}_${safeName}`;
  const contentType = params.file.type || undefined;

  const { error: upErr } = await supabase.storage.from('documents').upload(filePath, params.file, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  });
  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from('documents').getPublicUrl(filePath);
  const publicUrl = pub?.publicUrl || '';

  const { data: lastVer } = await supabase
    .from('document_versions')
    .select('version_no')
    .eq('entity_type', params.entityType)
    .eq('entity_id', params.entityId)
    .eq('document_type_key', params.documentTypeKey)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVer = (lastVer?.version_no || 0) + 1;

  await supabase
    .from('document_versions')
    .update({ is_current: false })
    .eq('entity_type', params.entityType)
    .eq('entity_id', params.entityId)
    .eq('document_type_key', params.documentTypeKey)
    .eq('is_current', true);

  const { data: version, error: verErr } = await supabase
    .from('document_versions')
    .insert({
      company_name: companyName,
      document_type_key: params.documentTypeKey,
      entity_type: params.entityType,
      entity_id: params.entityId,
      version_no: nextVer,
      is_current: true,
      file_path: filePath,
      public_url: publicUrl,
      original_name: params.file.name || safeName,
      content_type: contentType || null,
      file_size_bytes: params.file.size,
      source: 'manager_upload',
      expiry_date: resolvedExpiry,
    })
    .select('*')
    .single();
  if (verErr || !version) throw new Error(verErr?.message || 'שגיאה בשמירת גרסת מסמך');

  const metaCategory = META_CATEGORY_MAP[params.documentTypeKey] || params.documentTypeKey;
  const vehiclePlate = params.entityType === 'vehicle' ? resolvedVehiclePlate : '';
  const driverName = params.entityType === 'driver' ? params.entityLabel : '';
  const { data: meta } = await supabase
    .from('document_metadata')
    .insert({
      file_path: filePath,
      category: metaCategory,
      company_name: companyName,
      vehicle_plate: vehiclePlate,
      driver_name: driverName,
      original_name: params.file.name || safeName,
      display_name: params.file.name || safeName,
      document_date: issueDate,
    })
    .select('id')
    .maybeSingle();

  if (meta?.id) {
    await supabase.from('document_versions').update({ metadata_id: meta.id }).eq('id', version.id);
  }

  if (params.entityType === 'driver' && params.documentTypeKey === 'driver_license') {
    await supabase.from('drivers').update({ license_image_url: publicUrl }).eq('id', params.entityId);
  }
  if (params.entityType === 'vehicle' && params.documentTypeKey === 'vehicle_license') {
    await supabase.from('vehicles').update({ license_doc_url: publicUrl }).eq('id', params.entityId);
  }

  return { success: true as const, version, public_url: publicUrl };
}

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  created: 'נוצרה בקשה',
  sent: 'נשלח',
  delivered: 'נמסר',
  opened: 'נפתח',
  uploaded: 'הועלה',
  pending_approval: 'ממתין לאישור',
  approved: 'אושר',
  rejected: 'נדחה',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
};
