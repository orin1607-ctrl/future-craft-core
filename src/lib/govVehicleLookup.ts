/** נתוני רכב גולמיים ממאגר משרד התחבורה (data.gov.il) — דרך edge function `vehicle-lookup` ומאגרי מידע פתוחים */
export interface GovVehicleData {
  mispar_rechev: number;
  tozeret_nm: string;
  degem_nm: string;
  kinuy_mishari: string;
  shnat_yitzur: number;
  tzeva_rechev: string;
  sug_delek_nm: string;
  misgeret: string;
  baalut: string;
  tokef_dt: string;
  mivchan_acharon_dt: string;
  zmig_kidmi: string;
  zmig_ahori: string;
  ramat_gimur: string;
  degem_manoa: string;
  moed_aliya_lakvish: string;
  /** שדות נוספים שעשויים להופיע ב-raw */
  sug_rechev?: string | number;
  sug_rechev_nm?: string;
  /** נסועה וקילומטראז' ממאגר היסטוריית כלי רכב פרטיים (1) — 56063a99-8a3e-4ff4-912e-5966c0279bad */
  kilometer_test_aharon?: number | string;
  test_mileage?: number | string;
  test_date?: string;
  test_source?: string;
  [key: string]: unknown;
}

/**
 * מיפוי: שדה במאגר משרד התחבורה → name בטופס החדש (VehicleNewFormDalia)
 * מקביל ל-applyGovData ב-Vehicles.tsx (מסך ישן)
 */
export const GOV_TO_NEW_FORM_FIELD_MAP: Record<string, string> = {
  mispar_rechev: 'vehicle_plate',
  tozeret_nm: 'manufacturer',
  kinuy_mishari: 'model',
  degem_nm: 'model',
  shnat_yitzur: 'year',
  tzeva_rechev: 'vehicle_color',
  sug_delek_nm: 'fuel_type',
  misgeret: 'vin',
  degem_manoa: 'engine_number',
  baalut: 'ownership_type_text',
  ramat_gimur: 'vehicle_segment',
  moed_aliya_lakvish: 'road_date',
  mivchan_acharon_dt: 'last_test',
  tokef_dt: 'next_test',
  sug_rechev_nm: 'vehicle_type',
  kilometer_test_aharon: 'test_mileage',
  test_mileage: 'test_mileage',
  test_date: 'test_date',
  test_source: 'test_source',
};

export class GovVehicleLookupError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GovVehicleLookupError';
  }
}

/**
 * שליפת היסטוריית נסועה וקילומטראז' בטסט האחרון ממאגר משרד התחבורה:
 * "היסטוריית כלי רכב פרטיים (1) — מידע מפורט על הרכב" (resource: 56063a99-8a3e-4ff4-912e-5966c0279bad)
 */
export async function fetchMileageHistoryFromGov(cleanPlate: string): Promise<{
  kilometer_test_aharon?: number | string;
  test_mileage?: number | string;
  test_source?: string;
} | null> {
  try {
    const plateNum = parseInt(cleanPlate, 10);
    const filterBody = {
      resource_id: '56063a99-8a3e-4ff4-912e-5966c0279bad',
      filters: { mispar_rechev: isNaN(plateNum) ? cleanPlate : plateNum },
      limit: 1,
    };
    const res = await fetch('https://data.gov.il/api/3/action/datastore_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filterBody),
    });
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      result?: { records?: Array<{ kilometer_test_aharon?: number | string }> };
    };
    if (json.success && json.result?.records && json.result.records.length > 0) {
      const rec = json.result.records[0];
      if (rec.kilometer_test_aharon != null && rec.kilometer_test_aharon !== '') {
        return {
          kilometer_test_aharon: rec.kilometer_test_aharon,
          test_mileage: rec.kilometer_test_aharon,
          test_source: 'משרד התחבורה — היסטוריית כלי רכב פרטיים (1)',
        };
      }
    }
  } catch {
    // mileage query error
  }
  return null;
}

/** שאילתה ישירה למאגרי data.gov.il (מפרט רכב + היסטוריית נסועה במקביל) */
async function fetchDirectFromDataGov(cleanPlate: string): Promise<GovVehicleData | null> {
  try {
    const plateNum = parseInt(cleanPlate, 10);
    const filterPlate = isNaN(plateNum) ? cleanPlate : plateNum;

    // 1. מאגר ראשי — מפרט רכב פעיל
    const pMain = fetch('https://data.gov.il/api/3/action/datastore_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource_id: '053cea08-09bc-40ec-8f7a-156f0677aff3',
        filters: { mispar_rechev: filterPlate },
        limit: 1,
      }),
    }).then((r) => r.json().catch(() => ({})));

    // 2. מאגר היסטוריית כלי רכב פרטיים (1) — נסועה וקילומטראז' בטסט האחרון
    const pMileage = fetch('https://data.gov.il/api/3/action/datastore_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resource_id: '56063a99-8a3e-4ff4-912e-5966c0279bad',
        filters: { mispar_rechev: filterPlate },
        limit: 1,
      }),
    }).then((r) => r.json().catch(() => ({})));

    const [mainJson, mileageJson] = await Promise.all([pMain, pMileage]);

    if (mainJson?.success && mainJson?.result?.records && mainJson.result.records.length > 0) {
      const record = mainJson.result.records[0] as GovVehicleData;

      if (mileageJson?.success && mileageJson?.result?.records && mileageJson.result.records.length > 0) {
        const mRec = mileageJson.result.records[0];
        if (mRec.kilometer_test_aharon != null && mRec.kilometer_test_aharon !== '') {
          record.kilometer_test_aharon = mRec.kilometer_test_aharon;
          record.test_mileage = mRec.kilometer_test_aharon;
          record.test_source = 'משרד התחבורה — היסטוריית כלי רכב פרטיים (1)';
        }
      }

      if (record.mivchan_acharon_dt) {
        record.test_date = formatGovDateForInput(record.mivchan_acharon_dt);
      }

      return record;
    }
  } catch {
    // direct fallback failed
  }
  return null;
}

/** שליפת פרטי רכב והיסטוריית נסועה ממשרד התחבורה — עם תמיכה מלאה ב-Edge Function וב-data.gov.il ישיר */
export async function fetchVehicleFromGov(licensePlate: string): Promise<GovVehicleData | null> {
  const cleanPlate = licensePlate.replace(/[-\s]/g, '');
  if (!cleanPlate || cleanPlate.length < 5) {
    throw new GovVehicleLookupError('יש להזין מספר רכב תקין (לפחות 5 ספרות)', 400);
  }

  const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || '';
  const anonKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || '';

  let token = anonKey;
  if (typeof window !== 'undefined' && anonKey) {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        token = data.session.access_token;
      }
    } catch {
      // use anonKey
    }
  }

  try {
    if (supabaseUrl && anonKey) {
      const res = await fetch(
        `${supabaseUrl}/functions/v1/vehicle-lookup?plate=${encodeURIComponent(cleanPlate)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
          },
        },
      );

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        raw?: GovVehicleData;
        data?: Record<string, unknown>;
      };

      if (res.ok && json.raw) {
        const enriched = { ...json.raw };
        // אם ה-edge function לא מכיל נתוני קילומטראז', נשלוף ממאגר היסטוריית הרכב (1)
        if (enriched.kilometer_test_aharon == null) {
          const m = await fetchMileageHistoryFromGov(cleanPlate);
          if (m?.kilometer_test_aharon != null) {
            enriched.kilometer_test_aharon = m.kilometer_test_aharon;
            enriched.test_mileage = m.kilometer_test_aharon;
            enriched.test_source = m.test_source;
          }
        }
        if (enriched.mivchan_acharon_dt && !enriched.test_date) {
          enriched.test_date = formatGovDateForInput(enriched.mivchan_acharon_dt);
        }
        return enriched;
      }
    }

    // fallback ישיר ל-data.gov.il
    const directRecord = await fetchDirectFromDataGov(cleanPlate);
    if (directRecord) {
      return directRecord;
    }

    throw new GovVehicleLookupError('הרכב לא נמצא במאגר משרד התחבורה', 404);
  } catch (err) {
    const directRecord = await fetchDirectFromDataGov(cleanPlate);
    if (directRecord) {
      return directRecord;
    }
    if (err instanceof GovVehicleLookupError) throw err;
    throw new GovVehicleLookupError('שגיאה בחיבור למשרד התחבורה');
  }
}

/** תאריך לשדה `<input type="date">` */
export function formatGovDateForInput(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  try {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value).trim();
    return d.toISOString().split('T')[0];
  } catch {
    return String(value).trim();
  }
}

/** מיפוי לשדות טופס פתיחת רכב חדש — כמו applyGovData + שדות נוספים בטופס החדש */
export function mapGovDataToNewFormFields(
  licensePlate: string,
  data: GovVehicleData,
): Record<string, string> {
  const cleanPlate = licensePlate.replace(/[-\s]/g, '') || String(data.mispar_rechev ?? '').trim();
  const kinuy = data.kinuy_mishari?.toString().trim() || '';
  const degem = data.degem_nm?.toString().trim() || '';
  const model = kinuy || degem;
  const vehicleType = data.sug_rechev_nm?.toString().trim() || '';

  const mapped: Record<string, string> = {
    plate: cleanPlate,
    license_plate: cleanPlate,
    vehicle_plate: cleanPlate,
    manufacturer: data.tozeret_nm?.toString().trim() || '',
    model,
    vehicle_nickname: kinuy,
    year: data.shnat_yitzur ? String(data.shnat_yitzur) : '',
    vehicle_type: vehicleType,
    vehicle_color: data.tzeva_rechev?.toString().trim() || '',
    fuel_type: data.sug_delek_nm?.toString().trim() || '',
    vin: data.misgeret?.toString().trim() || '',
    engine_number: data.degem_manoa?.toString().trim() || '',
    ownership_type_text: data.baalut?.toString().trim() || '',
    vehicle_segment: data.ramat_gimur?.toString().trim() || '',
    road_date: formatGovDateForInput(data.moed_aliya_lakvish),
    last_test: formatGovDateForInput(data.mivchan_acharon_dt),
    next_test: formatGovDateForInput(data.tokef_dt),
    inspection_date: formatGovDateForInput(data.mivchan_acharon_dt),
    test_mileage: data.kilometer_test_aharon != null ? String(data.kilometer_test_aharon).trim() : '',
    test_date: formatGovDateForInput(data.mivchan_acharon_dt || data.test_date),
    test_source: (data.test_source as string) || (data.kilometer_test_aharon ? 'משרד התחבורה — היסטוריית כלי רכב פרטיים (1)' : ''),
  };

  return Object.fromEntries(Object.entries(mapped).filter(([, v]) => v !== ''));
}
