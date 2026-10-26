/**
 * claimPaintCalc.ts
 * Service layer לשמירה וטעינה של חישובי צבע לתיקי תביעות.
 * STAGING ONLY — אין שינוי בטבלאות קיימות.
 */
import { supabase } from '@/integrations/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaintCalcRow {
  id: string;
  claim_id: string;
  company_name: string;
  version: number;
  is_draft: boolean;
  calc_data: PaintCalcData;
  summary_text: string;
  total_amount: number;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface PaintCalcData {
  customerName: string;
  carModel: string;
  carGroup: 'A' | 'B' | 'C' | 'D';
  paintType: 'solid' | 'baseclear' | 'pearl';
  hourRate: number;
  materialPercent: number;
  generalHours: number;
  generalWorkNotes: string;
  vatPercent: number;
  notes: string;
  parts: PaintCalcPart[];
  // Results
  baseHours: number;
  adjustedHours: number;
  laborCost: number;
  materialsCost: number;
  generalHoursCost: number;
  vatAmount: number;
  total: number;
}

export interface PaintCalcPart {
  partName: string;
  customName?: string;
  workMode: string;
  baseHours: number;
  percent: number;
  extraHours: number;
  finalHours: number;
  rowPrice: number;
  rowNote: string;
}

const PAINT_CALC_TABLE = 'claim_paint_calcs';

function tbl() {
  return supabase.from(PAINT_CALC_TABLE as never);
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function savePaintCalcDraft(
  claimId: string,
  companyName: string,
  data: PaintCalcData,
  userId: string,
  userName: string,
): Promise<{ id: string } | null> {
  // מוצא טיוטה קיימת לתיק זה
  const { data: existing } = await tbl()
    .select('id')
    .eq('claim_id', claimId)
    .eq('is_draft', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: { id: string } | null };

  const payload = {
    claim_id: claimId,
    company_name: companyName,
    is_draft: true,
    calc_data: data as unknown as Record<string, unknown>,
    summary_text: buildSummaryText(data),
    total_amount: data.total,
    created_by: userId,
    created_by_name: userName,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await tbl()
      .update(payload as never)
      .eq('id', existing.id);
    if (error) { console.error('paint calc draft update error', error); return null; }
    return { id: existing.id };
  } else {
    const { data: inserted, error } = await tbl()
      .insert({ ...payload, version: 1 } as never)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown };
    if (error) { console.error('paint calc draft insert error', error); return null; }
    return inserted ? { id: (inserted as { id: string }).id } : null;
  }
}

export async function savePaintCalcOfficial(
  claimId: string,
  companyName: string,
  data: PaintCalcData,
  userId: string,
  userName: string,
): Promise<PaintCalcRow | null> {
  // מחשב version הבא
  const { count } = await tbl()
    .select('id', { count: 'exact', head: true })
    .eq('claim_id', claimId)
    .eq('is_draft', false) as { count: number | null };
  const version = (count || 0) + 1;

  const payload = {
    claim_id: claimId,
    company_name: companyName,
    is_draft: false,
    version,
    calc_data: data as unknown as Record<string, unknown>,
    summary_text: buildSummaryText(data),
    total_amount: data.total,
    created_by: userId,
    created_by_name: userName,
    updated_at: new Date().toISOString(),
  };

  const { data: inserted, error } = await tbl()
    .insert(payload as never)
    .select()
    .single() as { data: PaintCalcRow | null; error: unknown };

  if (error) { console.error('paint calc save error', error); return null; }

  // רישום פעולה בהיסטוריית התביעה הקיימת
  await appendToClaimHistory(claimId, companyName, {
    action: 'paint_calc_saved',
    note: `חישוב צבע גרסה ${version} נשמר — סה"כ ₪${data.total.toLocaleString('he-IL')}`,
    by: userName,
  });

  return inserted;
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadPaintCalcDraft(claimId: string): Promise<PaintCalcRow | null> {
  const { data, error } = await tbl()
    .select('*')
    .eq('claim_id', claimId)
    .eq('is_draft', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle() as { data: PaintCalcRow | null; error: unknown };
  if (error) console.error('load draft error', error);
  return data;
}

export async function loadPaintCalcHistory(claimId: string): Promise<PaintCalcRow[]> {
  const { data, error } = await tbl()
    .select('*')
    .eq('claim_id', claimId)
    .eq('is_draft', false)
    .order('version', { ascending: false }) as { data: PaintCalcRow[] | null; error: unknown };
  if (error) console.error('load history error', error);
  return data || [];
}

export async function loadPaintCalcById(id: string): Promise<PaintCalcRow | null> {
  const { data, error } = await tbl()
    .select('*')
    .eq('id', id)
    .maybeSingle() as { data: PaintCalcRow | null; error: unknown };
  if (error) console.error('load by id error', error);
  return data;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildSummaryText(data: PaintCalcData): string {
  const parts = data.parts.map((p, i) =>
    `${i + 1}. ${p.customName || p.partName} — ${p.finalHours.toFixed(2)} שעות — ₪${p.rowPrice.toLocaleString('he-IL')}`
  ).join('\n');
  return `לקוח: ${data.customerName} | רכב: ${data.carModel}
שעות: ${data.adjustedHours.toFixed(2)} | עבודה: ₪${data.laborCost.toLocaleString('he-IL')} | חומרים: ₪${data.materialsCost.toLocaleString('he-IL')} | מע"מ: ₪${data.vatAmount.toLocaleString('he-IL')} | סה"כ: ₪${data.total.toLocaleString('he-IL')}
${parts}`;
}

/** רישום פעולה לשדה row_data.paintCalcHistory של התביעה (ללא שינוי מבנה) */
async function appendToClaimHistory(
  claimId: string,
  _companyName: string,
  entry: { action: string; note: string; by: string },
) {
  try {
    const { data: claim } = await supabase
      .from('claims' as never)
      .select('id, row_data')
      .eq('id', claimId)
      .maybeSingle() as { data: { id: string; row_data: Record<string, unknown> } | null };
    if (!claim) return;

    const existing = (claim.row_data?.paintCalcHistory as unknown[]) || [];
    const updated = [
      ...existing,
      { ...entry, at: new Date().toISOString() },
    ];

    await supabase
      .from('claims' as never)
      .update({
        row_data: { ...claim.row_data, paintCalcHistory: updated },
        updated_at: new Date().toISOString(),
      } as never)
      .eq('id', claimId);
  } catch (e) {
    console.error('appendToClaimHistory error', e);
  }
}
