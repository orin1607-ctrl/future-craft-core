/** Open the existing accident card from the reports screen, and return to the same filters. */

export type ReportFilterSnapshot = {
  period?: string;
  from?: string;
  to?: string;
  company?: string;
  vendor?: string;
  vehicle?: string;
  internal?: string;
  driver?: string;
  status?: string;
  vehicleType?: string;
  types?: string[];
  expanded?: string;
};

const PERIODS = new Set(['month', 'week', 'year', 'custom', 'all']);

function clean(value: string | null | undefined): string {
  return String(value || '').trim();
}

export function buildReportsReturnPath(snapshot: ReportFilterSnapshot): string {
  const q = new URLSearchParams();
  const period = clean(snapshot.period);
  if (PERIODS.has(period)) q.set('period', period);
  if (snapshot.from) q.set('from', snapshot.from);
  if (snapshot.to) q.set('to', snapshot.to);
  if (snapshot.company) q.set('company', snapshot.company);
  if (snapshot.vendor) q.set('vendor', snapshot.vendor);
  if (snapshot.vehicle) q.set('vehicle', snapshot.vehicle);
  if (snapshot.internal) q.set('internal', snapshot.internal);
  if (snapshot.driver) q.set('driver', snapshot.driver);
  if (snapshot.status) q.set('status', snapshot.status);
  if (snapshot.vehicleType) q.set('vehicleType', snapshot.vehicleType);
  const types = (snapshot.types || []).map((t) => t.trim()).filter(Boolean);
  if (types.length) q.set('types', types.join(','));
  if (snapshot.expanded) q.set('expanded', snapshot.expanded);
  const qs = q.toString();
  return qs ? `/reports?${qs}` : '/reports';
}

export function parseReportsSearch(search: string): ReportFilterSnapshot & { present: boolean } {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const q = new URLSearchParams(raw);
  const period = clean(q.get('period'));
  const types = clean(q.get('types')).split(',').map((t) => t.trim()).filter(Boolean);
  const snapshot: ReportFilterSnapshot & { present: boolean } = {
    present: false,
    period: PERIODS.has(period) ? period : undefined,
    from: clean(q.get('from')) || undefined,
    to: clean(q.get('to')) || undefined,
    company: clean(q.get('company')) || undefined,
    vendor: clean(q.get('vendor')) || undefined,
    vehicle: clean(q.get('vehicle')) || undefined,
    internal: clean(q.get('internal')) || undefined,
    driver: clean(q.get('driver')) || undefined,
    status: clean(q.get('status')) || undefined,
    vehicleType: clean(q.get('vehicleType')) || undefined,
    types: types.length ? types : undefined,
    expanded: clean(q.get('expanded')) || undefined,
  };
  snapshot.present = Boolean(
    snapshot.period || snapshot.from || snapshot.to || snapshot.company || snapshot.vendor
    || snapshot.vehicle || snapshot.internal || snapshot.driver || snapshot.status
    || snapshot.vehicleType || snapshot.types || snapshot.expanded,
  );
  return snapshot;
}

export function accidentCardPath(accidentId: string, returnPath: string): string {
  const q = new URLSearchParams();
  q.set('id', accidentId);
  q.set('from', 'reports');
  q.set('return', returnPath);
  return `/accidents?${q.toString()}`;
}

export function readAccidentReportReturn(searchParams: URLSearchParams): string | null {
  if (searchParams.get('from') !== 'reports') return null;
  const ret = searchParams.get('return') || '';
  if (ret !== '/reports' && !ret.startsWith('/reports?')) return null;
  if (ret.includes('://') || ret.includes('\\') || ret.includes('//')) return null;
  return ret;
}
