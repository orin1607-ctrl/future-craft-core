import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import { loadFleetOSTracking, type FleetOSVehicleRow } from './fleetosData';
import type {
  FleetOSFuelAnomaly,
  FleetOSFuelKpis,
  FleetOSChargeRow,
  FleetOSFuelRow,
} from './fleetosFuelTypes';

const CHARGE_CATEGORIES = ['טעינה', 'חשמל', 'טעינה חשמלית', 'charging'];
const FUEL_CATEGORIES = ['דלק'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function isoFromExpense(date: string | null, created_at: string | null): string {
  return date || created_at || new Date().toISOString();
}

function fuelStatus(amount: number, hasInvoice: boolean, avg: number): FleetOSFuelRow['status'] {
  if (!hasInvoice) return 'no_invoice';
  if (avg > 0 && amount > avg * 1.5) return 'anomaly';
  return 'ok';
}

function expenseToFuelRow(
  e: Record<string, unknown>,
  vehicleMap: Map<string, FleetOSVehicleRow>,
  avgAmount: number,
): FleetOSFuelRow {
  const plate = String(e.vehicle_plate || '');
  const v = [...vehicleMap.values()].find((x) => x.plate === plate || plate.includes(x.plate));
  const amount = Number(e.amount) || 0;
  const hasInvoice = Boolean(e.image_url);
  const iso = isoFromExpense(e.date as string | null, e.created_at as string | null);
  const litersGuess = amount > 0 ? Math.round(amount / 5.5) : null;
  return {
    id: String(e.id),
    date: iso,
    time: formatTime(e.created_at as string | null),
    plate: plate || '—',
    internal: v?.internal_number || '—',
    driver: String(e.driver_name || v?.driver_name || '—'),
    company: String(e.company_name || v?.company_name || '—'),
    customer: String(e.company_name || v?.company_name || '—'),
    location: v?.location || '—',
    station: String(e.vendor || '—'),
    station_address: '—',
    liters: litersGuess,
    price_per_liter: litersGuess ? Math.round((amount / litersGuess) * 100) / 100 : null,
    total: amount,
    odometer: e.odometer != null ? Number(e.odometer) : v?.odometer ?? null,
    duration: '—',
    has_invoice: hasInvoice,
    invoice_url: (e.image_url as string) || null,
    status: fuelStatus(amount, hasInvoice, avgAmount),
    notes: String(e.notes || ''),
    vehicle_id: v?.id,
  };
}

function expenseToChargeRow(
  e: Record<string, unknown>,
  vehicleMap: Map<string, FleetOSVehicleRow>,
): FleetOSChargeRow {
  const plate = String(e.vehicle_plate || '');
  const v = [...vehicleMap.values()].find((x) => x.plate === plate);
  const amount = Number(e.amount) || 0;
  const iso = isoFromExpense(e.date as string | null, e.created_at as string | null);
  return {
    id: String(e.id),
    date: iso,
    time: formatTime(e.created_at as string | null),
    plate,
    internal: v?.internal_number || '—',
    driver: String(e.driver_name || v?.driver_name || '—'),
    company: String(e.company_name || v?.company_name || '—'),
    customer: String(e.company_name || v?.company_name || '—'),
    location: v?.location || '—',
    station: String(e.vendor || '—'),
    station_address: '—',
    kwh: null,
    price_per_kwh: null,
    total: amount,
    bat_before: null,
    bat_after: null,
    duration: '—',
    has_invoice: Boolean(e.image_url),
    invoice_url: (e.image_url as string) || null,
    status: amount > 80 ? 'anomaly' : 'ok',
    notes: String(e.notes || ''),
    vehicle_id: v?.id,
  };
}

export function buildAnomaliesFromFuel(fuel: FleetOSFuelRow[]): FleetOSFuelAnomaly[] {
  const anomalies: FleetOSFuelAnomaly[] = [];
  const avg =
    fuel.length > 0 ? fuel.reduce((s, r) => s + r.total, 0) / fuel.length : 0;

  for (const row of fuel) {
    if (row.status === 'no_invoice') {
      anomalies.push({
        id: `ni-${row.id}`,
        type: 'תדלוק ללא חשבונית',
        plate: row.plate,
        internal: row.internal,
        driver: row.driver,
        company: row.company,
        customer: row.customer,
        date: formatDate(row.date),
        time: row.time,
        location: row.location,
        amount: row.total,
        severity: 'warning',
        ai_note: 'לא הועלתה קבלה. נדרש אישור מנהל.',
        handled: false,
      });
    }
    if (row.status === 'anomaly' && avg > 0) {
      anomalies.push({
        id: `an-${row.id}`,
        type: 'צריכת דלק חריגה',
        plate: row.plate,
        internal: row.internal,
        driver: row.driver,
        company: row.company,
        customer: row.customer,
        date: formatDate(row.date),
        time: row.time,
        location: row.location,
        amount: row.total,
        severity: 'warning',
        ai_note: `סכום ₪${row.total} — גבוה מהממוצע ₪${Math.round(avg)}.`,
        handled: false,
      });
    }
    if (row.liters != null && row.liters > 80) {
      anomalies.push({
        id: `vol-${row.id}`,
        type: 'חשד לגניבת דלק',
        plate: row.plate,
        internal: row.internal,
        driver: row.driver,
        company: row.company,
        customer: row.customer,
        date: formatDate(row.date),
        time: row.time,
        location: row.location,
        amount: row.total,
        severity: 'critical',
        ai_note: `תדלוק ${row.liters}ל׳ — מעל נפח מיכל סטנדרטי.`,
        handled: false,
      });
    }
  }
  return anomalies;
}

export function computeFuelKpis(
  fuel: FleetOSFuelRow[],
  charges: FleetOSChargeRow[],
  anomalies: FleetOSFuelAnomaly[],
): FleetOSFuelKpis {
  const fuelCost = fuel.reduce((s, r) => s + r.total, 0);
  const chargeCost = charges.reduce((s, r) => s + r.total, 0);
  const liters = fuel.reduce((s, r) => s + (r.liters || 0), 0);
  const withKm = fuel.filter((r) => r.odometer != null);
  let avgConsumption = '—';
  if (withKm.length >= 2) {
    const sorted = [...withKm].sort((a, b) => (a.odometer || 0) - (b.odometer || 0));
    const km = (sorted[sorted.length - 1].odometer || 0) - (sorted[0].odometer || 0);
    if (km > 0 && liters > 0) avgConsumption = (km / liters).toFixed(1);
  }
  return {
    fuel_cost: fuelCost,
    charge_cost: chargeCost,
    open_anomalies: anomalies.filter((a) => !a.handled).length,
    total_liters: liters,
    avg_consumption: avgConsumption,
    missing_invoices: fuel.filter((r) => !r.has_invoice).length,
    fuel_count: fuel.length,
    charge_count: charges.length,
  };
}

export async function loadFleetOSFuelData(companyFilter: string | null): Promise<{
  fuel: FleetOSFuelRow[];
  charges: FleetOSChargeRow[];
  vehicles: FleetOSVehicleRow[];
  companies: string[];
}> {
  const { vehicles } = await loadFleetOSTracking(companyFilter);
  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  const { data: expenses } = await applyCompanyScope(
    supabase.from('expenses').select('*').order('created_at', { ascending: false }).limit(500),
    companyFilter,
  );

  const rows = expenses || [];
  const fuelExpenses = rows.filter((e) =>
    FUEL_CATEGORIES.some((c) => (e.category || '').includes(c)),
  );
  const chargeExpenses = rows.filter((e) =>
    CHARGE_CATEGORIES.some((c) => (e.category || '').toLowerCase().includes(c.toLowerCase())),
  );

  const avgAmount =
    fuelExpenses.length > 0
      ? fuelExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0) / fuelExpenses.length
      : 0;

  const fuel = fuelExpenses.map((e) => expenseToFuelRow(e, vehicleMap, avgAmount));
  const charges = chargeExpenses.map((e) => expenseToChargeRow(e, vehicleMap));

  const companies = [...new Set(vehicles.map((v) => v.company_name).filter(Boolean) as string[])].sort();

  return { fuel, charges, vehicles, companies };
}
