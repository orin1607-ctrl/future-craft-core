import { supabase } from '@/integrations/supabase/client';
import { listEntityDocumentHistory, listDocumentTypes, type DocumentTypeDef } from '@/lib/documentRequestClient';
import { documentExpiryStatus } from '@/lib/driverDocumentExpiry';

export const TRAFFIC_INFO_TYPE = 'traffic_info';
export const TRAFFIC_TICKET_TYPE = 'traffic_ticket';
export const HEALTH_DECLARATION_TYPE = 'health_declaration';

export type DriverHubSection =
  | 'home'
  | 'documents'
  | 'health_declaration'
  | 'traffic_info'
  | 'traffic_reports'
  | 'accidents'
  | 'notes';

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
};

export type DriverHubData = {
  versions: DriverDocumentVersionRow[];
  allVersions: DriverDocumentVersionRow[];
  accidents: DriverAccidentRow[];
  typeDefs: DocumentTypeDef[];
};

function parseAccidentImages(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return raw ? [raw] : [];
  }
}

export async function loadDriverHubData(params: {
  driverId: string;
  driverName: string;
  companyName: string;
}): Promise<DriverHubData> {
  const { driverId, driverName, companyName } = params;

  const [typeDefs, history, accidentsRes] = await Promise.all([
    listDocumentTypes('driver').catch(() => [] as DocumentTypeDef[]),
    listEntityDocumentHistory('driver', driverId).catch(() => ({ requests: [], versions: [] })),
    supabase
      .from('accidents')
      .select('id, event_number, vehicle_plate, status, date, created_at, description, images, driver_name, company_name')
      .eq('company_name', companyName)
      .eq('driver_name', driverName)
      .order('created_at', { ascending: false })
      .limit(50),
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

  const accidents: DriverAccidentRow[] = (accidentsRes.data || []).map((a) => ({
    id: a.id,
    event_number: a.event_number || '—',
    vehicle_plate: a.vehicle_plate || '—',
    status: a.status || '—',
    date: a.date || a.created_at || '',
    description: a.description || '',
    imageUrls: parseAccidentImages(a.images),
  }));

  return { versions, allVersions, accidents, typeDefs };
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
