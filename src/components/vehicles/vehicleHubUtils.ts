import type { VehicleHubVehicle } from '@/components/vehicles/VehicleHub';

export function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export function expiryColor(days: number | null) {
  if (days === null) return '';
  if (days <= 0) return 'text-destructive font-bold';
  if (days <= 14) return 'text-warning font-bold';
  return '';
}

export function formatExpiry(date: string | null) {
  if (!date) return 'לא הוגדר';
  const d = daysUntil(date);
  const label = new Date(date).toLocaleDateString('he-IL');
  if (d === null) return label;
  if (d <= 0) return `${label} (פג)`;
  if (d <= 14) return `${label} (${d} ימים)`;
  return label;
}

export function statusLabel(s: string) {
  switch (s) {
    case 'active':
      return { text: 'פעיל', cls: 'status-active' };
    case 'in_service':
      return { text: 'בטיפול', cls: 'status-pending' };
    case 'out_of_service':
      return { text: 'לא פעיל', cls: 'status-inactive' };
    case 'archived':
      return { text: 'ארכיון', cls: 'bg-muted text-muted-foreground' };
    default:
      return { text: s || 'לא ידוע', cls: '' };
  }
}

export function managementTypeLabel(t: string) {
  if (t === 'operational_leasing') return 'ליסינג תפעולי';
  if (t === 'financial_leasing') return 'ליסינג מימוני';
  if (t === 'self_maintained') return 'תחזוקה עצמאית';
  return '—';
}

export function insuranceStatusText(expiry: string | null) {
  const d = daysUntil(expiry);
  if (!expiry) return 'לא הוגדר';
  if (d !== null && d <= 0) return 'פג תוקף';
  if (d !== null && d <= 14) return 'מתקרב לפקיעה';
  return 'בתוקף';
}

export interface InsuranceHistoryRow {
  year: number;
  has_no_claims: boolean;
  insurer_name: string;
  mandatory_insurance_cost: number;
  comprehensive_insurance_cost: number;
}

export type VehicleWithExtras = VehicleHubVehicle & {
  insurance_cost?: number | null;
};
