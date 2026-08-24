/**
 * Dalia Settings → User Management — field schema
 */

export type UserCreationType =
  | 'private_customer'
  | 'business_customer'
  | 'fleet_manager'
  | 'driver'
  | 'telemarketing_agent';

export const USER_TYPE_LABELS: Record<UserCreationType, string> = {
  private_customer: 'לקוח פרטי',
  business_customer: 'לקוח עסקי / בעל עסק',
  fleet_manager: 'מנהל צי רכב',
  driver: 'נהג',
  telemarketing_agent: 'נציג/ת טלמיטינג',
};

export const USER_TYPE_DESCRIPTIONS: Record<UserCreationType, string> = {
  private_customer: 'לקוח פרטי עם גישה לשירותים אישיים',
  business_customer: 'בעל עסק / חברה — שיוך עתידי לרכבים, נהגים ומסמכים',
  fleet_manager: 'מנהל צי עם הרשאות ניהול לפי חברה',
  driver: 'נהג עם שיוך לחברה ולרכב',
  telemarketing_agent: 'נציג/ת טלמיטינג — שיחות, דיווח ו-Follow-up בלבד',
};

export const ROLE_MAP: Record<UserCreationType, string> = {
  private_customer: 'private_customer',
  business_customer: 'business_customer',
  fleet_manager: 'fleet_manager',
  driver: 'driver',
  telemarketing_agent: 'telemarketing_agent',
};

export type FieldKey =
  | 'full_name'
  | 'phone'
  | 'email'
  | 'login_email'
  | 'password'
  | 'nickname'
  | 'address'
  | 'notes'
  | 'company_name'
  | 'contact_person'
  | 'contact_role'
  | 'business_id'
  | 'activity_field'
  | 'company_assigned'
  | 'job_title'
  | 'permissions'
  | 'assigned_vehicle_id'
  | 'license_number'
  | 'service_type'
  | 'user_number';

export interface FieldDef {
  key: FieldKey;
  label: string;
  placeholder?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'password' | 'textarea' | 'select';
  dir?: 'ltr' | 'rtl';
  persisted: boolean;
  persistTarget?: string;
}

const f = (
  key: FieldKey,
  label: string,
  opts: Partial<FieldDef> = {},
): FieldDef => ({ key, label, type: 'text', persisted: true, ...opts });

export const FIELDS_BY_TYPE: Record<UserCreationType, FieldDef[]> = {
  private_customer: [
    f('full_name', 'שם מלא', { required: true, persistTarget: 'profiles.full_name' }),
    f('phone', 'טלפון', { required: true, persistTarget: 'profiles.phone', dir: 'ltr' }),
    f('email', 'אימייל', { type: 'email', dir: 'ltr', persistTarget: 'profiles.contact_email' }),
    f('login_email', 'אימייל התחברות', { required: true, type: 'email', dir: 'ltr', persistTarget: 'auth.email' }),
    f('password', 'סיסמה', { required: true, type: 'password', dir: 'ltr', persistTarget: 'auth.password' }),
    f('nickname', 'כינוי', { persistTarget: 'profiles.nickname' }),
    f('address', 'כתובת', { persistTarget: 'profiles.address' }),
    f('notes', 'הערות', { type: 'textarea', persistTarget: 'profiles.notes' }),
  ],
  business_customer: [
    f('company_name', 'שם חברה', { required: true, persistTarget: 'customers.name' }),
    f('contact_person', 'שם איש קשר', { required: true, persistTarget: 'customers.contact_person' }),
    f('contact_role', 'תפקיד איש קשר', { persistTarget: 'customers.contact_role' }),
    f('business_id', 'מספר עוסק מורשה / ח.פ', { persistTarget: 'customers.business_id', dir: 'ltr' }),
    f('address', 'כתובת', { persistTarget: 'customers.address' }),
    f('phone', 'טלפון', { required: true, persistTarget: 'customers.phone', dir: 'ltr' }),
    f('email', 'אימייל', { type: 'email', dir: 'ltr', persistTarget: 'customers.email' }),
    f('login_email', 'אימייל התחברות', { required: true, type: 'email', dir: 'ltr', persistTarget: 'auth.email' }),
    f('password', 'סיסמה', { required: true, type: 'password', dir: 'ltr', persistTarget: 'auth.password' }),
    f('nickname', 'כינוי', { persistTarget: 'profiles.nickname' }),
    f('activity_field', 'תחום פעילות', { persistTarget: 'customers.activity_field' }),
    f('service_type', 'סוג שירות', { type: 'select', required: true, persistTarget: 'customers.service_type' }),
    f('notes', 'הערות', { type: 'textarea', persistTarget: 'customers.notes' }),
  ],
  fleet_manager: [
    f('full_name', 'שם מלא', { required: true, persistTarget: 'profiles.full_name' }),
    f('phone', 'טלפון', { required: true, persistTarget: 'profiles.phone', dir: 'ltr' }),
    f('email', 'אימייל', { type: 'email', dir: 'ltr', persistTarget: 'profiles.contact_email' }),
    f('login_email', 'אימייל התחברות', { required: true, type: 'email', dir: 'ltr', persistTarget: 'auth.email' }),
    f('password', 'סיסמה', { required: true, type: 'password', dir: 'ltr', persistTarget: 'auth.password' }),
    f('company_assigned', 'חברה משויכת', { required: true, persistTarget: 'profiles.company_name' }),
    f('job_title', 'תפקיד', { persistTarget: 'profiles.job_title' }),
    f('permissions', 'הרשאות', { type: 'textarea', persistTarget: 'profiles.notes' }),
    f('notes', 'הערות', { type: 'textarea', persistTarget: 'profiles.notes' }),
  ],
  driver: [
    f('full_name', 'שם נהג', { required: true, persistTarget: 'profiles.full_name' }),
    f('phone', 'טלפון', { required: true, persistTarget: 'profiles.phone', dir: 'ltr' }),
    f('email', 'אימייל', { type: 'email', dir: 'ltr', persistTarget: 'drivers.email' }),
    f('password', 'סיסמה / קוד כניסה', { required: true, type: 'password', dir: 'ltr', persistTarget: 'auth.password' }),
    f('company_assigned', 'חברה משויכת', { required: true, persistTarget: 'profiles.company_name' }),
    f('assigned_vehicle_id', 'רכב משויך', { type: 'select', persistTarget: 'vehicles.assigned_driver_id' }),
    f('license_number', 'מספר רישיון נהיגה', { persistTarget: 'drivers.license_number', dir: 'ltr' }),
    f('notes', 'הערות', { type: 'textarea', persistTarget: 'drivers.notes' }),
  ],
  telemarketing_agent: [
    f('full_name', 'שם מלא', { required: true, persistTarget: 'profiles.full_name' }),
    f('user_number', 'קוד עובד', { persistTarget: 'profiles.user_number', dir: 'ltr' }),
    f('phone', 'טלפון', { required: true, persistTarget: 'profiles.phone', dir: 'ltr' }),
    f('email', 'אימייל', { type: 'email', dir: 'ltr', persistTarget: 'profiles.contact_email' }),
    f('login_email', 'אימייל התחברות', { required: true, type: 'email', dir: 'ltr', persistTarget: 'auth.email' }),
    f('password', 'סיסמה', { required: true, type: 'password', dir: 'ltr', persistTarget: 'auth.password' }),
    f('company_assigned', 'חברה משויכת', { required: true, persistTarget: 'profiles.company_name' }),
    f('job_title', 'תפקיד', { persistTarget: 'profiles.job_title' }),
    f('notes', 'הערות', { type: 'textarea', persistTarget: 'profiles.notes' }),
  ],
};

export type CreateUserFormValues = Partial<Record<FieldKey, string>> & {
  userType?: UserCreationType;
  isActive?: boolean;
  noEmail?: boolean;
};

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לאישור',
  approved: 'מאושר',
  rejected: 'נדחה',
};

export const FUTURE_LOGIN_FEATURES = [
  'פתיחת חשבון חדש (self-service)',
  'שכחתי סיסמה',
  'שליחת קוד לאימייל',
  'איפוס סיסמה',
  'אימות דו-שלבי (2FA)',
] as const;

export function emptyFormForType(type: UserCreationType): CreateUserFormValues {
  const base: CreateUserFormValues = { userType: type, isActive: false, noEmail: false };
  if (type === 'business_customer') base.service_type = 'marketing_only';
  return base;
}

export function getPendingFields(_type: UserCreationType): FieldDef[] {
  return [];
}
