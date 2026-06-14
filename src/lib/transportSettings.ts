/** Transport module feature IDs — stored in company_settings.transport_hidden_features when hidden. */
export const TRANSPORT_FEATURE_IDS = [
  'customers',
  'companions',
  'routes',
  'work-orders',
  'pickup',
  'teams',
  'reports',
] as const;

/** Import wizard — planned for a future phase; not exposed in UI until implemented. */
export const TRANSPORT_IMPORT_ENABLED = false;

export type TransportFeatureId = (typeof TRANSPORT_FEATURE_IDS)[number];

export interface TransportFeatureDef {
  id: TransportFeatureId;
  label: string;
  subtitle: string;
  to: string;
}

export const TRANSPORT_FEATURES: TransportFeatureDef[] = [
  {
    id: 'customers',
    label: 'לקוחות הסעה',
    subtitle: 'בתי ספר, רשויות, מוסדות',
    to: '/customers',
  },
  {
    id: 'companions',
    label: 'מלווים',
    subtitle: 'רשימת מלווים ופרטים',
    to: '/companions',
  },
  {
    id: 'routes',
    label: 'מסלולים',
    subtitle: 'ניהול מסלולים וקווים',
    to: '/routes',
  },
  {
    id: 'work-orders',
    label: 'סידור עבודה',
    subtitle: 'הקצאות, אישורים, צ׳אט',
    to: '/work-orders',
  },
  {
    id: 'pickup',
    label: 'תיאומי איסוף',
    subtitle: 'תיאומים וסטטוס איסוף',
    to: '/pickup-appointments',
  },
  {
    id: 'teams',
    label: 'צוותי הסעה',
    subtitle: 'שיוך רכב, נהג ומלווה',
    to: '/attach-car',
  },
  {
    id: 'reports',
    label: 'דוחות',
    subtitle: 'דוחות וניתוחים',
    to: '/reports',
  },
];

export function isTransportFeatureHidden(
  hiddenFeatures: string[] | null | undefined,
  featureId: TransportFeatureId,
): boolean {
  return (hiddenFeatures || []).includes(featureId);
}

export function isTransportFeatureVisible(
  enabled: boolean,
  hiddenFeatures: string[] | null | undefined,
  featureId: TransportFeatureId,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return true;
  if (!enabled) return false;
  return !isTransportFeatureHidden(hiddenFeatures, featureId);
}
