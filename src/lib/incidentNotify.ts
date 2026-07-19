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
  status?: string | null;
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
};

const DEFAULT_SETTINGS: CompanyIncidentNotifySettings = {
  incident_notify_in_app: true,
  incident_notify_email: true,
  incident_notify_whatsapp: false,
  incident_email_recipients: 'fleet_managers',
  incident_whatsapp_recipients: 'dalia',
};

export async function fetchIncidentNotifySettings(
  companyName: string,
): Promise<CompanyIncidentNotifySettings> {
  if (!companyName) return DEFAULT_SETTINGS;
  const { data } = await supabase
    .from('company_settings')
    .select(
      'incident_notify_in_app, incident_notify_email, incident_notify_whatsapp, incident_email_recipients, incident_whatsapp_recipients',
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
  const status = record.status || (kind === 'fault' ? 'opened' : 'open');
  const plate = record.vehicle_plate || '—';
  const internal = record.vehicle_internal_number || '';

  const lines = [
    kind === 'fault' ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש',
    `מספר אירוע: ${record.event_number || '—'}`,
    `חברה: ${record.company_name || '—'}`,
    `נהג: ${record.driver_name || '—'}`,
    `טלפון נהג: ${record.reporter_phone || '—'}`,
    `מספר רישוי: ${plate}`,
    ...(internal ? [`מספר פנימי: ${internal}`] : []),
    `סוג אירוע: ${kind === 'fault' ? 'תקלה' : 'תאונה'}`,
    ...(kind === 'fault'
      ? [`סוג תקלה: ${faultTypeDisplay(record.fault_type, record.fault_type_other)}`]
      : []),
    `תאריך ושעה: ${when}`,
    `תיאור: ${(record.description || '—').slice(0, 200)}`,
    `סטטוס ראשוני: ${status}`,
    'נציג דליה יחזור לנהג בהקדם.',
    'קישור לצפייה באירוע:',
    link,
  ];
  return lines.join('\n');
}

export function buildEmailSubject(kind: IncidentKind, record: IncidentNotifyRecord): string {
  const label = kind === 'fault' ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש';
  return `${label} | ${record.company_name || '—'} | ${record.vehicle_plate || '—'} | ${record.event_number || '—'}`;
}

export function buildEmailPreviewHtml(kind: IncidentKind, record: IncidentNotifyRecord, link: string): string {
  const text = buildWhatsAppPreview(kind, record, link).replace(/\n/g, '<br/>');
  return `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px">
  <h2>${kind === 'fault' ? 'דיווח תקלה חדש' : 'דיווח תאונה חדש'}</h2>
  <div style="line-height:1.6">${text}</div>
  <p><a href="${link}">פתיחת האירוע במערכת</a></p>
  <p style="color:#666;font-size:12px">דליה: ${DALIA_INCIDENT_CONTACTS.email} · WA: ${DALIA_INCIDENT_CONTACTS.whatsappPhone}</p>
</div>`.trim();
}

/**
 * Dispatch notifications after successful save.
 * dryRun=false (default) → real Email/WhatsApp per company settings.
 * Failures are soft — never throw; caller must still treat save as success.
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
  wouldSendInApp: boolean;
  edgeResult?: unknown;
  notifyError?: string | null;
}> {
  const { kind, record } = opts;
  const dryRun = opts.dryRun === true; // default LIVE
  let settings = DEFAULT_SETTINGS;
  let notifyError: string | null = null;
  let edgeResult: unknown;

  try {
    settings = await fetchIncidentNotifySettings(record.company_name || '');
  } catch (e) {
    notifyError = e instanceof Error ? e.message : 'settings fetch failed';
  }

  const link = record.id
    ? buildIncidentAbsoluteUrl(kind, record.id)
    : buildIncidentAppPath(kind, 'pending');

  const whatsappPreview = buildWhatsAppPreview(kind, record, link);
  const emailSubject = buildEmailSubject(kind, record);
  const emailHtml = buildEmailPreviewHtml(kind, record, link);

  // Incident WhatsApp is independent of emergency whatsapp_enabled
  const wouldSendWhatsApp = settings.incident_notify_whatsapp === true;
  const wouldSendEmail = settings.incident_notify_email === true;
  const wouldSendInApp = settings.incident_notify_in_app === true;

  if (!dryRun && (wouldSendEmail || wouldSendWhatsApp || wouldSendInApp)) {
    try {
      const { data, error } = await supabase.functions.invoke('notify-accident-email', {
        body: {
          record: {
            ...record,
            event_number: record.event_number,
            status: record.status,
            link,
          },
          type: kind === 'fault' ? 'fault' : 'accident',
          channels: {
            in_app: wouldSendInApp,
            email: wouldSendEmail,
            whatsapp: wouldSendWhatsApp,
            emailRecipients: settings.incident_email_recipients,
            whatsappRecipients: settings.incident_whatsapp_recipients,
          },
          dry_run: false,
          dalia: DALIA_INCIDENT_CONTACTS,
        },
      });
      edgeResult = error ? { error: error.message || String(error), data } : data;
      if (error) notifyError = error.message || 'notify invoke failed';
    } catch (e) {
      notifyError = e instanceof Error ? e.message : 'notify invoke threw';
      edgeResult = { error: notifyError };
    }
  }

  return {
    settings,
    whatsappPreview,
    emailSubject,
    emailHtml,
    link,
    wouldSendWhatsApp,
    wouldSendEmail,
    wouldSendInApp,
    edgeResult,
    notifyError,
  };
}
