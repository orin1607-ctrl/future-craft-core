/** Mock data for notification log UI — no DB. */

export type LogChannel = 'whatsapp' | 'email' | 'system';
export type LogStatus = 'sent' | 'pending' | 'failed' | 'blocked' | 'missing_phone';
export type LogTiming = 'active' | 'future' | 'history';
export type LogTab = 'active' | 'future' | 'history' | 'costs' | 'calendar';
export type LogScope = 'driver' | 'vehicle' | 'company';

export interface NotificationLogEntry {
  id: string;
  scope: LogScope;
  timing: LogTiming;
  createdAt: string;
  scheduledFor?: string;
  companyName: string;
  vehiclePlate?: string;
  vehicleId?: string;
  driverName?: string;
  driverId?: string;
  topic: string;
  channel: LogChannel;
  status: LogStatus;
  waSent?: number;
  waMax?: number;
  source: 'auto' | 'manual';
  notes?: string;
  costIls?: number;
}

/** Topics shown only in driver log */
export const DRIVER_TOPIC_OPTIONS = [
  'רישיון נהיגה',
  'חידוש רישיון נהיגה',
  'תוקף תעודה / הסמכה',
  'תוקף תצלום נהג',
  'תוקף אישור בטיחות',
  'תוקף אישור רפואי',
  'מסמך נהג',
  'תזכיר לנהג',
  'אישור לנהג',
] as const;

/** Topics shown only in vehicle log */
export const VEHICLE_TOPIC_OPTIONS = [
  'טסט',
  'ביטוח חובה',
  'ביטוח מקיף',
  'ביטוח צד ג׳',
  'טיפול',
  'מסמך רכב',
  'בדיקה תקופתית',
  'רישיון רכב',
  'תחזוקה',
  'תזכיר לרכב',
] as const;

export const CHANNEL_LABELS: Record<LogChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'אימייל',
  system: 'מערכת',
};

export const STATUS_LABELS: Record<LogStatus, string> = {
  sent: 'נשלח',
  pending: 'ממתין',
  failed: 'נכשל',
  blocked: 'חסום',
  missing_phone: 'חסר טלפון',
};

export const SCOPE_LABELS: Record<LogScope, string> = {
  driver: 'נהג',
  vehicle: 'רכב',
  company: 'חברה',
};

export const MOCK_LOG_ENTRIES: NotificationLogEntry[] = [
  // ── Vehicle scope ──
  {
    id: 'v1',
    scope: 'vehicle',
    timing: 'active',
    createdAt: '2026-06-10T09:15:00',
    companyName: 'דליה',
    vehiclePlate: '12-345-67',
    vehicleId: 'v1',
    driverName: 'יוסי כהן',
    driverId: 'd1',
    topic: 'טסט',
    channel: 'whatsapp',
    status: 'sent',
    waSent: 1,
    waMax: 3,
    source: 'manual',
    costIls: 0.28,
    notes: 'WhatsApp לנהג משויך — בנושא רכב',
  },
  {
    id: 'v2',
    scope: 'vehicle',
    timing: 'active',
    createdAt: '2026-06-09T14:00:00',
    companyName: 'דליה',
    vehiclePlate: '78-912-34',
    vehicleId: 'v2',
    topic: 'ביטוח חובה',
    channel: 'system',
    status: 'pending',
    source: 'auto',
    scheduledFor: '2026-06-15',
  },
  {
    id: 'v3',
    scope: 'vehicle',
    timing: 'active',
    createdAt: '2026-06-07T08:00:00',
    companyName: 'דליה',
    vehiclePlate: '12-345-67',
    vehicleId: 'v1',
    topic: 'טסט',
    channel: 'whatsapp',
    status: 'blocked',
    waSent: 3,
    waMax: 3,
    source: 'auto',
  },
  {
    id: 'v4',
    scope: 'vehicle',
    timing: 'active',
    createdAt: '2026-06-06T16:45:00',
    companyName: 'דליה',
    vehiclePlate: '99-111-22',
    vehicleId: 'v4',
    topic: 'טיפול',
    channel: 'whatsapp',
    status: 'missing_phone',
    source: 'auto',
    notes: 'אין נהג משויך / חסר טלפון',
  },
  {
    id: 'v5',
    scope: 'vehicle',
    timing: 'future',
    createdAt: '2026-06-01T08:00:00',
    scheduledFor: '2026-06-20',
    companyName: 'דליה',
    vehiclePlate: '12-345-67',
    vehicleId: 'v1',
    topic: 'טסט',
    channel: 'whatsapp',
    status: 'pending',
    waSent: 0,
    waMax: 3,
    source: 'auto',
    notes: 'תזכורת 30 יום לפני תפוגת טסט',
  },
  {
    id: 'v6',
    scope: 'vehicle',
    timing: 'future',
    createdAt: '2026-06-01T08:00:00',
    scheduledFor: '2026-07-01',
    companyName: 'דליה',
    vehiclePlate: '12-345-67',
    vehicleId: 'v1',
    topic: 'ביטוח מקיף',
    channel: 'whatsapp',
    status: 'pending',
    waSent: 0,
    waMax: 3,
    source: 'auto',
  },
  {
    id: 'v7',
    scope: 'vehicle',
    timing: 'history',
    createdAt: '2026-05-28T09:00:00',
    companyName: 'דליה',
    vehiclePlate: '12-345-67',
    vehicleId: 'v1',
    topic: 'ביטוח צד ג׳',
    channel: 'whatsapp',
    status: 'sent',
    waSent: 1,
    waMax: 3,
    source: 'auto',
    costIls: 0.28,
  },
  {
    id: 'v8',
    scope: 'vehicle',
    timing: 'history',
    createdAt: '2026-05-15T11:00:00',
    companyName: 'דליה',
    vehiclePlate: '78-912-34',
    vehicleId: 'v2',
    topic: 'רישיון רכב',
    channel: 'email',
    status: 'sent',
    source: 'manual',
  },
  {
    id: 'v9',
    scope: 'vehicle',
    timing: 'active',
    createdAt: '2026-06-10T07:00:00',
    companyName: 'דליה',
    vehiclePlate: '78-912-34',
    vehicleId: 'v2',
    topic: 'תחזוקה',
    channel: 'system',
    status: 'pending',
    source: 'auto',
  },

  // ── Driver scope (no vehicle fields) ──
  {
    id: 'd1',
    scope: 'driver',
    timing: 'active',
    createdAt: '2026-06-10T08:30:00',
    companyName: 'דליה',
    driverName: 'יוסי כהן',
    driverId: 'd1',
    topic: 'רישיון נהיגה',
    channel: 'whatsapp',
    status: 'sent',
    waSent: 1,
    waMax: 3,
    source: 'auto',
    costIls: 0.28,
    notes: 'רישיון עומד לפוג בעוד 14 יום',
  },
  {
    id: 'd2',
    scope: 'driver',
    timing: 'active',
    createdAt: '2026-06-09T10:00:00',
    companyName: 'דליה',
    driverName: 'יוסי כהן',
    driverId: 'd1',
    topic: 'תוקף אישור רפואי',
    channel: 'system',
    status: 'pending',
    source: 'auto',
    scheduledFor: '2026-06-18',
  },
  {
    id: 'd3',
    scope: 'driver',
    timing: 'active',
    createdAt: '2026-06-08T14:20:00',
    companyName: 'דליה',
    driverName: 'מיה אטיאס',
    driverId: 'd3',
    topic: 'תוקף תצלום נהג',
    channel: 'whatsapp',
    status: 'blocked',
    waSent: 3,
    waMax: 3,
    source: 'manual',
  },
  {
    id: 'd4',
    scope: 'driver',
    timing: 'active',
    createdAt: '2026-06-07T11:00:00',
    companyName: 'אורן',
    driverName: 'דני לוי',
    driverId: 'd2',
    topic: 'מסמך נהג',
    channel: 'email',
    status: 'sent',
    source: 'manual',
  },
  {
    id: 'd5',
    scope: 'driver',
    timing: 'future',
    createdAt: '2026-06-05T09:00:00',
    scheduledFor: '2026-06-25',
    companyName: 'דליה',
    driverName: 'יוסי כהן',
    driverId: 'd1',
    topic: 'חידוש רישיון נהיגה',
    channel: 'whatsapp',
    status: 'pending',
    waSent: 0,
    waMax: 3,
    source: 'auto',
  },
  {
    id: 'd6',
    scope: 'driver',
    timing: 'future',
    createdAt: '2026-06-04T08:00:00',
    scheduledFor: '2026-07-10',
    companyName: 'דליה',
    driverName: 'יוסי כהן',
    driverId: 'd1',
    topic: 'תוקף אישור בטיחות',
    channel: 'email',
    status: 'pending',
    source: 'auto',
  },
  {
    id: 'd7',
    scope: 'driver',
    timing: 'history',
    createdAt: '2026-05-20T16:00:00',
    companyName: 'דליה',
    driverName: 'יוסי כהן',
    driverId: 'd1',
    topic: 'תזכיר לנהג',
    channel: 'whatsapp',
    status: 'sent',
    waSent: 2,
    waMax: 3,
    source: 'manual',
    costIls: 0.28,
  },
  {
    id: 'd8',
    scope: 'driver',
    timing: 'history',
    createdAt: '2026-05-10T12:00:00',
    companyName: 'דליה',
    driverName: 'מיה אטיאס',
    driverId: 'd3',
    topic: 'תוקף תעודה / הסמכה',
    channel: 'system',
    status: 'sent',
    source: 'auto',
  },
  {
    id: 'd9',
    scope: 'driver',
    timing: 'active',
    createdAt: '2026-06-06T09:30:00',
    companyName: 'דליה',
    driverName: 'דני לוי',
    driverId: 'd2',
    topic: 'אישור לנהג',
    channel: 'whatsapp',
    status: 'missing_phone',
    source: 'manual',
  },

  // ── Company / general ──
  {
    id: 'c1',
    scope: 'company',
    timing: 'active',
    createdAt: '2026-06-10T06:00:00',
    companyName: 'דליה',
    topic: 'דוח חודשי',
    channel: 'email',
    status: 'sent',
    source: 'auto',
    notes: 'סיכום התראות חברה',
  },
];

export type LogViewMode = 'general' | 'driver' | 'vehicle';

export function resolveLogViewMode(params: {
  driverId?: string | null;
  vehicleId?: string | null;
  vehiclePlate?: string | null;
}): LogViewMode {
  if (params.driverId) return 'driver';
  if (params.vehicleId || params.vehiclePlate) return 'vehicle';
  return 'general';
}

export function mockActiveAlertCount(entityId: string, viewMode: LogViewMode): number {
  const scopeFilter: LogScope | null =
    viewMode === 'driver' ? 'driver' : viewMode === 'vehicle' ? 'vehicle' : null;
  const pool = MOCK_LOG_ENTRIES.filter(
    (e) => e.timing === 'active' && (!scopeFilter || e.scope === scopeFilter),
  );
  if (pool.length === 0) return 0;
  let hash = 0;
  for (let i = 0; i < entityId.length; i++) hash = (hash + entityId.charCodeAt(i)) % 13;
  return Math.min(2 + (hash % 4), pool.length);
}

export function filterMockEntries(
  entries: NotificationLogEntry[],
  filters: {
    viewMode?: LogViewMode;
    vehicleId?: string | null;
    vehiclePlate?: string | null;
    driverId?: string | null;
    timing?: LogTiming;
    company?: string;
    channel?: LogChannel | '';
    status?: LogStatus | '';
    topic?: string;
  },
): NotificationLogEntry[] {
  return entries.filter((e) => {
    if (filters.viewMode === 'driver') {
      if (e.scope !== 'driver') return false;
    } else if (filters.viewMode === 'vehicle') {
      if (e.scope !== 'vehicle') return false;
    }

    if (filters.timing && e.timing !== filters.timing) return false;

    if (filters.viewMode === 'vehicle') {
      if (filters.vehicleId && e.vehicleId && e.vehicleId !== filters.vehicleId) return false;
      if (filters.vehiclePlate && e.vehiclePlate && e.vehiclePlate !== filters.vehiclePlate) return false;
    }

    if (filters.viewMode === 'driver') {
      if (filters.driverId && e.driverId && e.driverId !== filters.driverId) return false;
    }

    if (filters.viewMode === 'general') {
      if (filters.vehicleId && e.vehicleId !== filters.vehicleId) return false;
      if (filters.vehiclePlate && e.vehiclePlate !== filters.vehiclePlate) return false;
      if (filters.driverId && e.driverId !== filters.driverId) return false;
    }

    if (filters.company && e.companyName !== filters.company) return false;
    if (filters.channel && e.channel !== filters.channel) return false;
    if (filters.status && e.status !== filters.status) return false;
    if (filters.topic && !e.topic.includes(filters.topic)) return false;
    return true;
  });
}

/** Demo rows when scoped view has no exact ID match — keeps scope pure */
export function scopedMockFallback(
  viewMode: LogViewMode,
  params: {
    vehicleId?: string | null;
    vehiclePlate?: string | null;
    driverId?: string | null;
    driverName?: string | null;
  },
): NotificationLogEntry[] {
  const scope: LogScope = viewMode === 'driver' ? 'driver' : 'vehicle';
  return MOCK_LOG_ENTRIES.filter((e) => e.scope === scope)
    .slice(0, 8)
    .map((e) => ({
      ...e,
      vehiclePlate: viewMode === 'vehicle' ? params.vehiclePlate || e.vehiclePlate : undefined,
      vehicleId: viewMode === 'vehicle' ? params.vehicleId || e.vehicleId : undefined,
      driverName: viewMode === 'driver' ? params.driverName || e.driverName : e.driverName,
      driverId: viewMode === 'driver' ? params.driverId || e.driverId : e.driverId,
    }));
}

export function formatLogEntryMeta(entry: NotificationLogEntry, viewMode: LogViewMode): string {
  const parts: string[] = [entry.companyName];
  if (viewMode === 'vehicle' && entry.vehiclePlate) parts.push(entry.vehiclePlate);
  if (viewMode === 'driver' && entry.driverName) parts.push(entry.driverName);
  if (viewMode === 'general') {
    if (entry.scope === 'vehicle' && entry.vehiclePlate) parts.push(entry.vehiclePlate);
    if (entry.scope === 'driver' && entry.driverName) parts.push(entry.driverName);
    if (entry.scope === 'company') parts.push('חברה');
    parts.push(`(${SCOPE_LABELS[entry.scope]})`);
  }
  if (viewMode === 'vehicle' && entry.driverName && entry.channel === 'whatsapp') {
    parts.push(`→ ${entry.driverName}`);
  }
  return parts.filter(Boolean).join(' · ');
}

export function mockCostSummary(entries: NotificationLogEntry[]) {
  const wa = entries.filter((e) => e.channel === 'whatsapp' && e.status === 'sent');
  const total = wa.reduce((s, e) => s + (e.costIls ?? 0.28), 0);
  const byTopic: Record<string, { count: number; cost: number }> = {};
  for (const e of wa) {
    if (!byTopic[e.topic]) byTopic[e.topic] = { count: 0, cost: 0 };
    byTopic[e.topic].count += 1;
    byTopic[e.topic].cost += e.costIls ?? 0.28;
  }
  return { total, count: wa.length, byTopic, savedEstimate: 84 };
}

export function calendarEventDates(entries: NotificationLogEntry[]): Date[] {
  const dates = new Set<string>();
  for (const e of entries) {
    const d = e.scheduledFor || e.createdAt.slice(0, 10);
    dates.add(d);
  }
  return [...dates].map((d) => new Date(d));
}

export function entriesForDate(entries: NotificationLogEntry[], date: Date): NotificationLogEntry[] {
  const key = date.toISOString().slice(0, 10);
  return entries.filter((e) => {
    const d = e.scheduledFor || e.createdAt.slice(0, 10);
    return d === key;
  });
}

export function topicOptionsForView(viewMode: LogViewMode): readonly string[] {
  if (viewMode === 'driver') return DRIVER_TOPIC_OPTIONS;
  if (viewMode === 'vehicle') return VEHICLE_TOPIC_OPTIONS;
  return [...DRIVER_TOPIC_OPTIONS, ...VEHICLE_TOPIC_OPTIONS, 'דוח חברה'];
}
