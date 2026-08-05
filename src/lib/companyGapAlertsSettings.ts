import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_GAP_ALERT_ITEMS,
  type GapAlertConfigItem,
  type GapAlertKey,
} from '@/lib/vehicleGapAlertsDefaults';

export type CompanyGapAlertsSettings = {
  items: GapAlertConfigItem[];
  hasCustom: boolean;
};

const VALID_KEYS = new Set<string>(DEFAULT_GAP_ALERT_ITEMS.map((i) => i.key));

function normalizeItem(raw: unknown, fallback: GapAlertConfigItem): GapAlertConfigItem {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  const key = String(o.key || fallback.key) as GapAlertKey;
  if (!VALID_KEYS.has(key)) return { ...fallback };
  return {
    key,
    displayLabel: String(o.displayLabel || fallback.displayLabel).trim() || fallback.displayLabel,
    order: typeof o.order === 'number' ? o.order : fallback.order,
    visible: o.visible === false ? false : true,
    isSystem: true,
    isCritical: fallback.isCritical,
    locked: fallback.locked,
  };
}

/** Merge saved config with system defaults (preserves critical/locked flags from defaults). */
export function mergeGapAlertsConfig(raw: unknown): GapAlertConfigItem[] {
  const byKey = new Map<GapAlertKey, GapAlertConfigItem>();
  for (const def of DEFAULT_GAP_ALERT_ITEMS) {
    byKey.set(def.key, { ...def });
  }
  if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
    for (const item of (raw as { items: unknown[] }).items) {
      const key = (item as { key?: string })?.key;
      if (key && VALID_KEYS.has(key)) {
        const fallback = byKey.get(key as GapAlertKey)!;
        byKey.set(key as GapAlertKey, normalizeItem(item, fallback));
      }
    }
  }
  return DEFAULT_GAP_ALERT_ITEMS.map((def) => byKey.get(def.key)!);
}

export async function loadCompanyGapAlertsSettings(companyName: string): Promise<CompanyGapAlertsSettings> {
  const { data } = await supabase
    .from('company_settings')
    .select('custom_gap_alerts_config')
    .eq('company_name', companyName)
    .maybeSingle();

  const raw = data?.custom_gap_alerts_config;
  const hasCustom = raw != null && typeof raw === 'object';

  return {
    items: mergeGapAlertsConfig(raw),
    hasCustom,
  };
}

async function ensureCompanySettingsRow(companyName: string): Promise<void> {
  const { data } = await supabase
    .from('company_settings')
    .select('id')
    .eq('company_name', companyName)
    .maybeSingle();
  if (!data) {
    await supabase.from('company_settings').insert({ company_name: companyName });
  }
}

export async function saveCompanyGapAlertsConfig(
  companyName: string,
  items: GapAlertConfigItem[],
): Promise<void> {
  const payload = {
    items: mergeGapAlertsConfig({ items }).map((i) => ({
      key: i.key,
      displayLabel: i.displayLabel,
      order: i.order,
      visible: i.visible,
      isSystem: true,
    })),
  };
  await ensureCompanySettingsRow(companyName);
  const { error } = await supabase
    .from('company_settings')
    .update({ custom_gap_alerts_config: payload, updated_at: new Date().toISOString() })
    .eq('company_name', companyName);
  if (error) throw new Error(error.message);
}

export async function resetCompanyGapAlertsConfig(companyName: string): Promise<void> {
  await ensureCompanySettingsRow(companyName);
  const { error } = await supabase
    .from('company_settings')
    .update({ custom_gap_alerts_config: null, updated_at: new Date().toISOString() })
    .eq('company_name', companyName);
  if (error) throw new Error(error.message);
}
