import { supabase } from '@/integrations/supabase/client';
import {
  DALIA_INCIDENT_CONTACTS,
  type IncidentRecipientMode,
} from '@/lib/daliaIncidentNotifyContacts';
import { faultTypeDisplay } from '@/lib/faultTypes';
import { formatIsraelDateTime } from '@/lib/incidentEventNumber';

export type IncidentKind = 'fault' | 'accident';

export type IncidentNotifyRecord = {
  id?: string;
  event_number?: string | null;
  company_name?: string | null;
  driver_name?: string | null;
  reporter_phone?: string | null;
  vehicle_plate?: string | null;
  vehicle_internal_number?: string | null;
  fault_type?: string | null;
  fault_type_other?: string | null;
  description?: string | null;
  urgency?: string | null;
  created_at?: string | null;
  date?: string | null;
  images?: string | null;
  location?: string | null;
};

export type CompanyIncidentNotifySettings = {
  incident_notify_in_app: boolean;
  incident_notify_email: boolean;
  incident_notify_whatsapp: boolean;
  incident_email_recipients: IncidentRecipientMode;
  incident_whatsapp_recipients: IncidentRecipientMode;
  whatsapp_enabled: boolean | null;
};

const DEFAULT_SETTINGS: CompanyIncidentNotifySettings = {
  incident_notify_in_app: true,
  incident_notify_email: true,
  incident_notify_whatsapp: false,
  incident_email_recipients: 'fleet_managers',
  incident_whatsapp_recipients: 'dalia',
  whatsapp_enabled: false,
};

export async function fetchIncidentNotifySettings(
  companyName: string,
): Promise<CompanyIncidentNotifySettings> {
  if (!companyName) return DEFAULT_SETTINGS;
  const { data } = await supabase
    .from('company_settings')
    .select(
      'incident_notify_in_app, incident_notify_email, incident_notify_whatsapp, incident_email_recipients, incident_whatsapp_recipients, whatsapp_enabled',
    )
    .eq('company_name', companyName)
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    incident_notify_in_app: data.incident_notify_in_app ?? true,
    incident_notify_email: data.incident_notify_email ?? true,
    incident_notify_whatsapp: data.incident_notify_whatsapp ?? false,
    incident_email_recipients: (data.incident_email_recipients as IncidentRecipientMode) || 'fleet_managers',
    incident_whatsapp_recipients:
      (data.incident_whatsapp_recipients as IncidentRecipientMode) || 'dalia',
    whatsapp_enabled: data.whatsapp_enabled,
  };
}

export function buildIncidentAppPath(kind: IncidentKind, id: string): string {
  const base = kind === 'fault' ? '/faults' : '/accidents';
  return `${base}?id=${encodeURIComponent(id)}`;
}

export function buildIncidentAbsoluteUrl(kind: IncidentKind, id: string): string {
  const path = buildIncidentAppPath(kind, id);
  if (typeof window !== 'undefined' && window.location?.origin) {
    const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${window.location.origin}${basePath}${path}`;
  }
  return path;
}

export function buildWhatsAppPreview(kind: IncidentKind, record: IncidentNotifyRecord, link: string): string {
  const when = formatIsraelDateTime(record.created_at || record.date);
  const plateLine = record.vehicle_internal_number
    ? `${record.vehicle_plate || '—'} (פנימי: ${record.vehicle_internal_number})`
    : record.vehicle_plate || '—';

  if (kind === 'fault') {
    return [
      'דיווח תקלה חדש',
      `מספר אירוע: ${record.event_number || '—'}`,
      `חברה: ${record.company_name || '—'}`,
      `נהג: ${record.driver_name || '—'}`,
      `רכב: ${plateLine}`,
      `סוג תקלה: ${faultTypeDisplay(record.fault_type, record.fault_type_other)}`,
      `תאריך ושעה: ${when}`,
      `תיאור: ${(record.description || '—').slice(0, 200)}`,
      'נציג דליה יחזור לנהג בהקדם.',
      `קישור לצפייה באירוע:`,
      link,
    ].join('\n');
  }

  return [
    'דיווח תאונה חדש',
    `מספר אירוע: ${record.event_number || '—'}`,
    `חברה: ${record.company_name || '—'}`,
    `נהג: ${record.driver_name || '—'}`,
    `רכב: ${plateLine}`,
    `תאריך ושעה: ${when}`,
    `תיאור: ${(record.description || '—').slice(0, 200)}`,
    'נציג דליה יחזור לנהג בהקדם.',
    `קישור לצפייה באירוע:`,
    link,
  ].join('\n');
}

export function buildEmailSubject(kind: IncidentKind, record: IncidentNotifyRecord): string {
  const label = kind === 'fault' ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש';
  return `${label} | ${record.company_name || '—'} | ${record.vehicle_plate || '—'} | ${record.event_number || '—'}`;
}

export function buildEmailPreviewHtml(kind: IncidentKind, record: IncidentNotifyRecord, link: string): string {
  const when = formatIsraelDateTime(record.created_at || record.date);
  const hasImage = !!(record.images && record.images !== '' && record.images !== '[]');
  const plateLine = record.vehicle_internal_number
    ? `${record.vehicle_plate || '—'} (מספר פנימי: ${record.vehicle_internal_number})`
    : record.vehicle_plate || '—';
  const typeRow =
    kind === 'fault'
      ? `<tr><td style="padding:8px;font-weight:bold">סוג תקלה</td><td style="padding:8px">${faultTypeDisplay(record.fault_type, record.fault_type_other)}</td></tr>`
      : '';

  return `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px">
  <h2>${kind === 'fault' ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש'}</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:8px;font-weight:bold">מספר אירוע</td><td style="padding:8px">${record.event_number || '—'}</td></tr>
    <tr><td style="padding:8px;font-weight:bold">חברה</td><td style="padding:8px">${record.company_name || '—'}</td></tr>
    <tr><td style="padding:8px;font-weight:bold">נהג</td><td style="padding:8px">${record.driver_name || '—'}</td></tr>
    <tr><td style="padding:8px;font-weight:bold">טלפון נהג</td><td style="padding:8px">${record.reporter_phone || '—'}</td></tr>
    <tr><td style="padding:8px;font-weight:bold">רכב</td><td style="padding:8px">${plateLine}</td></tr>
    ${typeRow}
    <tr><td style="padding:8px;font-weight:bold">תאריך ושעה</td><td style="padding:8px">${when}</td></tr>
    <tr><td style="padding:8px;font-weight:bold">תיאור</td><td style="padding:8px">${record.description || '—'}</td></tr>
    <tr><td style="padding:8px;font-weight:bold">צורפה תמונה</td><td style="padding:8px">${hasImage ? 'כן' : 'לא'}</td></tr>
  </table>
  <p><a href="${link}">פתיחת האירוע במערכת</a></p>
  <p style="color:#666;font-size:12px">נמען לדוגמה לדליה: ${DALIA_INCIDENT_CONTACTS.email} · WA: ${DALIA_INCIDENT_CONTACTS.whatsappPhone}</p>
</div>`.trim();
}

/**
 * Dispatch notifications after successful save.
 * dryRun=true (default in staging UI) → no real Email/WhatsApp; returns previews.
 */
export async function dispatchIncidentNotifications(opts: {
  kind: IncidentKind;
  record: IncidentNotifyRecord;
  dryRun?: boolean;
}): Promise<{
  settings: CompanyIncidentNotifySettings;
  whatsappPreview: string;
  emailSubject: string;
  emailHtml: string;
  link: string;
  wouldSendWhatsApp: boolean;
  wouldSendEmail: boolean;
  edgeResult?: unknown;
}> {
  const { kind, record } = opts;
  const dryRun = opts.dryRun !== false; // default true — safe until user approves live send
  const settings = await fetchIncidentNotifySettings(record.company_name || '');
  const link = record.id
    ? buildIncidentAbsoluteUrl(kind, record.id)
    : buildIncidentAppPath(kind, 'pending');

  const whatsappPreview = buildWhatsAppPreview(kind, record, link);
  const emailSubject = buildEmailSubject(kind, record);
  const emailHtml = buildEmailPreviewHtml(kind, record, link);

  const waAllowed =
    settings.incident_notify_whatsapp && settings.whatsapp_enabled === true;
  const wouldSendWhatsApp = waAllowed;
  const wouldSendEmail = settings.incident_notify_email === true;

  let edgeResult: unknown;
  if (!dryRun && (wouldSendEmail || wouldSendWhatsApp)) {
    const { data, error } = await supabase.functions.invoke('notify-accident-email', {
      body: {
        record: {
          ...record,
          event_number: record.event_number,
          link,
        },
        type: kind === 'fault' ? 'fault' : 'accident',
        channels: {
          email: wouldSendEmail,
          whatsapp: wouldSendWhatsApp,
          emailRecipients: settings.incident_email_recipients,
          whatsappRecipients: settings.incident_whatsapp_recipients,
        },
        dry_run: false,
        dalia: DALIA_INCIDENT_CONTACTS,
      },
    });
    edgeResult = error || data;
  }

  return {
    settings,
    whatsappPreview,
    emailSubject,
    emailHtml,
    link,
    wouldSendWhatsApp,
    wouldSendEmail,
    edgeResult,
  };
}
