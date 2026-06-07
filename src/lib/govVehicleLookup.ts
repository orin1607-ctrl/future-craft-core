/** נתוני רכב גולמיים ממאגר משרד התחבורה (data.gov.il) — דרך edge function `vehicle-lookup` */
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

/** אותו חיבור שב-Vehicles.tsx / VehicleLookup — Supabase function `vehicle-lookup` */
export async function fetchVehicleFromGov(licensePlate: string): Promise<GovVehicleData | null> {
  const cleanPlate = licensePlate.replace(/[-\s]/g, '');
  if (!cleanPlate || cleanPlate.length < 5) {
    throw new GovVehicleLookupError('יש להזין מספר רכב תקין (לפחות 5 ספרות)', 400);
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(
    `${supabaseUrl}/functions/v1/vehicle-lookup?plate=${encodeURIComponent(cleanPlate)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
    },
  );

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    raw?: GovVehicleData;
  };

  if (!res.ok) {
    throw new GovVehicleLookupError(
      json.error || 'שגיאה בחיבור למשרד התחבורה',
      res.status,
    );
  }

  if (json.raw) {
    return json.raw;
  }
  return null;
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
  };

  return Object.fromEntries(Object.entries(mapped).filter(([, v]) => v !== ''));
}
