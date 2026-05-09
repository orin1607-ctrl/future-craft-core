import { useState, useRef, useEffect } from 'react';
import { Expense, FaultAttachment, expenseCategories } from '@/data/demo-data';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight, Camera, X, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverVehicle } from '@/hooks/useDriverVehicle';

interface ExpenseFormProps {
  onSubmit: (expense: Expense) => void;
  onCancel: () => void;
}

const paymentMethods = [
  { key: 'credit' as const, text: 'אשראי' },
  { key: 'cash' as const, text: 'מזומן' },
  { key: 'fuel_card' as const, text: 'דלקן' },
];

export default function ExpenseForm({ onSubmit, onCancel }: ExpenseFormProps) {
  const { user } = useAuth();
  const { vehicle, isDriver } = useDriverVehicle();

  const [dbVehicles, setDbVehicles] = useState<{ license_plate: string; manufacturer: string; model: string }[]>([]);
  const [dbDrivers, setDbDrivers] = useState<{ full_name: string }[]>([]);

  useEffect(() => {
    if (!isDriver) {
      supabase.from('vehicles').select('license_plate, manufacturer, model').then(({ data }) => {
        if (data) setDbVehicles(data);
      });
      supabase.from('drivers').select('full_name').then(({ data }) => {
        if (data) setDbDrivers(data);
      });
    }
  }, [isDriver]);

  const [driverName, setDriverName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [odometer, setOdometer] = useState('');
  const [category, setCategory] = useState('');
  const [vendor, setVendor] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'credit' | 'cash' | 'fuel_card'>('credit');
  const [notes, setNotes] = useState('');
  const [receiptImage, setReceiptImage] = useState<FaultAttachment | null>(null);
  const [extraFiles, setExtraFiles] = useState<FaultAttachment[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const extraFilesRef = useRef<HTMLInputElement>(null);

  // Auto-fill for drivers
  useEffect(() => {
    if (isDriver && user) {
      setDriverName(user.full_name);
    }
  }, [isDriver, user]);

  useEffect(() => {
    if (isDriver && vehicle) {
      setVehiclePlate(vehicle.license_plate);
      if (vehicle.odometer) setOdometer(vehicle.odometer.toString());
    }
  }, [isDriver, vehicle]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptImage({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      size: file.size,
      url: URL.createObjectURL(file),
    });
    e.target.value = '';
  };

  const removeReceipt = () => {
    if (receiptImage) URL.revokeObjectURL(receiptImage.url);
    setReceiptImage(null);
  };

  const isValid = driverName && vehiclePlate && category && vendor && invoiceNumber && invoiceDate && amount && receiptImage;

  const handleSubmit = () => {
    if (!isValid) return;
    const expense: Expense = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().split('T')[0],
      driverName,
      vehiclePlate,
      category,
      vendor,
      invoiceNumber,
      invoiceDate,
      amount: parseFloat(amount),
      odometer: parseInt(odometer) || 0,
      paymentMethod,
      notes: notes || undefined,
      receiptImage: receiptImage || undefined,
    };
    onSubmit(expense);
  };

  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  return (
    <div className="animate-fade-in">
      <button onClick={onCancel} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} />
        חזרה לרשימת הוצאות
      </button>

      <h1 className="text-2xl font-bold mb-6">דיווח הוצאה</h1>

      <div className="space-y-5">
        {/* Section: Driver & Vehicle */}
        <div className="card-elevated">
          <h2 className="text-lg font-bold mb-4 text-primary">פרטי נהג ורכב</h2>
          <div className="space-y-4">
            {isDriver ? (
              <div>
                <label className="block text-lg font-medium mb-2">שם הנהג</label>
                <div className="w-full p-4 text-lg rounded-xl border-2 border-input bg-muted/50 font-bold">{driverName}</div>
              </div>
            ) : (
              <div>
                <label className="block text-lg font-medium mb-2">שם הנהג</label>
                <select value={driverName} onChange={e => setDriverName(e.target.value)} className={inputClass}>
                  <option value="">בחר נהג...</option>
                  {dbDrivers.map(d => (
                    <option key={d.full_name} value={d.full_name}>{d.full_name}</option>
                  ))}
                </select>
              </div>
            )}

            {isDriver && vehicle ? (
              <div>
                <label className="block text-lg font-medium mb-2">רכב משויך</label>
                <div className="w-full p-4 text-lg rounded-xl border-2 border-input bg-muted/50">
                  <p className="font-bold">{vehicle.license_plate}</p>
                  <p className="text-sm text-muted-foreground">{vehicle.manufacturer} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}</p>
                </div>
              </div>
            ) : !isDriver ? (
              <div>
                <label className="block text-lg font-medium mb-2">מספר רכב</label>
                <select value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} className={inputClass}>
                  <option value="">בחר רכב...</option>
                  {dbVehicles.map(v => (
                    <option key={v.license_plate} value={v.license_plate}>{v.license_plate} - {v.manufacturer} {v.model}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-lg font-medium mb-2">מספר רכב</label>
                <div className="w-full p-4 text-lg rounded-xl border-2 border-input bg-muted/50 text-muted-foreground">אין רכב משויך</div>
              </div>
            )}

            <div>
              <label className="block text-lg font-medium mb-2">קילומטראז'</label>
              <input
                type="number"
                value={odometer}
                onChange={e => setOdometer(e.target.value)}
                placeholder="הכנס קילומטראז' נוכחי..."
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Section: Invoice Details */}
        <div className="card-elevated">
          <h2 className="text-lg font-bold mb-4 text-primary">פרטי החשבונית</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-lg font-medium mb-2">קטגוריה</label>
              <div className="flex flex-wrap gap-2">
                {expenseCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-5 py-3 rounded-xl text-lg font-medium transition-colors ${category === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-lg font-medium mb-2">שם הספק</label>
              <input type="text" value={vendor} onChange={e => setVendor(e.target.value)} placeholder="הכנס שם ספק..." className={inputClass} />
            </div>
            <div>
              <label className="block text-lg font-medium mb-2">מספר חשבונית</label>
              <input type="text" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="הכנס מספר חשבונית..." className={inputClass} />
            </div>
            <div>
              <label className="block text-lg font-medium mb-2">תאריך חשבונית</label>
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-lg font-medium mb-2">סכום בשקלים</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₪ הכנס סכום..." className={inputClass} />
            </div>
            <div>
              <label className="block text-lg font-medium mb-2">אמצעי תשלום</label>
              <div className="flex gap-2">
                {paymentMethods.map(pm => (
                  <button
                    key={pm.key}
                    onClick={() => setPaymentMethod(pm.key)}
                    className={`flex-1 py-4 rounded-xl text-lg font-medium border-2 transition-colors ${paymentMethod === pm.key ? 'border-primary/40 bg-primary/5 font-bold' : 'bg-muted text-muted-foreground border-transparent'}`}
                  >
                    {pm.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section: Receipt Photo */}
        <div className="card-elevated">
          <h2 className="text-lg font-bold mb-4 text-primary">צילום חשבונית <span className="text-destructive">(חובה)</span></h2>
          {!receiptImage ? (
            <button
              onClick={() => cameraRef.current?.click()}
              className="w-full flex items-center justify-center gap-3 py-6 rounded-xl border-2 border-dashed border-input bg-muted/50 text-xl font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <Camera size={28} />
              📸 פתח מצלמה
            </button>
          ) : (
            <div className="relative">
              <img src={receiptImage.url} alt="חשבונית" className="w-full rounded-xl max-h-64 object-cover" />
              <button onClick={removeReceipt} className="absolute top-2 left-2 p-2 rounded-full bg-destructive text-destructive-foreground">
                <X size={20} />
              </button>
            </div>
          )}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleImageChange} className="hidden" />
        </div>

        {/* Extra Files */}
        <div className="card-elevated">
          <h2 className="text-lg font-bold mb-4 text-primary">קבצים נוספים <span className="text-sm font-normal text-muted-foreground">(אישורים, מסמכי מיגון וכו׳)</span></h2>
          {extraFiles.length > 0 && (
            <div className="space-y-2 mb-3">
              {extraFiles.map((f, i) => (
                <div key={f.id} className="p-3 rounded-xl bg-muted space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate flex-1">{f.name}</span>
                    <button onClick={() => { URL.revokeObjectURL(f.url); setExtraFiles(prev => prev.filter((_, idx) => idx !== i)); }} className="p-1 text-destructive shrink-0">
                      <X size={18} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={(f as any).description || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setExtraFiles(prev => prev.map((file, idx) => idx === i ? { ...file, description: val } as any : file));
                    }}
                    placeholder="שם / תיאור הקובץ (לדוגמה: אישור מיגון)..."
                    className="w-full p-2 text-sm rounded-lg border border-input bg-background focus:border-primary focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}
          <button onClick={() => extraFilesRef.current?.click()} className="w-full py-3 rounded-xl border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary transition-colors font-medium">
            + הוסף קבצים נוספים
          </button>
          <input ref={extraFilesRef} type="file" multiple onChange={(e) => {
            const files = Array.from(e.target.files || []);
            const mapped = files.map(file => ({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, url: URL.createObjectURL(file), description: '' } as any));
            setExtraFiles(prev => [...prev, ...mapped]);
            e.target.value = '';
          }} className="hidden" />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-lg font-medium mb-2">הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="הערות נוספות..." className={`${inputClass} resize-none`} />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${isValid ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
        >
          <Plus size={24} className="inline ml-2" />
          שליחה
        </button>
      </div>
    </div>
  );
}
