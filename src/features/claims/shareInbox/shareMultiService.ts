/**
 * Multi-module target search, matching, and saving for "Share to Dalia".
 * Supports:
 * 1. ניהול תביעות (Claims)
 * 2. ניהול מוסך (Garage)
 * 3. ניהול רכבים — דליה (Vehicles)
 *
 * All operations respect existing permissions, RLS, and company boundaries.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ClaimRecord } from '@/features/claims/claimsConstants';
import { claimMatchesSearch } from '@/features/claims/claimSearch';
import { listCases, type GarageCase } from '@/modules/garage-management/garageBook';
import { uploadGarageMedia } from '@/modules/garage-management/garageMedia';
import { uploadDocument } from '@/lib/uploadDocument';
import { shareNote } from './shareMatch';

export type ShareModule = 'claims' | 'garage' | 'vehicles';

export interface VehicleTarget {
  id: string;
  license_plate: string;
  manufacturer?: string;
  model?: string;
  company_name?: string;
  customer_name?: string;
  status?: string;
}

export interface ShareTarget {
  id: string;
  module: ShareModule;
  title: string;       // e.g. "תביעה DAL-2026-0275" | "כרטיס מוסך GC-1002" | "רכב 73-479-02"
  subtitle: string;    // e.g. "רכב 73-479-02 · רוני אטיאס" | "הונדה סיוויק · אורן קאר"
  extra?: string;      // Status / details
  plate?: string;
  raw: any;
}

/** Extracts an Israeli vehicle plate from text or filename (7 or 8 digits). */
export function extractPlate(text: string): string | null {
  if (!text) return null;
  // Ignore dates like 20261028 or 2026-10-28
  const cleaned = text.replace(/202[0-9][- /.]?[0-9]{2}[- /.]?[0-9]{2}/g, ' ').replace(/202[0-9]{5}/g, ' ');

  // 1. Formatted 7-digit: 12-345-67 or 12 345 67
  const m7 = cleaned.match(/(?:^|[^\d])(\d{2})[- ]?(\d{3})[- ]?(\d{2})(?:[^\d]|$)/);
  if (m7) {
    return `${m7[1]}-${m7[2]}-${m7[3]}`;
  }

  // 2. Formatted 8-digit: 123-45-678 or 123 45 678
  const m8 = cleaned.match(/(?:^|[^\d])(\d{3})[- ]?(\d{2})[- ]?(\d{3})(?:[^\d]|$)/);
  if (m8) {
    return `${m8[1]}-${m8[2]}-${m8[3]}`;
  }

  // 3. Raw 7 or 8 digits
  const mRaw = cleaned.match(/(?:^|[^\d])(\d{7,8})(?:[^\d]|$)/);
  if (mRaw) {
    const d = mRaw[1];
    return d.length === 7
      ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
      : `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  }

  return null;
}

/** Extracts claim number or case number like DAL-2026-0275 or GC-123. */
export function extractCaseNumber(text: string): string | null {
  if (!text) return null;
  const claimMatch = text.match(/\b(DAL-\d{4}-\d{3,5})\b/i);
  if (claimMatch) return claimMatch[1].toUpperCase();
  const gcMatch = text.match(/\b(GC-\d{3,6})\b/i);
  if (gcMatch) return gcMatch[1].toUpperCase();
  return null;
}

/** Suggests a clean Hebrew document name based on file name or type. */
export function suggestDocumentName(fileName: string, mimeType?: string, index?: number): string {
  const nameLower = (fileName || '').toLowerCase();
  let baseName = '';
  
  if (nameLower.includes('levi') || nameLower.includes('יצחק') || nameLower.includes('מחירון')) {
    baseName = 'מחירון לוי יצחק';
  } else if (nameLower.includes('license') || nameLower.includes('רישיון') || nameLower.includes('רשיון')) {
    baseName = 'צילום רישיון רכב';
  } else if (nameLower.includes('damage') || nameLower.includes('נזק') || nameLower.includes('פגוש') || nameLower.includes('תאונה')) {
    baseName = 'תמונת נזק';
  } else if (nameLower.includes('car-part') || nameLower.includes('carpart') || nameLower.includes('מכרז')) {
    baseName = 'הצעת מחיר Car-Part';
  } else if (nameLower.includes('quote') || nameLower.includes('הצעה')) {
    baseName = 'הצעת מחיר';
  } else if (nameLower.includes('invoice') || nameLower.includes('חשבונית') || nameLower.includes('קבלה')) {
    baseName = 'חשבונית תיקון';
  } else if (nameLower.includes('appraisal') || nameLower.includes('שמאי') || nameLower.includes('דוח')) {
    baseName = 'דוח שמאי';
  } else if (nameLower.includes('order') || nameLower.includes('הזמנה') || nameLower.includes('עבודה')) {
    baseName = 'הזמנת עבודה';
  } else if (mimeType?.includes('pdf') || /\.pdf$/i.test(fileName)) {
    baseName = 'מסמך';
  } else if (mimeType?.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(fileName)) {
    baseName = 'תמונה';
  } else {
    // Strip file extension
    baseName = fileName.replace(/\.[^/.]+$/, '').trim() || 'מסמך';
  }

  if (typeof index === 'number' && index > 0) {
    return `${baseName} ${index}`;
  }
  return baseName;
}

/** Searches Claims records by query. */
export function searchClaimsTargets(claims: ClaimRecord[], query: string): ShareTarget[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? claims.filter((c) => claimMatchesSearch(c, q))
    : claims;
    
  return filtered.slice(0, 10).map((c) => ({
    id: c.id,
    module: 'claims',
    title: `תביעה ${c.claimNum || c.id}`,
    subtitle: [c.plate ? `רכב ${c.plate}` : null, c.clientName ? `לקוח: ${c.clientName}` : null].filter(Boolean).join(' · ') || 'ללא פרטים נוספים',
    extra: [c.insCompany, c.status].filter(Boolean).join(' · ') || undefined,
    plate: c.plate,
    raw: c,
  }));
}

/** Searches Garage cases by query. */
export function searchGarageTargets(cases: GarageCase[], query: string): ShareTarget[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? cases.filter((c) => {
        const num = String(c.case_number || '').toLowerCase();
        const plate = String(c.vehicle_plate_snapshot || '').toLowerCase();
        const cust = String(c.customer_name_snapshot || '').toLowerCase();
        return num.includes(q) || plate.includes(q) || cust.includes(q);
      })
    : cases;

  return filtered.slice(0, 10).map((c) => ({
    id: c.id,
    module: 'garage',
    title: `כרטיס מוסך ${c.case_number || c.id.slice(0, 8)}`,
    subtitle: [c.vehicle_plate_snapshot ? `רכב ${c.vehicle_plate_snapshot}` : null, c.customer_name_snapshot ? `לקוח: ${c.customer_name_snapshot}` : null].filter(Boolean).join(' · ') || 'ללא פרטים נוספים',
    extra: [c.status, c.shop_company_name].filter(Boolean).join(' · ') || undefined,
    plate: c.vehicle_plate_snapshot,
    raw: c,
  }));
}

/** Searches Vehicles by query. */
export function searchVehicleTargets(vehicles: VehicleTarget[], query: string): ShareTarget[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? vehicles.filter((v) => {
        const plate = String(v.license_plate || '').toLowerCase();
        const model = String(v.model || '').toLowerCase();
        const mfg = String(v.manufacturer || '').toLowerCase();
        const comp = String(v.company_name || '').toLowerCase();
        const cust = String(v.customer_name || '').toLowerCase();
        return plate.includes(q) || model.includes(q) || mfg.includes(q) || comp.includes(q) || cust.includes(q);
      })
    : vehicles;

  return filtered.slice(0, 10).map((v) => ({
    id: v.id,
    module: 'vehicles',
    title: `רכב ${v.license_plate}`,
    subtitle: [v.manufacturer, v.model, v.customer_name || v.company_name].filter(Boolean).join(' · ') || 'כרטיס רכב',
    extra: v.status || undefined,
    plate: v.license_plate,
    raw: v,
  }));
}

/** Loads vehicles from Supabase, respecting permissions and RLS. */
export async function loadUserVehicles(): Promise<VehicleTarget[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, license_plate, manufacturer, model, company_name, customer_name, status')
    .order('created_at', { ascending: false })
    .limit(50);
    
  if (error) {
    console.warn('[Share] loadUserVehicles query failed or restricted by RLS:', error.message);
    return [];
  }
  return (data || []) as VehicleTarget[];
}

/** Loads garage cases from Supabase, respecting permissions and RLS. */
export async function loadUserGarageCases(): Promise<GarageCase[]> {
  try {
    return await listCases();
  } catch (err: any) {
    console.warn('[Share] listCases restricted or failed:', err?.message);
    return [];
  }
}

export interface SaveResult {
  success: boolean;
  reused?: boolean;
  error?: string;
  targetUrl?: string;
  targetLabel?: string;
}

/**
 * Saves a single file to the chosen target module.
 */
export async function saveSharedFileToTarget(params: {
  target: ShareTarget;
  file: { name: string; type: string; size: number; blob: Blob };
  customName: string;
  auto: boolean;
  reason: string;
  claimsApi: any;
  userId?: string;
  targetSubType?: string;
}): Promise<SaveResult> {
  const { target, file, customName, auto, reason, claimsApi, userId, targetSubType } = params;
  const displayName = customName.trim() || file.name;
  const isLeviYitzhak = targetSubType === 'levi_itzhak' || displayName.includes('מחירון לוי יצחק');
  const ext = file.name.split('.').pop()?.toLowerCase();
  const fullFileName = ext && !displayName.toLowerCase().endsWith(`.${ext}`) ? `${displayName}.${ext}` : displayName;

  if (target.module === 'claims') {
    const uploadFile = new File([file.blob], fullFileName, { type: file.type || file.blob.type });
    const r = await claimsApi.staffUpload(target.id, '', uploadFile);
    if (!r.success) {
      return {
        success: false,
        error: r.error === 'forbidden' ? 'אין הרשאה לשמור בתביעה זו' : String(r.error || 'שגיאה בשמירה לתביעה'),
      };
    }
    if (r.reused) {
      return { success: true, reused: true, targetLabel: target.title, targetUrl: `/claims?claimId=${encodeURIComponent(target.id)}` };
    }
    await claimsApi.invokeDocs('update_doc_meta', {
      claim_id: target.id,
      file_id: r.file_id,
      staff_note: shareNote(auto, isLeviYitzhak ? 'מחירון לוי יצחק' : (reason || displayName)),
      doc_category: isLeviYitzhak ? 'levi_itzhak' : undefined,
    });
    if (isLeviYitzhak) {
      try {
        const rawClaim = target.raw || {};
        await claimsApi.saveClaim({
          ...rawClaim,
          id: target.id,
          leviYitzhakDocId: r.file_id,
          leviYitzhakFileName: fullFileName,
          valuationSource: rawClaim.valuationSource || 'מחירון לוי יצחק',
        });
      } catch (e) {
        console.warn('[Share] could not link leviYitzhakDocId directly:', e);
      }
    }
    await claimsApi.logHistory(
      target.id,
      isLeviYitzhak ? 'מחירון לוי יצחק נקלט בשיתוף לדליה' : 'מסמך נקלט בשיתוף לדליה',
      `${displayName}${auto ? ` · ${reason}` : ''}`,
      'docs'
    );
    return {
      success: true,
      targetLabel: target.title,
      targetUrl: `/claims?claimId=${encodeURIComponent(target.id)}`,
    };
  }

  if (target.module === 'garage') {
    try {
      const bytes = await file.blob.arrayBuffer();
      await uploadGarageMedia({
        garageCaseId: target.id,
        category: 'other',
        title: displayName,
        fileName: fullFileName,
        mimeType: file.type || 'application/octet-stream',
        bytes,
        actorId: userId,
      });
      return {
        success: true,
        targetLabel: target.title,
        targetUrl: `/garage-management/${encodeURIComponent(target.id)}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'שגיאה בהעלאה לכרטיס מוסך',
      };
    }
  }

  if (target.module === 'vehicles') {
    try {
      const uploadFile = new File([file.blob], fullFileName, { type: file.type || file.blob.type });
      const rawV = target.raw || {};
      const res = await uploadDocument({
        file: uploadFile,
        storageFolder: 'vehicle-docs',
        category: 'vehicle_doc',
        companyName: rawV.company_name || '',
        vehiclePlate: target.plate || rawV.license_plate || '',
        displayName,
      });
      if (!res.ok) {
        return { success: false, error: res.error || 'שגיאה בהעלאה למסמכי הרכב' };
      }
      return {
        success: true,
        targetLabel: target.title,
        targetUrl: `/vehicles?plate=${encodeURIComponent(target.plate || rawV.license_plate || '')}`,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'שגיאה בשמירה לכרטיס רכב',
      };
    }
  }

  return { success: false, error: 'אזור לא מוכר' };
}
