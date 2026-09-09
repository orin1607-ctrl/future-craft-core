/** Customer-request center helpers on existing claims_tasks.row_data. No new tables. */

import type { ClaimRecord } from './claimsConstants';

export const REQUEST_CENTER_FLAG = 'requestCenter';
export const SIGN_TEMPLATES_CONFIG_KEY = 'CUSTOMER_REQUEST_TEMPLATES';

export const CUSTOMER_REQUEST_CENTER_KINDS: Array<{ key: string; label: string }> = [
  { key: 'ask_document', label: 'בקשת מסמך / תמונה' },
  { key: 'ask_info', label: 'בקשת מידע / עדכון' },
  { key: 'ask_signature', label: 'שליחת מסמך לחתימה' },
];

export type SignTemplate = {
  id: string;
  name: string;
  kind: 'text' | 'file';
  body?: string;
  fileName?: string;
  mime?: string;
  bytesB64?: string;
  createdAt: string;
};

export type RequestHistoryEntry = { at: string; by: string; action: string; note: string };

export function isRequestCenterTask(t: { requestCenter?: string; audience?: string }) {
  return t.audience === 'customer' && t.requestCenter === 'true';
}

export function requestCenterKindLabel(key: string) {
  return CUSTOMER_REQUEST_CENTER_KINDS.find((x) => x.key === key)?.label || key || 'בקשה ללקוח';
}

export function formatDueHe(isoDate: string): string {
  const s = String(isoDate || '').trim();
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}`;
  const he = s.match(/^(\d{1,2})[./](\d{1,2})/);
  if (he) return `${he[1].padStart(2, '0')}/${he[2].padStart(2, '0')}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function customerRequestTitle(t: { title?: string; action?: string; requestText?: string; customerKind?: string }): string {
  const title = String(t.title || '').trim();
  if (title) return title;
  const action = String(t.action || '').replace(/^בקשת לקוח ·\s*/, '').replace(/\s·\s\d+$/, '').trim();
  if (action) return action;
  const text = String(t.requestText || '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 42);
  return requestCenterKindLabel(t.customerKind || '');
}

function requestStatusOf(t: { customerStatus?: string; done?: string }) {
  if (t.customerStatus) return t.customerStatus;
  if (t.done === 'true') return 'done';
  return 'pending';
}

export function showsCustomerRequestLabel(t: ClaimRecord): boolean {
  if (!isRequestCenterTask(t)) return false;
  const st = requestStatusOf(t);
  if (t.done === 'true' || st === 'done' || st === 'cancelled') return false;
  if (t.tableAlert === 'off') return false;
  return t.tableAlert === 'on' || t.tableAlert === 'keep' || t.showOnLabels === 'true';
}

export function customerRequestTableLabel(t: ClaimRecord): string {
  const title = customerRequestTitle(t).replace(/\s+/g, ' ').trim().slice(0, 36);
  const due = formatDueHe(t.dueDate || '');
  const st = requestStatusOf(t);
  const prefix = st === 'received_pending_review'
    ? 'התקבל'
    : st === 'awaiting_signature'
      ? 'ממתין לחתימה'
      : (t.customerKind === 'ask_signature' ? 'ממתין לחתימה' : `חסר ${title}`);
  if (st === 'received_pending_review') {
    return due ? `התקבל — ממתין לבדיקה · עד ${due}` : 'התקבל — ממתין לבדיקה';
  }
  if (prefix.startsWith('ממתין לחתימה')) {
    return due ? `ממתין לחתימה — עד ${due}` : 'ממתין לחתימה';
  }
  return due ? `${prefix} — עד ${due}` : prefix;
}

export function parseLinkedDocIds(raw: string | undefined): string[] {
  return String(raw || '')
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function joinLinkedDocIds(ids: string[]): string {
  return [...new Set(ids.map((x) => x.trim()).filter(Boolean))].join(',');
}

export function parseRequestHistory(raw: string | undefined): RequestHistoryEntry[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => {
      const row = (x && typeof x === 'object') ? x as Record<string, unknown> : {};
      return {
        at: String(row.at || ''),
        by: String(row.by || ''),
        action: String(row.action || ''),
        note: String(row.note || ''),
      };
    });
  } catch {
    return [];
  }
}

export function appendRequestHistory(
  raw: string | undefined,
  entry: RequestHistoryEntry,
): string {
  return JSON.stringify([...parseRequestHistory(raw), entry].slice(-40));
}

export function parseSignTemplates(raw: string | undefined): SignTemplate[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as unknown;
    const list = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { templates?: unknown }).templates)
      ? (parsed as { templates: unknown[] }).templates
      : []);
    return list.map((x) => {
      const row = (x && typeof x === 'object') ? x as Record<string, unknown> : {};
      const kind = row.kind === 'file' ? 'file' : 'text';
      return {
        id: String(row.id || ''),
        name: String(row.name || 'תבנית'),
        kind,
        body: String(row.body || ''),
        fileName: String(row.fileName || ''),
        mime: String(row.mime || ''),
        bytesB64: String(row.bytesB64 || ''),
        createdAt: String(row.createdAt || ''),
      };
    }).filter((x) => x.id && x.name);
  } catch {
    return [];
  }
}

export function serializeSignTemplates(list: SignTemplate[]): string {
  return JSON.stringify({
    templates: list.map((t) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      body: t.kind === 'text' ? String(t.body || '').slice(0, 20_000) : '',
      fileName: t.fileName || '',
      mime: t.mime || '',
      bytesB64: t.kind === 'file' ? String(t.bytesB64 || '').slice(0, 1_600_000) : '',
      createdAt: t.createdAt,
    })),
  });
}

export function fileFromTemplate(t: SignTemplate): File | null {
  if (t.kind !== 'file' || !t.bytesB64) return null;
  try {
    const bin = atob(t.bytesB64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return new File([out], t.fileName || `${t.name}.pdf`, { type: t.mime || 'application/pdf' });
  } catch {
    return null;
  }
}

export async function templateFromFile(name: string, file: File): Promise<SignTemplate | { error: string }> {
  if (file.size > 900_000) return { error: 'שמירה למאגר מוגבלת לקובץ עד 900KB. הקובץ עדיין ישמש לשליחה הנוכחית בתיק.' };
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    id: `TPL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    name: name.trim() || file.name || 'מסמך',
    kind: 'file',
    fileName: file.name,
    mime: file.type || 'application/pdf',
    bytesB64: btoa(bin),
    createdAt: new Date().toISOString(),
  };
}

export function newTextTemplate(name: string, body: string): SignTemplate {
  return {
    id: `TPL-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    name: name.trim() || 'תבנית',
    kind: 'text',
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
}

export function uniqueTreatmentAction(title: string, taskId: string): string {
  const short = taskId.replace(/^TSK-/, '').slice(-8);
  return `בקשת לקוח · ${String(title || 'בקשה').trim()} · ${short}`;
}

export function mergeDocRequestItems(
  existing: Array<{ label?: string; doc_key?: string; status?: string }>,
  add: { label: string; doc_key?: string },
): Array<{ label: string; doc_key: string }> {
  const out: Array<{ label: string; doc_key: string }> = [];
  const seen = new Set<string>();
  for (const row of existing) {
    const label = String(row.label || '').trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, doc_key: String(row.doc_key || 'custom') });
  }
  const label = String(add.label || '').trim();
  if (label && !seen.has(label)) out.push({ label, doc_key: add.doc_key || 'custom' });
  return out;
}

export function docsForCustomerRequest(
  task: ClaimRecord,
  files: Array<{ id: string; doc_request_id?: string | null; original_name?: string; source?: string; created_at?: string }>,
): typeof files {
  const linked = new Set(parseLinkedDocIds(task.linkedDocIds));
  const reqId = String(task.docRequestId || '');
  const minted = Date.parse(task.uploadLinkAt || '');
  return files.filter((f) => {
    if (linked.has(f.id)) return true;
    if (reqId && f.doc_request_id === reqId) return true;
    if (task.signFileId && f.id === task.signFileId) return true;
    if (task.signedFileId && f.id === task.signedFileId) return true;
    if (Number.isFinite(minted) && f.source === 'customer') {
      const at = Date.parse(f.created_at || '');
      if (Number.isFinite(at) && at >= minted - 5_000) {
        const title = customerRequestTitle(task).toLowerCase();
        const name = String(f.original_name || '').toLowerCase();
        if (title && name.includes(title.slice(0, 12))) return true;
      }
    }
    return false;
  });
}

export function nextUploadStatus(task: ClaimRecord, newFileIds: string[]): Partial<ClaimRecord> {
  const linked = joinLinkedDocIds([...parseLinkedDocIds(task.linkedDocIds), ...newFileIds]);
  return {
    linkedDocIds: linked,
    customerStatus: 'received_pending_review',
    done: 'false',
  };
}
