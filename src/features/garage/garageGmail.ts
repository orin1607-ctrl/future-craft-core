import { supabase } from '@/integrations/supabase/client';

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/garage-gmail`;

function from(table: string) {
  return supabase.from(table as never);
}

export async function invokeGarageGmail(action: string, body: Record<string, unknown> = {}) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return { success: false, error: 'not_authenticated' };
  const res = await fetch(FN, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...body }),
  });
  try {
    return await res.json();
  } catch {
    return { success: false, error: `http_${res.status}` };
  }
}

export async function listGarageCases() {
  const { data, error } = await from('garage_cases')
    .select('id, case_number, status, customer_name_snapshot, vehicle_plate_snapshot, vehicle_label_snapshot, gmail_thread_id, updated_at, created_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getGarageCase(id: string) {
  const { data, error } = await from('garage_cases')
    .select('id, case_number, status, customer_name_snapshot, vehicle_plate_snapshot, vehicle_label_snapshot, case_data, gmail_thread_id, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
