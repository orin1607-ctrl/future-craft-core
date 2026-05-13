import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Truck, Check, X, Plus } from 'lucide-react';

interface Referral {
  id: string;
  provider_name: string;
  provider_type: string;
  provider_phone: string;
  status: string;
  requested_by_name: string;
  approved_by_name: string;
  approved_at: string | null;
  completed: boolean;
  completed_at: string | null;
  notes: string;
  created_at: string;
}

const providerTypes = ['מוסך', 'גרר', 'פחחות', 'חשמלאי רכב', 'צמיגים', 'אחר'];

const statusLabels: Record<string, { text: string; cls: string }> = {
  pending_approval: { text: 'ממתין לאישור', cls: 'bg-warning/10 text-warning' },
  approved: { text: 'אושר', cls: 'bg-info/10 text-info' },
  sent: { text: 'נשלח לספק', cls: 'bg-primary/10 text-primary' },
  completed: { text: 'בוצע', cls: 'bg-green-500/10 text-green-600' },
  rejected: { text: 'נדחה', cls: 'bg-destructive/10 text-destructive' },
};

export default function ServiceOrderReferral({ serviceOrderId, companyName, isManager }: { serviceOrderId: string; companyName: string; isManager: boolean }) {
  const { user } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [providerName, setProviderName] = useState('');
  const [providerType, setProviderType] = useState('');
  const [providerPhone, setProviderPhone] = useState('');
  const [notes, setNotes] = useState('');

  const load = async () => {
    const { data } = await (supabase.from('fault_referrals') as any).select('*').eq('service_order_id', serviceOrderId).order('created_at', { ascending: false });
    if (data) setReferrals(data as Referral[]);
  };

  useEffect(() => { load(); }, [serviceOrderId]);

  const handleCreate = async () => {
    if (!providerName) return;
    const { error } = await (supabase.from('fault_referrals') as any).insert({
      service_order_id: serviceOrderId,
      provider_name: providerName,
      provider_type: providerType,
      provider_phone: providerPhone,
      requested_by: user?.id,
      requested_by_name: user?.full_name || '',
      notes,
      company_name: companyName,
    });
    if (error) toast.error('שגיאה');
    else { toast.success('הזמנת עבודה נוצרה'); setShowForm(false); setProviderName(''); setProviderType(''); setProviderPhone(''); setNotes(''); load(); }
  };

  const handleApprove = async (id: string) => {
    await supabase.from('fault_referrals').update({ status: 'approved', approved_by: user?.id, approved_by_name: user?.full_name || '', approved_at: new Date().toISOString() }).eq('id', id);
    toast.success('אושר'); load();
  };
  const handleReject = async (id: string) => {
    await supabase.from('fault_referrals').update({ status: 'rejected', approved_by: user?.id, approved_by_name: user?.full_name || '', approved_at: new Date().toISOString() }).eq('id', id);
    toast.success('נדחה'); load();
  };
  const handleComplete = async (id: string) => {
    await supabase.from('fault_referrals').update({ status: 'completed', completed: true, completed_at: new Date().toISOString() }).eq('id', id);
    toast.success('סומן כבוצע'); load();
  };

  const inputClass = "w-full p-3 text-sm rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  return (
    <div className="card-elevated">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold flex items-center gap-2"><Truck size={18} /> הזמנת עבודה לספק</h3>
        {isManager && <button onClick={() => setShowForm(!showForm)} className="p-2 rounded-xl bg-primary/10 text-primary"><Plus size={18} /></button>}
      </div>

      {showForm && (
        <div className="space-y-3 mb-4 p-3 bg-muted/30 rounded-xl">
          <select value={providerType} onChange={e => setProviderType(e.target.value)} className={inputClass}>
            <option value="">סוג ספק...</option>
            {providerTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={providerName} onChange={e => setProviderName(e.target.value)} placeholder="שם הספק *" className={inputClass} />
          <input value={providerPhone} onChange={e => setProviderPhone(e.target.value)} placeholder="טלפון ספק" className={inputClass} />
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="הערות" className={inputClass} />
          <button onClick={handleCreate} disabled={!providerName} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">צור הזמנה</button>
        </div>
      )}

      {referrals.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">אין הזמנות עבודה</p>
      ) : (
        <div className="space-y-2">
          {referrals.map(r => {
            const st = statusLabels[r.status] || statusLabels.pending_approval;
            return (
              <div key={r.id} className="p-3 rounded-xl bg-muted/30">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-bold">{r.provider_name}</p>
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${st.cls}`}>{st.text}</span>
                </div>
                <p className="text-xs text-muted-foreground">{r.provider_type} {r.provider_phone && `• ${r.provider_phone}`}</p>
                <p className="text-xs text-muted-foreground">ביקש: {r.requested_by_name} • {new Date(r.created_at).toLocaleDateString('he-IL')}</p>
                {r.approved_by_name && <p className="text-xs text-muted-foreground">{r.status === 'rejected' ? 'נדחה' : 'אושר'} ע"י: {r.approved_by_name}</p>}
                {r.completed && <p className="text-xs text-green-600">✅ בוצע</p>}
                {r.notes && <p className="text-xs mt-1">{r.notes}</p>}
                {isManager && r.status === 'pending_approval' && (
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleApprove(r.id)} className="flex-1 py-2 rounded-lg bg-green-500/10 text-green-600 text-sm font-bold flex items-center justify-center gap-1"><Check size={14} /> אשר</button>
                    <button onClick={() => handleReject(r.id)} className="flex-1 py-2 rounded-lg bg-destructive/10 text-destructive text-sm font-bold flex items-center justify-center gap-1"><X size={14} /> דחה</button>
                  </div>
                )}
                {isManager && r.status === 'approved' && !r.completed && (
                  <button onClick={() => handleComplete(r.id)} className="w-full mt-2 py-2 rounded-lg bg-primary/10 text-primary text-sm font-bold">סמן כבוצע</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
