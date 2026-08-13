import { supabase } from '@/integrations/supabase/client';
import {
  listEntityDocumentHistory,
  listDocumentTypes,
  type DocumentTypeDef,
  type DocumentRequestRow,
} from '@/lib/documentRequestClient';
import { documentExpiryStatus, daysUntilDate, formatIsraelDate } from '@/lib/driverDocumentExpiry';

export const TRAFFIC_INFO_TYPE = 'traffic_info';
export const TRAFFIC_TICKET_TYPE = 'traffic_ticket';
export const HEALTH_DECLARATION_TYPE = 'health_declaration';
export const DRIVER_LICENSE_TYPE = 'driver_license';

export type DriverHubSection = 'home' | 'documents' | 'requests' | 'driving' | 'activity';

export const DRIVER_HUB_SECTIONS: DriverHubSection[] = [
  'home',
  'documents',
  'requests',
  'driving',
  'activity',
];

export function parseDriverHubSection(raw: string | null | undefined): DriverHubSection {
  if (raw && DRIVER_HUB_SECTIONS.includes(raw as DriverHubSection)) {
    return raw as DriverHubSection;
  }
  return 'home';
}

export type DriverDocumentVersionRow = {
  id: string;
  document_type_key: string;
  label_he: string;
  public_url: string;
  original_name: string;
  created_at: string;
  expiry_date: string | null;
  version_no: number;
  is_current: boolean;
  status: ReturnType<typeof documentExpiryStatus>;
};

export type DriverAccidentRow = {
  id: string;
  event_number: string;
  vehicle_plate: string;
  status: string;
  date: string;
  description: string;
  imageUrls: string[];
  created_at: string;
};

export type DriverActivityKind =
  | 'document_version'
  | 'document_request'
  | 'accident'
  | 'declaration'
  | 'exam'
  | 'notification';

export type DriverActivityItem = {
  id: string;
  kind: DriverActivityKind;
  at: string;
  title: string;
  subtitle?: string;
  href?: string;
};

export type DriverHubCounters = {
  documentsNeedingAttention: number;
  pendingRequests: number;
  accidentCount: number;
  lastActivityAt: string | null;
  licenseNeedsAttention: boolean;
  examNeedsAttention: boolean;
};

export type DriverHubData = {
  versions: DriverDocumentVersionRow[];
  allVersions: DriverDocumentVersionRow[];
  requests: DocumentRequestRow[];
  accidents: DriverAccidentRow[];
  typeDefs: DocumentTypeDef[];
  assignedVehicle: { id: string; license_plate: string; manufacturer: string; model: string } | null;
  activity: DriverActivityItem[];
  counters: DriverHubCounters;
};

const PENDING_REQUEST_STATUSES = new Set([
  'created',
  'sent',
  'delivered',
  'opened',
  'uploaded',
  'pending_approval',
]);

function parseAccidentImages(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return raw ? [raw] : [];
  }
}

export function hubVersionsByType(versions: DriverDocumentVersionRow[], typeKey: string): DriverDocumentVersionRow[] {
  return versions.filter((v) => v.document_type_key === typeKey);
}

export function hubSummaryForType(versions: DriverDocumentVersionRow[], typeKey: string): string {
  const current = hubVersionsByType(versions, typeKey)[0];
  if (!current) return 'אין מסמך';
  if (current.expiry_date) {
    return documentExpiryStatus(current.expiry_date) === 'expired' ? 'פג תוקף' : 'קיים';
  }
  return 'קיים';
}

export function hubHasExpiryWarning(versions: DriverDocumentVersionRow[]): boolean {
  return versions.some((v) => v.status === 'warning' || v.status === 'expired');
}

export function countDocumentsNeedingAttention(versions: DriverDocumentVersionRow[]): number {
  return versions.filter((v) => v.is_current && (v.status === 'warning' || v.status === 'expired')).length;
}

export function countPendingRequests(requests: DocumentRequestRow[]): number {
  return requests.filter((r) => PENDING_REQUEST_STATUSES.has(r.status)).length;
}

export function licenseNeedsAttention(licenseExpiry: string | null | undefined): boolean {
  const days = daysUntilDate(licenseExpiry);
  return days !== null && days <= 30;
}

export function examNeedsAttention(examExpiry: string | null | undefined): boolean {
  const days = daysUntilDate(examExpiry);
  return days !== null && days <= 30;
}

export function formatActivityRecency(iso: string | null | undefined): string {
  if (!iso) return 'אין פעילות';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'אין פעילות';
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startToday.getTime() - startThat.getTime()) / 86400000);
  if (diffDays === 0) return 'עודכן לאחרונה היום';
  if (diffDays === 1) return 'עודכן לאחרונה אתמול';
  return `עודכן לאחרונה ${formatIsraelDate(iso)}`;
}

export function buildDriverActivity(params: {
  versions: DriverDocumentVersionRow[];
  requests: DocumentRequestRow[];
  accidents: DriverAccidentRow[];
  declarations: { id: string; created_at: string; status?: string | null; sent_at?: string | null }[];
  exams: { id: string; created_at: string; status?: string | null; exam_type?: string | null }[];
  notifications: { id: string; created_at: string; title?: string | null; body?: string | null }[];
}): DriverActivityItem[] {
  const items: DriverActivityItem[] = [];

  for (const v of params.versions) {
    items.push({
      id: `ver-${v.id}`,
      kind: 'document_version',
      at: v.created_at,
      title: `מסמך: ${v.label_he}`,
      subtitle: `v${v.version_no}${v.is_current ? ' · עדכני' : ''} · ${v.original_name || ''}`.trim(),
      href: v.public_url || undefined,
    });
  }

  for (const r of params.requests) {
    items.push({
      id: `req-${r.id}`,
      kind: 'document_request',
      at: r.created_at,
      title: `בקשת מסמך: ${r.document_type_key}`,
      subtitle: r.status,
    });
  }

  for (const a of params.accidents) {
    items.push({
      id: `acc-${a.id}`,
      kind: 'accident',
      at: a.created_at || a.date,
      title: `תאונה · ${a.vehicle_plate}`,
      subtitle: a.status,
      href: `/accidents?id=${a.id}`,
    });
  }

  for (const d of params.declarations) {
    items.push({
      id: `decl-${d.id}`,
      kind: 'declaration',
      at: d.sent_at || d.created_at,
      title: 'תצהיר נהג',
      subtitle: d.status || undefined,
    });
  }

  for (const e of params.exams) {
    items.push({
      id: `exam-${e.id}`,
      kind: 'exam',
      at: e.created_at,
      title: 'מבחן כשירות',
      subtitle: [e.exam_type, e.status].filter(Boolean).join(' · ') || undefined,
    });
  }

  for (const n of params.notifications) {
    items.push({
      id: `notif-${n.id}`,
      kind: 'notification',
      at: n.created_at,
      title: n.title || 'התראה לנהג',
      subtitle: n.body || undefined,
    });
  }

  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export async function loadDriverHubData(params: {
  driverId: string;
  driverName: string;
  companyName: string;
  licenseExpiry?: string | null;
  examExpiry?: string | null;
}): Promise<DriverHubData> {
  const { driverId, driverName, companyName } = params;

  const [typeDefs, history, accidentsRes, vehicleRes, declarationsRes, examsRes] =
    await Promise.all([
      listDocumentTypes('driver').catch(() => [] as DocumentTypeDef[]),
      listEntityDocumentHistory('driver', driverId).catch(() => ({
        requests: [] as DocumentRequestRow[],
        versions: [],
      })),
      supabase
        .from('accidents')
        .select(
          'id, event_number, vehicle_plate, status, date, created_at, description, images, driver_name, company_name',
        )
        .eq('company_name', companyName)
        .eq('driver_name', driverName)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('vehicles')
        .select('id, license_plate, manufacturer, model')
        .eq('assigned_driver_id', driverId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('driver_declarations')
        .select('id, created_at, status, sent_at')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('driving_exams')
        .select('id, created_at, status, exam_type')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

  const labelByKey = new Map(typeDefs.map((t) => [t.key, t.label_he]));

  const mapVersion = (v: (typeof history.versions)[number]): DriverDocumentVersionRow => ({
    id: v.id,
    document_type_key: v.document_type_key,
    label_he: labelByKey.get(v.document_type_key) || v.document_type_key,
    public_url: v.public_url,
    original_name: v.original_name,
    created_at: v.created_at,
    expiry_date: (v as { expiry_date?: string | null }).expiry_date || null,
    version_no: v.version_no,
    is_current: v.is_current,
    status: documentExpiryStatus((v as { expiry_date?: string | null }).expiry_date),
  });

  const allVersions: DriverDocumentVersionRow[] = (history.versions || []).map(mapVersion);
  const versions = allVersions.filter((v) => v.is_current);
  const requests = history.requests || [];

  const accidents: DriverAccidentRow[] = (accidentsRes.data || []).map((a) => ({
    id: a.id,
    event_number: a.event_number || '—',
    vehicle_plate: a.vehicle_plate || '—',
    status: a.status || '—',
    date: a.date || a.created_at || '',
    description: a.description || '',
    imageUrls: parseAccidentImages(a.images),
    created_at: a.created_at || a.date || '',
  }));

  const assignedVehicle = vehicleRes.data
    ? {
        id: vehicleRes.data.id,
        license_plate: vehicleRes.data.license_plate,
        manufacturer: vehicleRes.data.manufacturer || '',
        model: vehicleRes.data.model || '',
      }
    : null;

  const activity = buildDriverActivity({
    versions: allVersions,
    requests,
    accidents,
    declarations: declarationsRes.data || [],
    exams: examsRes.data || [],
    notifications: [],
  });

  const counters: DriverHubCounters = {
    documentsNeedingAttention: countDocumentsNeedingAttention(versions),
    pendingRequests: countPendingRequests(requests),
    accidentCount: accidents.length,
    lastActivityAt: activity[0]?.at || null,
    licenseNeedsAttention: licenseNeedsAttention(params.licenseExpiry),
    examNeedsAttention: examNeedsAttention(params.examExpiry),
  };

  return {
    versions,
    allVersions,
    requests,
    accidents,
    typeDefs,
    assignedVehicle,
    activity,
    counters,
  };
}

export function documentsTileValue(counters: DriverHubCounters): { value: string; warn: boolean } {
  const n = counters.documentsNeedingAttention + (counters.licenseNeedsAttention ? 1 : 0);
  if (n > 0) return { value: `${n} דורשים טיפול`, warn: true };
  return { value: 'הכול תקין', warn: false };
}

export function requestsTileValue(counters: DriverHubCounters): { value: string; warn: boolean } {
  if (counters.pendingRequests > 0) {
    return { value: `${counters.pendingRequests} ממתינות`, warn: true };
  }
  return { value: 'אין בקשות פתוחות', warn: false };
}

export function drivingTileValue(counters: DriverHubCounters): { value: string; warn: boolean } {
  const parts: string[] = [];
  if (counters.accidentCount > 0) parts.push(`${counters.accidentCount} תאונות`);
  else parts.push('אין תאונות');
  if (counters.examNeedsAttention) parts.push('מבחן דורש טיפול');
  return {
    value: parts.join(' · '),
    warn: counters.examNeedsAttention,
  };
}

export function activityTileValue(counters: DriverHubCounters, hasNotes: boolean): { value: string; warn: boolean } {
  const base = formatActivityRecency(counters.lastActivityAt);
  return { value: hasNotes ? `${base} · יש הערה` : base, warn: false };
}
