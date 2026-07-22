/**
 * Driver declaration template helpers.
 * Supports {{placeholder}} tokens and legacy ______ / {ID} markers.
 * New placeholders can be registered in DECLARATION_PLACEHOLDERS without schema changes.
 *
 * DEFAULT_DECLARATION_BODY is a one-time seed for companies with ZERO templates.
 * After seed, the source of truth is declaration_templates.body in the database.
 * New declarations must load the company default from DB — never this constant.
 */

export const DEFAULT_DECLARATION_BODY = `אני החתום מטה, בעל תעודת זהות מספר {{id_number}},
מצהיר בזה כי לא נתגלו אצלי, לפי מיטב ידיעתי, מגבלות במערכת העצבים, העצמות,
הראיה או השמיעה ומצב בריאותי הנוכחי כשיר לנהיגה.

1. לא נפסלתי מלהחזיק ברישיון נהיגה מ: בית משפט, רשות הרישוי או קצין משטרה,
ולחלופין רישיון הנהיגה אשר ברשותי לא הותלה על ידי גורמים כאמור.
2. אין לי כל מגבלה בריאותית או רפואית המונעת ממני מלהחזיק ברישיון הנהיגה.
3. איננו צורך סמים.
4. איננו צורך אלכוהול מעבר לכמות המותרת על פי דין.
5. אני מצהיר כי לא חל כל שינוי במצב בריאותי במשך חמש השנים האחרונות.

אני מתחייב כי במידה ויבוטלו הגבלות איזה שהן על רישיון הנהיגה אשר ברשותי,
ולחלופין במידה ויחול שינוי במצב בריאותי באופן המונע ממני מלהמשיך ולנהוג,
אדווח על כך מיידית לקצין הבטיחות.

ידוע לי כי בהתאם לתקנות 585א׳ – 585כ׳ יבדקו פרטי רישיון הנהיגה/מידע העבודות שלי
ע״י קצין הבטיחות המעניק שרותי בטיחות בחברה.

אני מצהיר בזה כי הצהרתי הנ״ל אמת`;

export const DEFAULT_DECLARATION_TEMPLATE_NAME = 'תצהיר כללי';

/** Normalize company key so template save/load/create always hit the same DB rows. */
export function normalizeTemplateCompanyName(companyName: string | null | undefined): string {
  return String(companyName || '').trim();
}

/** Registry of supported dynamic fields — extend here for future tokens. */
export const DECLARATION_PLACEHOLDERS = [
  { key: 'id_number', label: 'תעודת זהות', sample: '123456789' },
  { key: 'driver_name', label: 'שם נהג', sample: 'ישראל ישראלי' },
  { key: 'license_number', label: 'מספר רישיון', sample: '12-345-67' },
  { key: 'company_name', label: 'שם חברה', sample: 'חברת לדוגמה' },
  { key: 'date', label: 'תאריך', sample: '01/01/2026' },
  { key: 'vehicle_plate', label: 'מספר רכב', sample: '12-345-67' },
] as const;

export type DeclarationPlaceholderKey = (typeof DECLARATION_PLACEHOLDERS)[number]['key'];

export type DeclarationTemplateVars = Partial<Record<DeclarationPlaceholderKey, string | null | undefined>> &
  Record<string, string | null | undefined>;

export interface DeclarationTemplate {
  id: string;
  company_name: string;
  name: string;
  body: string;
  is_default: boolean;
  placeholders: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const DEFAULT_PLACEHOLDERS_JSON = DECLARATION_PLACEHOLDERS.map(({ key, label }) => ({ key, label }));

/** Replace {{key}} tokens and legacy ID markers with provided values. */
export function renderDeclarationTemplate(
  body: string,
  vars: DeclarationTemplateVars = {},
): string {
  let text = body ?? '';

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (value != null && String(value).trim() !== '') {
      normalized[key] = String(value);
    }
  }

  text = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    return normalized[key] ?? `{{${key}}}`;
  });

  const idValue = normalized.id_number || '______';
  text = text.replace(/______/g, idValue);
  text = text.replace(/\{ID\}/g, idValue);

  return text;
}

export function canManageDeclarationTemplates(role: string | undefined | null): boolean {
  return role === 'fleet_manager' || role === 'super_admin';
}

/**
 * Display text for an already-created declaration.
 * Uses the immutable DB snapshot only — never falls back to the hardcoded seed body.
 */
export function resolveStoredDeclarationText(
  declarationText: string | null | undefined,
  vars: DeclarationTemplateVars = {},
): string {
  const raw = String(declarationText ?? '');
  if (!raw.trim()) {
    return 'חסר נוסח תצהיר שמור. יש ליצור תצהיר חדש לאחר שמירת התבנית במסד הנתונים.';
  }
  return renderDeclarationTemplate(raw, vars);
}
