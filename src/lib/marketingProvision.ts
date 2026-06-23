import { supabase } from '@/integrations/supabase/client';

export type ServiceType = 'fleet_only' | 'marketing_only' | 'fleet_and_marketing';

export const SERVICE_TYPE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: 'fleet_only', label: 'ניהול צי רכב בלבד' },
  { value: 'marketing_only', label: 'ניהול שיווק בלבד' },
  { value: 'fleet_and_marketing', label: 'ניהול צי רכב + ניהול שיווק' },
];

export function hasMarketingService(serviceType: string | null | undefined): boolean {
  return serviceType === 'marketing_only' || serviceType === 'fleet_and_marketing';
}

const GOOGLE_PROVIDERS = [
  'google_analytics', 'google_search_console', 'google_ads', 'google_business',
  'google_tag_manager', 'gmail', 'google_workspace', 'google_merchant',
];

const SOCIAL_PROVIDERS = [
  'facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'whatsapp_business',
];

const AI_CHECKLIST_KEYS = [
  'site_check', 'seo_check', 'analytics_check', 'search_console_check',
  'google_business_check', 'performance_check', 'competitors_check',
];

export interface DaliaCustomerSnapshot {
  id: string;
  name: string;
  business_id?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  contact_person?: string | null;
  contact_role?: string | null;
  activity_field?: string | null;
  customer_number?: string | null;
  status?: string | null;
  company_name?: string | null;
}

function buildDaliaSnapshot(c: DaliaCustomerSnapshot) {
  return {
    name: c.name,
    business_id: c.business_id,
    address: c.address,
    phone: c.phone,
    email: c.email,
    contact_person: c.contact_person,
    contact_role: c.contact_role,
    activity_field: c.activity_field,
    customer_number: c.customer_number,
    status: c.status,
    synced_at: new Date().toISOString(),
  };
}

/** יוצר / מעדכן סביבת שיווק מלאה ללקוח קיים בדליה — ללא כפילות */
export async function provisionMarketingClient(customer: DaliaCustomerSnapshot): Promise<{ ok: boolean; error?: string }> {
  const snapshot = buildDaliaSnapshot(customer);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('marketing_profiles')
    .select('id, setup_status')
    .eq('customer_id', customer.id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('marketing_profiles')
      .update({
        dalia_snapshot: snapshot,
        synced_at: now,
        updated_at: now,
      })
      .eq('customer_id', customer.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error: profileErr } = await supabase.from('marketing_profiles').insert({
    customer_id: customer.id,
    dalia_snapshot: snapshot,
    synced_at: now,
    setup_status: 'provisioned',
    provisioned_at: now,
  });
  if (profileErr) return { ok: false, error: profileErr.message };

  const { error: aiErr } = await supabase.from('marketing_ai_setup').insert({
    customer_id: customer.id,
    checklist: Object.fromEntries(AI_CHECKLIST_KEYS.map((k) => [k, 'pending'])),
    initial_goals: [],
    recommendations: ['השלם חיבורי Google ורשתות', 'הגדר אתר ודומיין ראשי', 'פתח קמפיין ראשון'],
    work_plan: ['ניתוח אתר', 'ניתוח SEO', 'קביעת מטרות ראשוניות'],
  });
  if (aiErr) return { ok: false, error: aiErr.message };

  const connections = [...GOOGLE_PROVIDERS, ...SOCIAL_PROVIDERS].map((provider) => ({
    customer_id: customer.id,
    provider,
    status: 'disconnected',
  }));
  const { error: connErr } = await supabase.from('marketing_connections').upsert(connections, {
    onConflict: 'customer_id,provider',
    ignoreDuplicates: true,
  });
  if (connErr) return { ok: false, error: connErr.message };

  if (customer.contact_person) {
    const { data: primary } = await supabase
      .from('marketing_contacts')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('is_primary', true)
      .maybeSingle();

    const payload = {
      customer_id: customer.id,
      contact_role: 'owner',
      full_name: customer.contact_person,
      phone: customer.phone || '',
      email: customer.email || '',
      is_primary: true,
    };

    if (primary?.id) {
      await supabase.from('marketing_contacts').update(payload).eq('id', primary.id);
    } else {
      await supabase.from('marketing_contacts').insert(payload);
    }
  }

  return { ok: true };
}

export async function syncMarketingFromDalia(customer: DaliaCustomerSnapshot): Promise<{ ok: boolean; error?: string }> {
  const snapshot = buildDaliaSnapshot(customer);
  const { error } = await supabase
    .from('marketing_profiles')
    .update({ dalia_snapshot: snapshot, synced_at: new Date().toISOString() })
    .eq('customer_id', customer.id);

  if (error) return { ok: false, error: error.message };

  if (customer.contact_person) {
    const { data: primary } = await supabase
      .from('marketing_contacts')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('is_primary', true)
      .maybeSingle();

    const payload = {
      customer_id: customer.id,
      contact_role: customer.contact_role || 'owner',
      full_name: customer.contact_person,
      phone: customer.phone || '',
      email: customer.email || '',
      is_primary: true,
    };

    if (primary?.id) {
      await supabase.from('marketing_contacts').update(payload).eq('id', primary.id);
    } else {
      await supabase.from('marketing_contacts').insert({ ...payload, contact_role: 'owner' });
    }
  }

  return { ok: true };
}
