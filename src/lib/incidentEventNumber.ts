import { supabase } from '@/integrations/supabase/client';

export type IncidentPrefix = 'ACC' | 'FLT';

export async function allocateIncidentEventNumber(
  companyName: string,
  prefix: IncidentPrefix,
): Promise<string> {
  const { data, error } = await supabase.rpc('allocate_incident_event_number', {
    p_company: companyName || 'unknown',
    p_prefix: prefix,
  });
  if (error) {
    console.error('allocate_incident_event_number', error);
    // Staging fallback if migration not yet applied — still unique enough for demo
    const y = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric' });
    const suffix = Date.now().toString().slice(-6);
    return `${prefix}-${y}-${suffix}`;
  }
  return String(data);
}

export function formatIsraelDateTime(isoOrDate?: string | Date | null): string {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function israelNowIso(): string {
  return new Date().toISOString();
}
