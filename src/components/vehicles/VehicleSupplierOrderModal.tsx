import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import { logVehicleEvent } from '@/lib/vehicleEventLog';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { VehicleHubVehicle } from '@/components/vehicles/VehicleHub';

interface SupplierRow {
  id: string;
  name: string;
  phone: string | null;
  contact_person: string | null;
  address: string | null;
  supplier_type: string;
}

const ORDER_TYPES = [
  'הזמנה לספק חלקים',
  'הזמנה למוסך',
  'עבודת חוץ',
  'שירות חיצוני',
  'גרר',
  'רכב חלופי',
];

const inputClass =
  'w-full p-3 rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none text-base';

function genPO() {
  const d = new Date();
  const yr = String(d.getFullYear()).slice(2);
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rnd = String(Math.floor(Math.random() * 900) + 100);
  return `PO-${yr}${mo}${day}-${rnd}`;
}

export default function VehicleSupplierOrderModal({
  open,
  onOpenChange,
  vehicle,
  driverName,
  sourceType,
  sourceLabel,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: VehicleHubVehicle;
  driverName: string;
  sourceType?: string;
  sourceLabel?: string;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [step, setStep] = useState(1);
  const [orderType, setOrderType] = useState('');
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [supplierTab, setSupplierTab] = useState<'existing' | 'new'>('existing');
  const [selected, setSelected] = useState<SupplierRow | null>(null);
  const [orderNum, setOrderNum] = useState('');
  const [workDesc, setWorkDesc] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newAddr, setNewAddr] = useState('');
  const [newType, setNewType] = useState('מוסך');

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setOrderType('');
    setSelected(null);
    setWorkDesc('');
    setNotes('');
    setOrderNum('');
    applyCompanyScope(
      supabase.from('suppliers').select('id, name, phone, contact_person, address, supplier_type').order('name'),
      companyFilter,
    )
      .then(({ data }) => setSuppliers((data as SupplierRow[]) || []));
  }, [open, companyFilter]);

  const confirmSupplier = () => {
    if (supplierTab === 'new') {
      if (!newName.trim() || !newPhone.trim()) {
        toast.error('שם וטלפון הם שדות חובה');
        return;
      }
      setSelected({
        id: 'new',
        name: newName.trim(),
        phone: newPhone.trim(),
        contact_person: newContact.trim() || null,
        address: newAddr.trim() || null,
        supplier_type: newType,
      });
    } else if (!selected) {
      toast.error('נא לבחור ספק');
      return;
    }
    setOrderNum(genPO());
    setStep(3);
  };

  const save = async () => {
    if (!workDesc.trim() || !selected) {
      toast.error('נא למלא תיאור עבודה');
      return;
    }
    setLoading(true);
    const desc = [
      `[${orderNum}] ${orderType}`,
      workDesc,
      sourceLabel ? `מקושר: ${sourceType || ''} – ${sourceLabel}` : '',
      notes ? `הערות: ${notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const { error } = await supabase.from('service_orders').insert({
      service_category: orderType || 'הזמנה לספק',
      description: desc,
      vehicle_plate: vehicle.license_plate,
      driver_name: driverName,
      vendor_name: selected.name,
      vendor_phone: selected.phone,
      company_name: vehicle.company_name || user?.company_name || '',
      treatment_status: 'pending_approval',
      notes: orderNum,
      created_by: user?.id,
      ordering_user: user?.full_name || '',
    });

    setLoading(false);
    if (error) {
      toast.error('שגיאה בשמירת ההזמנה');
      console.error(error);
      return;
    }
    await logVehicleEvent({
      vehicleId: vehicle.id,
      vehiclePlate: vehicle.license_plate,
      companyName: vehicle.company_name || user?.company_name || '',
      action: 'הזמנת שירות לספק',
      details: `${orderType} · ${selected.name} · ${orderNum}`,
      userId: user?.id,
      userName: user?.full_name,
    });
    toast.success(`הזמנה נשמרה · ${orderNum}`);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-right">
          <SheetTitle>הזמנה לספק / שירות חיצוני</SheetTitle>
          <SheetDescription>
            {vehicle.license_plate}
            {vehicle.internal_number ? ` · ${vehicle.internal_number}` : ''}
          </SheetDescription>
        </SheetHeader>

        {sourceLabel && (
          <div className="mt-3 p-3 rounded-xl border border-warning/30 bg-warning/5 text-sm">
            מקושר ל{sourceType}: <strong>{sourceLabel}</strong>
          </div>
        )}

        <div className="flex gap-1 mt-4 text-xs font-bold">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`flex-1 text-center py-2 border-b-2 ${step === n ? 'border-primary text-primary' : step > n ? 'border-primary/40 text-muted-foreground' : 'border-border text-muted-foreground'}`}
            >
              {n === 1 ? 'סוג' : n === 2 ? 'ספק' : 'פרטים'}
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {ORDER_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setOrderType(t);
                  setStep(2);
                }}
                className="card-elevated py-3 text-sm font-bold hover:border-primary/40"
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 py-2 rounded-xl border-2 font-bold text-sm ${supplierTab === 'existing' ? 'border-primary bg-primary/10' : 'border-border'}`}
                onClick={() => setSupplierTab('existing')}
              >
                ספק קיים
              </button>
              <button
                type="button"
                className={`flex-1 py-2 rounded-xl border-2 font-bold text-sm ${supplierTab === 'new' ? 'border-primary bg-primary/10' : 'border-border'}`}
                onClick={() => setSupplierTab('new')}
              >
                ספק חדש
              </button>
            </div>

            {supplierTab === 'existing' ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {suppliers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">אין ספקים ברשימה</p>
                ) : (
                  suppliers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelected(s)}
                      className={`w-full text-right card-elevated p-3 ${selected?.id === s.id ? 'border-primary ring-1 ring-primary' : ''}`}
                    >
                      <p className="font-bold">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.phone} · {s.supplier_type}</p>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input className={inputClass} placeholder="שם ספק *" value={newName} onChange={(e) => setNewName(e.target.value)} />
                <input className={inputClass} placeholder="טלפון *" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
                <input className={inputClass} placeholder="איש קשר" value={newContact} onChange={(e) => setNewContact(e.target.value)} />
                <input className={inputClass} placeholder="כתובת" value={newAddr} onChange={(e) => setNewAddr(e.target.value)} />
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>חזור</Button>
              <Button className="flex-1" onClick={confirmSupplier}>המשך</Button>
            </div>
          </div>
        )}

        {step === 3 && selected && (
          <div className="mt-4 space-y-3">
            <div className="card-elevated p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase">מספר הזמנה</p>
              <p className="text-xl font-bold text-primary">{orderNum}</p>
            </div>
            <div className="card-elevated p-3 text-sm space-y-1">
              <p><span className="text-muted-foreground">ספק:</span> {selected.name}</p>
              <p><span className="text-muted-foreground">רכב:</span> {vehicle.manufacturer} {vehicle.model}</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-muted-foreground">תיאור העבודה *</label>
              <textarea className={`${inputClass} min-h-[80px]`} value={workDesc} onChange={(e) => setWorkDesc(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-muted-foreground">הערות</label>
              <textarea className={`${inputClass} min-h-[54px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>חזור</Button>
              <Button className="flex-1" disabled={loading} onClick={save}>
                {loading ? 'שומר...' : 'שמור הזמנה'}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
