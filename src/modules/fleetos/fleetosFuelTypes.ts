export type FuelRowStatus = 'ok' | 'anomaly' | 'no_invoice';
export type ChargeRowStatus = 'ok' | 'anomaly' | 'unauthorized';
export type EnergyType = 'fuel' | 'electric' | 'hybrid' | 'all';
export type AnomalySeverity = 'critical' | 'warning';

export interface FleetOSFuelFilters {
  company: string;
  customer: string;
  plate: string;
  internal: string;
  driver: string;
  make: string;
  model: string;
  status: string;
  energy_type: EnergyType;
  date_from: string;
  date_to: string;
  month: string;
  year: string;
  time_from: string;
  time_to: string;
  location: string;
  station: string;
}

export const EMPTY_FUEL_FILTERS: FleetOSFuelFilters = {
  company: '',
  customer: '',
  plate: '',
  internal: '',
  driver: '',
  make: '',
  model: '',
  status: '',
  energy_type: 'all',
  date_from: '',
  date_to: '',
  month: '',
  year: '',
  time_from: '',
  time_to: '',
  location: '',
  station: '',
};

export interface FleetOSFuelRow {
  id: string;
  date: string;
  time: string;
  plate: string;
  internal: string;
  driver: string;
  company: string;
  customer: string;
  location: string;
  station: string;
  station_address: string;
  liters: number | null;
  price_per_liter: number | null;
  total: number;
  odometer: number | null;
  duration: string;
  has_invoice: boolean;
  invoice_url: string | null;
  status: FuelRowStatus;
  notes: string;
  vehicle_id?: string;
}

export interface FleetOSChargeRow {
  id: string;
  date: string;
  time: string;
  plate: string;
  internal: string;
  driver: string;
  company: string;
  customer: string;
  location: string;
  station: string;
  station_address: string;
  kwh: number | null;
  price_per_kwh: number | null;
  total: number;
  bat_before: number | null;
  bat_after: number | null;
  duration: string;
  has_invoice: boolean;
  invoice_url: string | null;
  status: ChargeRowStatus;
  notes: string;
  vehicle_id?: string;
}

export interface FleetOSFuelAnomaly {
  id: string;
  type: string;
  plate: string;
  internal: string;
  driver: string;
  company: string;
  customer: string;
  date: string;
  time: string;
  location: string;
  amount: number;
  severity: AnomalySeverity;
  ai_note: string;
  handled: boolean;
}

export interface FleetOSFuelKpis {
  fuel_cost: number;
  charge_cost: number;
  open_anomalies: number;
  total_liters: number;
  avg_consumption: string;
  missing_invoices: number;
  fuel_count: number;
  charge_count: number;
}
