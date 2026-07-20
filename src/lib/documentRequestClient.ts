import { supabase } from '@/integrations/supabase/client';

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
