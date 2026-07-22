import { supabase } from '@/integrations/supabase/client';
import { applyCompanyScope } from '@/hooks/useCompanyFilter';
import {
  isHistoryLogTask,
  isCustomGapTask,
  stripEventTitle,
  stripGapTitle,
} from '@/lib/vehicleEventLog';
import { handoverDateTime, isTowingServiceOrder } from '@/lib/vehicleActionFollowUp';
import type { RequiredFieldsOverrides } from '@/lib/requiredFieldsSchema';
import { isVehicleHubFieldRequired } from '@/lib/requiredFieldsCompany';

export type VehicleHistoryType =
  | 'fault'
  | 'accident'
  | 'handover'
  | 'service'
  | 'expense'
  | 'inspection'
  | 'defect'
  | 'exchange'
  | 'towing'
  | 'document'
  | 'note'
  | 'audit'
  | 'gap'
  | 'status'
  | 'management';

export interface VehicleHistoryEntry {
  id: string;
  type: VehicleHistoryType;
  date: string;
  title: string;
  description: string;
  status: string;
  userName: string;
  vehiclePlate: string;
  internalNumber: string;
  docUrl?: string;
  route: string;
}

export async function loadVehicleHistory(
  plate: string,
  internalNumber: string,
  companyFilter: string | null,
): Promise<VehicleHistoryEntry[]> {
  const entries: VehicleHistoryEntry[] = [];
  const byPlate = (table: string) =>
    applyCompanyScope(supabase.from(table).select('*').eq('vehicle_plate', plate), companyFilter);

  const [
    faultsRes,
    accidentsRes,
    handoversRes,
    servicesRes,
    expensesRes,
    inspectionsRes,
    tasksRes,
    exchangesRes,
    docsRes,
  ] = await Promise.all([
    byPlate('faults'),
    byPlate('accidents'),
    byPlate('vehicle_handovers'),
    byPlate('service_orders'),
    byPlate('expenses'),
    byPlate('vehicle_inspections'),
    byPlate('vehicle_tasks'),
    byPlate('vehicle_exchanges'),
    applyCompanyScope(
      supabase.from('document_metadata').select('*').eq('vehicle_plate', plate),
      companyFilter,
    ),
  ]);

  const push = (e: VehicleHistoryEntry) => entries.push(e);

  (faultsRes.data || []).forEach((f: Record<string, string>) =>
    push({
      id: f.id,
      type: 'fault',
      date: f.date || f.created_at,
      title: f.fault_type || 'תקלה',
      description: f.description || '',
      status: f.status || '',
      userName: f.driver_name || '',
      vehiclePlate: plate,
      internalNumber,
      route: '/faults',
    }),
  );

  (accidentsRes.data || []).forEach((a: Record<string, string>) =>
    push({
      id: a.id,
      type: 'accident',
      date: a.date || a.created_at,
      title: 'תאונה',
      description: a.description || '',
      status: a.status || '',
      userName: a.driver_name || '',
      vehiclePlate: plate,
      internalNumber,
      route: '/accidents',
    }),
  );

  (handoversRes.data || []).forEach((h: Record<string, string>) =>
    push({
      id: h.id,
      type: 'handover',
      date: handoverDateTime(h),
      title: h.action_type === 'return' ? 'החזרת רכב' : 'מסירת רכב',
      description: `${h.giving_driver_name || ''} → ${h.receiving_driver_name || ''}`,
      status: '',
      userName: h.giving_driver_name || '',
      vehiclePlate: plate,
      internalNumber,
      route: '/handover',
    }),
  );

  (servicesRes.data || []).forEach((s: Record<string, string>) => {
    const towing = isTowingServiceOrder(s);
    push({
      id: s.id,
      type: towing ? 'towing' : 'service',
      date: s.service_date || s.date_time || s.created_at,
      title: towing ? s.service_category || 'שינוע' : s.service_category || 'הזמנת שירות',
      description: s.description || '',
      status: s.treatment_status || '',
      userName: s.driver_name || s.ordering_user || '',
      vehiclePlate: plate,
      internalNumber,
      route: towing ? '/service-orders' : '/service-orders',
    });
  });

  (expensesRes.data || []).forEach((e: Record<string, string>) =>
    push({
      id: e.id,
      type: 'expense',
      date: e.date || e.created_at,
      title: e.category || 'הוצאה',
      description: `₪${e.amount || 0} - ${e.vendor || ''}`,
      status: '',
      userName: e.driver_name || '',
      vehiclePlate: plate,
      internalNumber,
      route: '/expenses',
    }),
  );

  (inspectionsRes.data || []).forEach((i: Record<string, string>) => {
    const typeLabel =
      i.inspection_type === 'semi_annual'
        ? 'בדיקה חצי שנתית'
        : i.inspection_type === 'tri_semi_annual'
          ? 'בדיקה תלת/חצי שנתית'
          : i.inspection_type === 'quarterly'
            ? 'רבעונית'
            : 'בדיקה';
    push({
      id: i.id,
      type: 'inspection',
      date: i.inspection_date || i.created_at,
      title: typeLabel,
      description: i.notes || '',
      status: i.overall_status || '',
      userName: i.inspector_name || '',
      vehiclePlate: plate,
      internalNumber,
      route: '/vehicle-inspections',
    });
  });

  (tasksRes.data || []).forEach((t: Record<string, string>) => {
    if (isHistoryLogTask(t)) {
      push({
        id: t.id,
        type: 'audit',
        date: t.created_at,
        title: stripEventTitle(t.title || 'פעולה'),
        description: t.description || '',
        status: t.status || '',
        userName: t.resolved_by_name || '',
        vehiclePlate: plate,
        internalNumber,
        route: '/vehicle-tasks',
      });
      return;
    }
    if (isCustomGapTask(t)) {
      push({
        id: t.id,
        type: 'gap',
        date: t.created_at,
        title: stripGapTitle(t.title || 'חוסר'),
        description: t.description || '',
        status: t.status || '',
        userName: t.resolved_by_name || '',
        vehiclePlate: plate,
        internalNumber,
        route: '/vehicle-tasks',
      });
      return;
    }
    push({
      id: t.id,
      type: 'defect',
      date: t.created_at,
      title: t.title || 'ליקוי',
      description: t.description || '',
      status: t.status || '',
      userName: t.resolved_by_name || '',
      vehiclePlate: plate,
      internalNumber,
      route: '/vehicle-tasks',
    });
  });

  (exchangesRes.data || []).forEach((x: Record<string, string>) =>
    push({
      id: x.id,
      type: 'exchange',
      date: x.created_at,
      title: 'החלפת רכב',
      description: x.exchange_number || '',
      status: x.status || '',
      userName: '',
      vehiclePlate: plate,
      internalNumber,
      route: '/vehicle-exchange',
    }),
  );

  (docsRes.data || []).forEach((d: Record<string, string>) => {
    const { data: pub } = supabase.storage.from('documents').getPublicUrl(d.file_path);
    push({
      id: d.id,
      type: 'document',
      date: d.created_at,
      title: d.original_name || 'מסמך',
      description: d.category || '',
      status: '',
      userName: '',
      vehiclePlate: plate,
      internalNumber,
      docUrl: pub.publicUrl,
      route: '/documents',
    });
  });

  entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return entries;
}

export function countMissingDocs(
  v: {
    license_doc_url?: string | null;
    insurance_doc_url?: string | null;
    comprehensive_insurance_doc_url?: string | null;
  },
  overrides: RequiredFieldsOverrides = {},
): number {
  let n = 0;
  if (isVehicleHubFieldRequired('license_doc_url', overrides) && !v.license_doc_url) n++;
  if (isVehicleHubFieldRequired('insurance_doc_url', overrides) && !v.insurance_doc_url) n++;
  if (
    isVehicleHubFieldRequired('comprehensive_insurance_doc_url', overrides) &&
    !v.comprehensive_insurance_doc_url
  ) {
    n++;
  }
  return n;
}
