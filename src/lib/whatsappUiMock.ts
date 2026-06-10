/** UI-only mock layer — no DB, no Gupshup. Remove when backend is wired. */

export type WhatsAppSendKind =
  | 'driver_approval'
  | 'driver_reminder'
  | 'driver_form'
  | 'driver_manual'
  | 'test'
  | 'mandatory_insurance'
  | 'comprehensive_insurance'
  | 'third_party_insurance'
  | 'document';

export type WhatsAppUiPreviewMode = 'normal' | 'missing_phone' | 'blocked';

export const WHATSAPP_MAX_SENDS = 3;

export const DRIVER_SEND_KINDS: WhatsAppSendKind[] = [
  'driver_approval',
  'driver_reminder',
  'driver_form',
  'driver_manual',
];

export const SEND_KIND_LABELS: Record<WhatsAppSendKind, string> = {
  driver_approval: 'אישור',
  driver_reminder: 'תזכיר',
  driver_form: 'טופס / מסמך',
  driver_manual: 'הודעה ידנית',
  test: 'טסט',
  mandatory_insurance: 'ביטוח חובה',
  comprehensive_insurance: 'ביטוח מקיף',
  third_party_insurance: 'ביטוח צד ג׳',
  document: 'מסמך / אישור',
};

export const DRIVER_MENU_ITEMS: {
  kind: WhatsAppSendKind;
  icon: string;
  label: string;
}[] = [
  { kind: 'driver_approval', icon: '📋', label: 'אישור' },
  { kind: 'driver_reminder', icon: '🔔', label: 'תזכיר' },
  { kind: 'driver_form', icon: '📄', label: 'טופס / מסמך' },
  { kind: 'driver_manual', icon: '✏', label: 'הודעה ידנית' },
];

export function normalizePhoneDisplay(phone: string | null | undefined): string | null {
  const raw = (phone || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 9) return null;
  return raw;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return phone;
  return `${digits.slice(0, 3)}-***-${digits.slice(-2)}`;
}

export function buildMockPreviewMessage(params: {
  recipientName: string;
  kind: WhatsAppSendKind;
  vehiclePlate?: string;
  expiryDate?: string;
}): string {
  const topic = SEND_KIND_LABELS[params.kind];
  const plate = params.vehiclePlate || '—';
  const expiry = params.expiryDate
    ? new Date(params.expiryDate).toLocaleDateString('he-IL')
    : '—';
  return [
    `שלום ${params.recipientName},`,
    `תזכורת ממערכת דליה: ${topic}`,
    params.vehiclePlate ? `לרכב ${plate}` : '',
    params.expiryDate ? `יפוג בתאריך ${expiry}.` : '',
    'לפרטים נוספים פנו למנהל הצי.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function mockQuotaLabel(sent: number, max = WHATSAPP_MAX_SENDS): string {
  if (sent >= max) return `${max}/${max} חסום`;
  return `${sent}/${max}`;
}

export function isQuotaBlocked(sent: number, max = WHATSAPP_MAX_SENDS): boolean {
  return sent >= max;
}

/** Default mock counts per kind for UI preview */
export function defaultMockQuota(): Record<WhatsAppSendKind, number> {
  return {
    driver_approval: 0,
    driver_reminder: 1,
    driver_form: 2,
    driver_manual: 0,
    test: 0,
    mandatory_insurance: 1,
    comprehensive_insurance: 0,
    third_party_insurance: 2,
    document: 0,
  };
}

/** Mock recipient for alert / vehicle rows until backend resolves driver phone */
export const MOCK_ALERT_RECIPIENT = {
  name: 'נהג משויך',
  phone: '053-4338601',
};

export function alertCategoryToKind(category: string): WhatsAppSendKind | null {
  const map: Record<string, WhatsAppSendKind> = {
    test: 'test',
    insurance: 'mandatory_insurance',
    comprehensive_insurance: 'comprehensive_insurance',
    third_party_insurance: 'third_party_insurance',
    document: 'document',
  };
  return map[category] ?? null;
}

export function previewQuota(
  mode: WhatsAppUiPreviewMode,
  base: Record<WhatsAppSendKind, number>,
): Record<WhatsAppSendKind, number> {
  if (mode === 'blocked') {
    return Object.fromEntries(
      Object.keys(base).map((k) => [k, WHATSAPP_MAX_SENDS]),
    ) as Record<WhatsAppSendKind, number>;
  }
  return base;
}
