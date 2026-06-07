import { useState, useEffect } from 'react';
import { Phone, Truck } from 'lucide-react';
import VehicleAccordionSection from '@/components/vehicles/VehicleAccordionSection';
import { supabase } from '@/integrations/supabase/client';
import { InfoField, DocLink, ExpiryRow } from '@/components/vehicles/vehicleUi';
import {
  daysUntil,
  expiryColor,
  managementTypeLabel,
  statusLabel,
  type InsuranceHistoryRow,
  type VehicleWithExtras,
} from '@/components/vehicles/vehicleHubUtils';

function AccordionSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <VehicleAccordionSection title={title} defaultOpen={defaultOpen}>
      {children}
    </VehicleAccordionSection>
  );
}

export default function VehicleDetailsPanel({
  vehicle: v,
  driverName,
  driverPhone,
  onEdit,
  isManager,
}: {
  vehicle: VehicleWithExtras;
  driverName: string;
  driverPhone?: string | null;
  onEdit: () => void;
  isManager: boolean;
}) {
  const [insuranceHistory, setInsuranceHistory] = useState<InsuranceHistoryRow[]>([]);
  const [extraEquipment, setExtraEquipment] = useState<string | null>(null);

  const showInsurance = v.management_type === 'financial_leasing' || v.management_type === 'self_maintained';
  const testDays = daysUntil(v.test_expiry);
  const insDays = daysUntil(v.insurance_expiry);
  const compDays = daysUntil(v.comprehensive_insurance_expiry);
  const svcDays = daysUntil(v.next_service_date);

  useEffect(() => {
    if (showInsurance) {
      supabase
        .from('vehicle_insurance_history')
        .select('*')
        .eq('vehicle_id', v.id)
        .order('year', { ascending: false })
        .then(({ data }) => {
          if (data) setInsuranceHistory(data as InsuranceHistoryRow[]);
        });
    }
  }, [v.id, showInsurance]);

  useEffect(() => {
    supabase
      .from('vehicle_exchanges')
      .select('extra_equipment')
      .eq('vehicle_plate', v.license_plate)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setExtraEquipment(data?.extra_equipment || null));
  }, [v.license_plate]);

  return (
    <div className="card-elevated overflow-hidden">
      <div className="p-3 border-b border-border bg-primary/5 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          כל השדות לפי <strong className="text-foreground">VehicleForm</strong> — ללא שינוי שמות או Supabase
        </p>
        {isManager && (
          <button
            type="button"
            onClick={onEdit}
            className="text-sm font-bold text-primary whitespace-nowrap px-3 py-1.5 rounded-lg bg-primary/10"
          >
            עריכה מלאה
          </button>
        )}
      </div>

      <AccordionSection title="1. פרטי הרכב" defaultOpen>
        <div className="grid grid-cols-2 gap-y-4 gap-x-3">
          <InfoField label="מספר רכב (רישוי)" value={v.license_plate} />
          <InfoField label="מספר פנימי" value={v.internal_number || '—'} />
          <InfoField label="יצרן" value={v.manufacturer || '—'} />
          <InfoField label="דגם" value={v.model || '—'} />
          <InfoField label="שנה" value={v.year?.toString() || '—'} />
          <InfoField label="סוג רכב" value={v.vehicle_type || '—'} />
          <InfoField label="סטטוס (status)" value={statusLabel(v.status).text} />
          <InfoField label='ק"מ נוכחי' value={(v.odometer || 0).toLocaleString()} />
          <InfoField label="נהג משויך" value={driverName} />
          <InfoField label="חברה" value={v.company_name || '—'} />
          <InfoField label="סטטוס אישור (approval_status)" value={v.approval_status || '—'} />
        </div>
        {driverPhone && (
          <a
            href={`tel:${driverPhone}`}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 text-primary font-medium text-sm"
          >
            <Phone size={16} /> {driverPhone}
          </a>
        )}
      </AccordionSection>

      <AccordionSection title="2. בעלות וסוג ניהול רכב">
        <InfoField label="סוג ניהול (management_type)" value={managementTypeLabel(v.management_type)} />
        {v.management_type === 'operational_leasing' && (
          <div className="mt-3 p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <p className="font-bold text-primary text-sm">ליסינג תפעולי</p>
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="עלות חודשית (monthly_leasing_cost)" value={v.monthly_leasing_cost ? `₪${v.monthly_leasing_cost.toLocaleString()}` : '—'} />
              <InfoField label="סיום ליסינג (leasing_end_date)" value={v.leasing_end_date ? new Date(v.leasing_end_date).toLocaleDateString('he-IL') : '—'} />
              <InfoField label="החזרת רכב (vehicle_return_date)" value={v.vehicle_return_date ? new Date(v.vehicle_return_date).toLocaleDateString('he-IL') : '—'} />
              <InfoField label="is_leasing" value={v.is_leasing ? 'כן' : 'לא'} />
            </div>
          </div>
        )}
        {v.management_type === 'financial_leasing' && (
          <div className="mt-3 p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <p className="font-bold text-primary text-sm">ליסינג מימוני</p>
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="החזר חודשי (monthly_loan_payment)" value={v.monthly_loan_payment ? `₪${v.monthly_loan_payment.toLocaleString()}` : '—'} />
              <InfoField label="סיום הלוואה (loan_end_date)" value={v.loan_end_date ? new Date(v.loan_end_date).toLocaleDateString('he-IL') : '—'} />
              <InfoField label="החלפה מתוכננת (planned_replacement_date)" value={v.planned_replacement_date ? new Date(v.planned_replacement_date).toLocaleDateString('he-IL') : '—'} />
            </div>
          </div>
        )}
        {v.management_type === 'self_maintained' && (
          <div className="mt-3 p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <p className="font-bold text-primary text-sm">תחזוקה עצמאית</p>
            <InfoField label="has_loan" value={v.has_loan ? 'כן' : 'לא'} />
            {v.has_loan && (
              <div className="grid grid-cols-2 gap-3">
                <InfoField label="החזר חודשי" value={v.monthly_loan_payment ? `₪${v.monthly_loan_payment.toLocaleString()}` : '—'} />
                <InfoField label="סיום הלוואה" value={v.loan_end_date ? new Date(v.loan_end_date).toLocaleDateString('he-IL') : '—'} />
              </div>
            )}
            <InfoField label="החלפה מתוכננת" value={v.planned_replacement_date ? new Date(v.planned_replacement_date).toLocaleDateString('he-IL') : '—'} />
          </div>
        )}
      </AccordionSection>

      <AccordionSection title="3. ביטוחים ורישיונות">
        <div className="space-y-2 mb-4">
          <ExpiryRow label="טסט (test_expiry)" date={v.test_expiry} daysLeft={testDays} colorCls={expiryColor(testDays)} />
          <ExpiryRow label="ביטוח חובה (insurance_expiry)" date={v.insurance_expiry} daysLeft={insDays} colorCls={expiryColor(insDays)} />
          <ExpiryRow label="ביטוח מקיף (comprehensive_insurance_expiry)" date={v.comprehensive_insurance_expiry} daysLeft={compDays} colorCls={expiryColor(compDays)} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <InfoField label="ביטוח חובה — התחלה (insurance_start)" value={v.insurance_start ? new Date(v.insurance_start).toLocaleDateString('he-IL') : '—'} />
          <InfoField label="ביטוח מקיף — התחלה (comprehensive_insurance_start)" value={v.comprehensive_insurance_start ? new Date(v.comprehensive_insurance_start).toLocaleDateString('he-IL') : '—'} />
          {v.insurance_cost != null && (
            <InfoField label="עלות ביטוח (insurance_cost)" value={`₪${v.insurance_cost.toLocaleString()}`} />
          )}
        </div>
        {showInsurance && (
          <div className="mt-4">
            <p className="font-bold mb-2 text-sm">היסטוריית ביטוחים (vehicle_insurance_history)</p>
            {insuranceHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין נתוני ביטוח</p>
            ) : (
              <div className="space-y-2">
                {insuranceHistory.map((row, i) => (
                  <div key={i} className="border border-border rounded-xl p-3 text-sm">
                    <p className="font-bold">שנת {row.year}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <InfoField label="חברת ביטוח (insurer_name)" value={row.insurer_name || '—'} />
                      <InfoField label="הדר תביעות (has_no_claims)" value={row.has_no_claims ? 'כן' : 'לא'} />
                      <InfoField label="עלות חובה (mandatory_insurance_cost)" value={row.mandatory_insurance_cost ? `₪${row.mandatory_insurance_cost.toLocaleString()}` : '—'} />
                      <InfoField label="עלות מקיף (comprehensive_insurance_cost)" value={row.comprehensive_insurance_cost ? `₪${row.comprehensive_insurance_cost.toLocaleString()}` : '—'} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </AccordionSection>

      <AccordionSection title="4. ציוד וכלים מיוחדים">
        <p className="text-sm text-muted-foreground mb-2">
          אין שדה ייעודי בטבלת vehicles. מוצג מ־vehicle_exchanges.extra_equipment (החלפה אחרונה) אם קיים.
        </p>
        <InfoField label="ציוד נוסף (extra_equipment)" value={extraEquipment || '—'} />
      </AccordionSection>

      <AccordionSection title="5. טיפולים ותחזוקה">
        <div className="grid grid-cols-2 gap-3">
          <InfoField label="טיפול אחרון (last_service_date)" value={v.last_service_date ? new Date(v.last_service_date).toLocaleDateString('he-IL') : '—'} />
          <InfoField label="טיפול הבא (next_service_date)" value={v.next_service_date ? new Date(v.next_service_date).toLocaleDateString('he-IL') : '—'} />
        </div>
      </AccordionSection>

      <AccordionSection title="מסמכים">
        <div className="space-y-2">
          {v.license_doc_url && <DocLink label="רישיון רכב (license_doc_url)" url={v.license_doc_url} />}
          {v.insurance_doc_url && <DocLink label="ביטוח חובה (insurance_doc_url)" url={v.insurance_doc_url} />}
          {v.comprehensive_insurance_doc_url && (
            <DocLink label="ביטוח מקיף (comprehensive_insurance_doc_url)" url={v.comprehensive_insurance_doc_url} />
          )}
          {!v.license_doc_url && !v.insurance_doc_url && !v.comprehensive_insurance_doc_url && (
            <p className="text-sm text-muted-foreground">אין מסמכים מצורפים</p>
          )}
        </div>
      </AccordionSection>

      <AccordionSection title="הערות · שינוע · פרטים משלימים">
        {v.needs_transport && (
          <div className="flex items-center gap-2 text-primary font-bold mb-3">
            <Truck size={18} /> נדרש שינוע (needs_transport)
          </div>
        )}
        <InfoField label="הערות (notes)" value={v.notes || 'אין הערות'} />
      </AccordionSection>
    </div>
  );
}
