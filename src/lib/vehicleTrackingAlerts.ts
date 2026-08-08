import { daysUntil } from '@/components/vehicles/vehicleHubUtils';
import {
  buildFaultDetailUrl,
  buildServiceOrderDetailUrl,
  buildVehicleHubUrl,
  buildVehicleTaskDetailUrl,
  type VehicleHubDeepLink,
} from '@/lib/entityNavContext';
import { expiryReminderTier, tierDetail, tierLabel } from '@/lib/vehicleExpiryReminders';
import { isInsuranceAlertsEnabled } from '@/lib/vehicleInsuranceAlerts';
import { buildReminderOffsets } from '@/lib/companySettings';
import { CUSTOM_GAP_PREFIX } from '@/lib/vehicleEventLog';

/** Alert kinds shown in מעקב רכב → התראות */
export type TrackingAlertKind =
  | 'test'
  | 'insurance'
  | 'license'
  | 'document'
  | 'fault'
  | 'defect'
  | 'accident'
  | 'transport'
  | 'service'
  | 'gap';

export type TrackingAlertItem = {
  kind: TrackingAlertKind;
  label: string;
  detail: string;
  hubLink: string;
  tier?: 30 | 7 | 1;
  entityId?: string;
};

export const TRACKING_ALERT_KIND_LABELS: Record<TrackingAlertKind, string> = {
  test: 'טסט',
  insurance: 'ביטוח',
  license: 'רישיון',
  document: 'מסמך',
  fault: 'תקלה',
  defect: 'ליקוי',
  accident: 'תאונה',
  transport: 'שינוע',
  service: 'טיפול',
  gap: 'חוסר',
};

export type CompanyAlertThresholds = {
  firstDays: number;
  show7: boolean;
  show1: boolean;
};

export function thresholdsFromCompanySettings(
  config: {
    alert_days_before?: number | null;
    reminder_30_days?: boolean | null;
    reminder_7_days?: boolean | null;
    reminder_1_day?: boolean | null;
  } | null,
): CompanyAlertThresholds {
  const offsets = buildReminderOffsets(config);
  const firstDays = offsets[0] ?? 30;
  return {
    firstDays,
    show7: config?.reminder_7_days !== false,
    show1: config?.reminder_1_day !== false,
  };
}

export const DEFAULT_ALERT_THRESHOLDS: CompanyAlertThresholds = {
  firstDays: 30,
  show7: true,
  show1: true,
};

export type TrackingOpenEntity = { id: string; title: string; detail: string };

function hubLink(vehicleId: string, plate: string, opts: VehicleHubDeepLink): string {
  return buildVehicleHubUrl(vehicleId, opts);
}

function ctx(vehicleId: string, plate: string) {
  return { vehicleId, plate };
}

export function buildVehicleTrackingAlerts(input: {
  vehicleId: string;
  license_plate: string;
  test_expiry: string | null;
  insurance_expiry: string | null;
  license_doc_url?: string | null;
  insurance_alerts_enabled?: boolean | null;
  openFaults?: TrackingOpenEntity[];
  openDefects?: TrackingOpenEntity[];
  openAccidents?: TrackingOpenEntity[];
  openServices?: TrackingOpenEntity[];
  customGaps?: TrackingOpenEntity[];
  has_active_transport: boolean;
  service_status?: string | null;
  thresholds?: CompanyAlertThresholds;
}): TrackingAlertItem[] {
  const t = input.thresholds ?? DEFAULT_ALERT_THRESHOLDS;
  const items: TrackingAlertItem[] = [];
  const plate = input.license_plate;
  const vid = input.vehicleId;
  const insOn = isInsuranceAlertsEnabled(input);

  const testDays = daysUntil(input.test_expiry);
  const testTier = expiryReminderTier(testDays, t);
  if (testTier !== null) {
    items.push({
      kind: 'test',
      label: tierLabel(testTier, TRACKING_ALERT_KIND_LABELS.test),
      detail: tierDetail(input.test_expiry, testDays, testTier),
      tier: testTier,
      hubLink: hubLink(vid, plate, { hubSection: 'home', hubDrill: 'insurance_licenses', hubFocus: 'test' }),
    });
  }

  if (insOn) {
    const insDays = daysUntil(input.insurance_expiry);
    const insTier = expiryReminderTier(insDays, t);
    if (insTier !== null) {
      items.push({
        kind: 'insurance',
        label: tierLabel(insTier, TRACKING_ALERT_KIND_LABELS.insurance),
        detail: tierDetail(input.insurance_expiry, insDays, insTier),
        tier: insTier,
        hubLink: hubLink(vid, plate, { hubSection: 'home', hubDrill: 'insurance_licenses', hubFocus: 'insurance' }),
      });
    }
  }

  if (!input.license_doc_url) {
    items.push({
      kind: 'license',
      label: TRACKING_ALERT_KIND_LABELS.license,
      detail: 'חסר מסמך רישיון רכב',
      hubLink: hubLink(vid, plate, { hubSection: 'home', hubDrill: 'documents', hubFocus: 'license' }),
    });
  }

  for (const f of input.openFaults || []) {
    items.push({
      kind: 'fault',
      label: TRACKING_ALERT_KIND_LABELS.fault,
      detail: f.detail || f.title,
      entityId: f.id,
      hubLink: buildFaultDetailUrl(f.id, ctx(vid, plate)),
    });
  }

  for (const d of input.openDefects || []) {
    items.push({
      kind: 'defect',
      label: TRACKING_ALERT_KIND_LABELS.defect,
      detail: d.detail || d.title,
      entityId: d.id,
      hubLink: buildVehicleTaskDetailUrl(d.id, ctx(vid, plate)),
    });
  }

  for (const g of input.customGaps || []) {
    items.push({
      kind: 'gap',
      label: TRACKING_ALERT_KIND_LABELS.gap,
      detail: g.detail || g.title,
      entityId: g.id,
      hubLink: hubLink(vid, plate, { hubSection: 'home', hubDrill: 'gaps_alerts', hubEntityId: g.id }),
    });
  }

  for (const a of input.openAccidents || []) {
    items.push({
      kind: 'accident',
      label: TRACKING_ALERT_KIND_LABELS.accident,
      detail: a.detail || a.title,
      entityId: a.id,
      hubLink: hubLink(vid, plate, { hubSection: 'actions', hubTab: 'accidents' }),
    });
  }

  if (input.has_active_transport) {
    items.push({
      kind: 'transport',
      label: TRACKING_ALERT_KIND_LABELS.transport,
      detail: 'שינוע פעיל',
      hubLink: hubLink(vid, plate, { hubSection: 'home', hubDrill: 'transport' }),
    });
  }

  for (const s of input.openServices || []) {
    items.push({
      kind: 'service',
      label: TRACKING_ALERT_KIND_LABELS.service,
      detail: s.detail || s.title,
      entityId: s.id,
      hubLink: buildServiceOrderDetailUrl(s.id, ctx(vid, plate)),
    });
  }

  return items;
}

export function vehicleHasTrackingAlerts(alerts: TrackingAlertItem[]): boolean {
  return alerts.length > 0;
}

export function gapTitleFromTask(title: string | null | undefined): string {
  const t = title || '';
  return t.startsWith(CUSTOM_GAP_PREFIX) ? t.slice(CUSTOM_GAP_PREFIX.length) : t;
}
