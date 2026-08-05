/** Stable keys for dashboard gap/alert rows (חוסרים והתראות). */
export type GapAlertKey =
  | 'missing_documents'
  | 'insurance_gap'
  | 'license_gap'
  | 'expiry_warn'
  | 'equipment_gap'
  | 'completion_summary'
  | 'open_issues'
  | 'transport_open'
  | 'company_approval';

export type GapAlertConfigItem = {
  key: GapAlertKey;
  displayLabel: string;
  order: number;
  visible: boolean;
  /** System row — cannot be removed from template. */
  isSystem: true;
  /** Warn before hiding (insurance / license / test). */
  isCritical?: boolean;
  /** Always shown; not hideable or reorderable (דורש השלמה). */
  locked?: boolean;
};

/** Exactly 9 system rows — same order and labels as VehicleDashboard before customization. */
export const DEFAULT_GAP_ALERT_ITEMS: GapAlertConfigItem[] = [
  { key: 'missing_documents', displayLabel: 'חוסר מסמכים', order: 1, visible: true, isSystem: true },
  { key: 'insurance_gap', displayLabel: 'חוסר ביטוח', order: 2, visible: true, isSystem: true, isCritical: true },
  { key: 'license_gap', displayLabel: 'חוסר רישיון', order: 3, visible: true, isSystem: true, isCritical: true },
  { key: 'expiry_warn', displayLabel: 'פג תוקף (טסט/ביטוח)', order: 4, visible: true, isSystem: true, isCritical: true },
  { key: 'equipment_gap', displayLabel: 'חוסר ציוד', order: 5, visible: true, isSystem: true },
  {
    key: 'completion_summary',
    displayLabel: 'דורש השלמה',
    order: 6,
    visible: true,
    isSystem: true,
    locked: true,
  },
  { key: 'open_issues', displayLabel: 'התראות פתוחות', order: 7, visible: true, isSystem: true },
  { key: 'transport_open', displayLabel: 'שינוע פתוח', order: 8, visible: true, isSystem: true },
  { key: 'company_approval', displayLabel: 'אישור חברה', order: 9, visible: true, isSystem: true },
];

export type GapAlertValues = Record<GapAlertKey, string>;
