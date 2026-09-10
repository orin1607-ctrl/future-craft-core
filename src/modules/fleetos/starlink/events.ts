/**
 * Significant ERM event IDs from the official catalog (read 30.8.2026).
 * Stored as telematics events only — never auto-create Dalia faults/accidents/expenses.
 */
export const ERM_EVENTS: Record<string, { key: string; labelHe: string; severity: 'critical' | 'warning' | 'info' }> = {
  '01': { key: 'location', labelHe: 'דיווח מיקום', severity: 'info' },
  '02': { key: 'unit_diag', labelHe: 'דיאגנוסטיקת יחידה', severity: 'info' },
  '04': { key: 'ign_on', labelHe: 'הצתה נדלקה', severity: 'info' },
  '05': { key: 'ign_off', labelHe: 'הצתה כבתה', severity: 'info' },
  '06': { key: 'overspeed', labelHe: 'חריגת מהירות', severity: 'warning' },
  '07': { key: 'geofence_in', labelHe: 'כניסה לגאו-זון', severity: 'info' },
  '08': { key: 'geofence_out', labelHe: 'יציאה מגאו-זון', severity: 'info' },
  '09': { key: 'battery_disconnect', labelHe: 'ניתוק מצבר', severity: 'critical' },
  '10': { key: 'battery_reconnect', labelHe: 'חיבור מצבר', severity: 'info' },
  '11': { key: 'backup_low', labelHe: 'גיבוי נמוך', severity: 'warning' },
  '12': { key: 'voltage_low', labelHe: 'מתח נמוך', severity: 'warning' },
  '13': { key: 'voltage_high', labelHe: 'מתח גבוה', severity: 'warning' },
  '16': { key: 'ibutton_change', labelHe: 'שינוי iButton', severity: 'info' },
  '18': { key: 'tracking', labelHe: 'מעקב צפוף', severity: 'info' },
  '22': { key: 'idle_excess', labelHe: 'סרק מופרז', severity: 'warning' },
  '23': { key: 'network_change', labelHe: 'החלפת רשת', severity: 'info' },
  '24': { key: 'engine_on', labelHe: 'מנוע נדלק', severity: 'info' },
  '25': { key: 'engine_off', labelHe: 'מנוע כבה', severity: 'info' },
  '26': { key: 'towing', labelHe: 'גרירה', severity: 'warning' },
  '36': { key: 'sos', labelHe: 'בהלה / SOS', severity: 'critical' },
  '41': { key: 'impact', labelHe: 'תאונה / Impact', severity: 'critical' },
  '42': { key: 'jam_start', labelHe: 'שיבוש GPS/רשת', severity: 'warning' },
  '43': { key: 'jam_end', labelHe: 'סיום שיבוש', severity: 'info' },
  '44': { key: 'motion', labelHe: 'תנועה זוהתה', severity: 'info' },
  '45': { key: 'motion_end', labelHe: 'סיום תנועה', severity: 'info' },
  '46': { key: 'ibutton_in', labelHe: 'iButton חובר', severity: 'info' },
  '47': { key: 'ibutton_out', labelHe: 'iButton נותק', severity: 'info' },
  '57': { key: 'geofence', labelHe: 'גאו-זון', severity: 'info' },
  '58': { key: 'drive_start', labelHe: 'תחילת נסיעה', severity: 'info' },
  '59': { key: 'drive_end', labelHe: 'סיום נסיעה', severity: 'info' },
  '69': { key: 'vin', labelHe: 'VIN מהרכב', severity: 'info' },
  '70': { key: 'dtc', labelHe: 'DTC', severity: 'warning' },
  '71': { key: 'rpm_low', labelHe: 'סל״ד נמוך', severity: 'warning' },
  '72': { key: 'rpm_high', labelHe: 'סל״ד גבוה', severity: 'warning' },
  '78': { key: 'rpm_normal', labelHe: 'סל״ד רגיל', severity: 'info' },
  '76': { key: 'tamper', labelHe: 'חבלה / הסרה', severity: 'critical' },
  '79': { key: 'idle_excess', labelHe: 'סרק מופרז', severity: 'warning' },
  '81': { key: 'ign_off_moving', labelHe: 'הצתה כבויה תוך תנועה', severity: 'warning' },
  '84': { key: 'vibration', labelHe: 'רעידות', severity: 'info' },
  '90': { key: 'jam_start', labelHe: 'שיבוש GPS/רשת', severity: 'warning' },
  '91': { key: 'jam_end', labelHe: 'סיום שיבוש', severity: 'info' },
  '94': { key: 'sim_lost', labelHe: 'SIM אבד', severity: 'warning' },
  '95': { key: 'sim_found', labelHe: 'SIM נמצא', severity: 'info' },
};

export const LOCATION_EVENT_IDS = new Set(['01', '18']);

export const SIGNIFICANT_EVENT_IDS = new Set(
  Object.keys(ERM_EVENTS).filter((id) => !LOCATION_EVENT_IDS.has(id)),
);

export function padEventId(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const n = String(raw).trim();
  if (!n) return null;
  return n.padStart(2, '0');
}

export function isSignificantEvent(eid: string | null): boolean {
  if (!eid) return false;
  return SIGNIFICANT_EVENT_IDS.has(eid);
}
