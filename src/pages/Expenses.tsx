import { useState, useEffect } from 'react';
import { FileText, Plus, Search, ArrowRight, TrendingUp, Download } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import ExpenseCard from '@/components/ExpenseCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';
import { plateMatches, useVehicleUrlContext } from '@/lib/entityNavContext';
import { EntityContextBanner } from '@/components/EntityContextBanner';
import VehicleBackToCardButton from '@/components/vehicles/VehicleBackToCardButton';
import { VEHICLE_EMPTY_LIST_MSG } from '@/lib/vehicleScopedUi';

interface ExpenseRow {
  id: string;
  date: string;
  driver_name: string;
  vehicle_plate: string;
  category: string;
  vendor: string;
  invoice_number: string;
  amount: number;
  odometer: number;
  notes: string;
}

const expenseCategories = ['דלק', 'שמן', 'צמיגים', 'שטיפה', 'חניה', 'כבישי אגרה', 'תחזוקה', 'אחר'];

export default function Expenses() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const { plate: contextPlate, vehicleId: contextVehicleId, locked } = useVehicleUrlContext();
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(true);

  const loadExpenses = async () => {
    setLoading(true);
    const { data } = await applyCompanyScope(supabase.from('expenses').select('*'), companyFilter).order('created_at', { ascending: false });
    if (data) setExpenses(data as ExpenseRow[]);
    setLoading(false);
  };

  useEffect(() => { loadExpenses(); }, []);

  useEffect(() => {
    if (contextPlate) setSearch(contextPlate);
  }, [contextPlate]);

  const filtered = expenses.filter(e => {
    const matchVehicle = !locked || !contextPlate || plateMatches(e.vehicle_plate, contextPlate);
    const matchSearch = !search || e.driver_name?.includes(search) || plateMatches(e.vehicle_plate, search) || e.vendor?.includes(search);
    const matchCat = !filterCategory || e.category === filterCategory;
    return matchVehicle && matchSearch && matchCat;
  });

  const totalFiltered = filtered.reduce((sum, e) => sum + (e.amount || 0), 0);

  if (showForm) {
    return <ExpenseFormPage onDone={() => { setShowForm(false); loadExpenses(); }} onBack={() => setShowForm(false)} user={user} />;
  }

  return (
    <div className="animate-fade-in">
      <VehicleBackToCardButton vehicleId={contextVehicleId} />
      {locked && contextPlate && <EntityContextBanner label={`רכב ${contextPlate}`} strict />}
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header !mb-0 flex items-center gap-3"><FileText size={28} /> הוצאות</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('expenses', [
            { key: 'date', label: 'תאריך' },
            { key: 'driver_name', label: 'נהג' },
            { key: 'vehicle_plate', label: 'מספר רכב' },
            { key: 'category', label: 'קטגוריה' },
            { key: 'vendor', label: 'ספק' },
            { key: 'invoice_number', label: 'מספר חשבונית' },
            { key: 'amount', label: 'סכום' },
            { key: 'odometer', label: 'קילומטראז׳' },
            { key: 'notes', label: 'הערות' },
          ], filtered)} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm font-bold min-h-[48px] hover:bg-muted transition-colors">
            <Download size={18} /> ייצוא
          </button>
        </div>
      </div>

      {/* Total */}
      <div className="card-elevated flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <TrendingUp size={20} className="text-primary" />
        </div>
        <div>
          <p className="text-2xl font-black">₪{totalFiltered.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">סה״כ {filtered.length} הוצאות</p>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." disabled={locked && !!contextPlate} className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none disabled:opacity-60" />
      </div>

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        <button onClick={() => setFilterCategory('')}
          className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${!filterCategory ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          הכל
        </button>
        {expenseCategories.map(cat => (
          <button key={cat} onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${filterCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><FileText size={48} className="mx-auto mb-4 opacity-50" /><p className="text-xl">{locked && contextPlate ? VEHICLE_EMPTY_LIST_MSG : 'אין הוצאות'}</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(e => (
            <ExpenseCard key={e.id} expense={e} />
          ))}
        </div>
      )}

      {/* Floating + button */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-24 left-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-all flex items-center justify-center hover:scale-110"
        title="הוצאה חדשה"
      >
        <Plus size={28} />
      </button>
    </div>
  );
}

function ExpenseFormPage({ onDone, onBack, user }: { onDone: () => void; onBack: () => void; user: any }) {
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [category, setCategory] = useState('');
  const [vendor, setVendor] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [vehicles, setVehicles] = useState<{ license_plate: string; manufacturer: string; model: string }[]>([]);
  const [drivers, setDrivers] = useState<{ full_name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('vehicles').select('license_plate, manufacturer, model'),
      supabase.from('drivers').select('full_name'),
    ]).then(([v, d]) => {
      if (v.data) setVehicles(v.data);
      if (d.data) setDrivers(d.data);
    });
  }, []);

  const isValid = category && amount;
  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    const { error } = await supabase.from('expenses').insert({
      vehicle_plate: vehiclePlate, driver_name: driverName, category, vendor,
      invoice_number: invoiceNumber, amount: parseFloat(amount) || 0,
      odometer: parseInt(odometer) || 0, notes, image_url: imageUrl || '',
      company_name: user?.company_name || '', created_by: user?.id,
    });
    setLoading(false);
    if (error) { toast.error('שגיאה בשמירה'); } else { toast.success('ההוצאה נשמרה'); onDone(); }
  };

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]"><ArrowRight size={20} /> חזרה</button>
      <h1 className="text-2xl font-bold mb-6">הוצאה חדשה</h1>
      <div className="space-y-5">
        <div><label className="block text-lg font-medium mb-2">קטגוריה *</label>
          <select value={category} onChange={e => setCategory(e.target.value)} className={inputClass}>
            <option value="">בחר...</option>
            {expenseCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label className="block text-lg font-medium mb-2">סכום (₪) *</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={inputClass} />
        </div>
        <div><label className="block text-lg font-medium mb-2">רכב</label>
          <select value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} className={inputClass}>
            <option value="">בחר...</option>
            {vehicles.map(v => <option key={v.license_plate} value={v.license_plate}>{v.license_plate} - {v.manufacturer} {v.model}</option>)}
          </select>
        </div>
        <div><label className="block text-lg font-medium mb-2">נהג</label>
          <select value={driverName} onChange={e => setDriverName(e.target.value)} className={inputClass}>
            <option value="">בחר...</option>
            {drivers.map(d => <option key={d.full_name} value={d.full_name}>{d.full_name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-lg font-medium mb-2">ספק</label>
            <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="שם הספק..." className={inputClass} />
          </div>
          <div><label className="block text-lg font-medium mb-2">מס׳ חשבונית</label>
            <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="מספר..." className={inputClass} />
          </div>
        </div>
        <div><label className="block text-lg font-medium mb-2">ק"מ</label>
          <input type="number" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="0" className={inputClass} />
        </div>
        <ImageUpload label="צילום חשבונית" folder="expenses" imageUrl={imageUrl} onImageUploaded={setImageUrl} />
        <div><label className="block text-lg font-medium mb-2">הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="הערות..." className={`${inputClass} resize-none`} />
        </div>
        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${isValid && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שומר...' : '💾 שמור הוצאה'}
        </button>
      </div>
    </div>
  );
}
