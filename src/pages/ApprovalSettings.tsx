import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { CheckSquare, CheckCircle, XCircle, Building2, Car } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface ApprovalRequest {
  id: string;
  created_at: string;
  updated_at: string;
  company_name: string;
  entity_type: string;
  entity_id: string;
  action_type: string;
  vehicle_plate: string;
  description: string;
  requested_by_name: string;
  status: string;
  approved_by_name: string;
  approved_at: string | null;
  rejection_reason: string;
  reminder_count: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין לאישור',
  approved: 'אושר',
  rejected: 'נדחה',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  approved: 'bg-primary/10 text-primary border-primary/30',
  rejected: 'bg-destructive/10 text-destructive border-destructive/30',
};

const ENTITY_LABELS: Record<string, string> = {
  vehicle: 'רכב', driver: 'נהג', service_order: 'שירותים ותחזוקה',
  work_assignment: 'סידור עבודה', handover: 'חילופי רכב', insurance: 'ביטוח',
  test: 'טסט', license: 'רישיון',
};

export default function ApprovalSettings() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  useEffect(() => { loadRequests(); }, [companyFilter]);

  const loadRequests = async () => {
    setLoading(true);
    const { data } = await applyCompanyScope(
      supabase.from('approval_requests').select('*').order('created_at', { ascending: false }),
      companyFilter
    );
    if (data) setRequests(data as ApprovalRequest[]);
    setLoading(false);
  };

  const handleApprove = async (req: ApprovalRequest) => {
    await supabase.from('approval_requests').update({
      status: 'approved',
      approved_by: user?.id,
      approved_by_name: user?.full_name || '',
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', req.id);

    // System log
    await supabase.from('system_logs').insert({
      user_id: user?.id,
      user_name: user?.full_name || '',
      company_name: req.company_name,
      action_type: 'approve',
      entity_type: req.entity_type,
      entity_id: req.entity_id,
      vehicle_plate: req.vehicle_plate,
      old_status: 'pending',
      new_status: 'approved',
      details: `${user?.full_name} אישר: ${req.description}`,
    });

    toast.success('הבקשה אושרה');
    loadRequests();
  };

  const handleReject = async (req: ApprovalRequest) => {
    await supabase.from('approval_requests').update({
      status: 'rejected',
      approved_by: user?.id,
      approved_by_name: user?.full_name || '',
      approved_at: new Date().toISOString(),
      rejection_reason: rejectReason,
      updated_at: new Date().toISOString(),
    }).eq('id', req.id);

    await supabase.from('system_logs').insert({
      user_id: user?.id,
      user_name: user?.full_name || '',
      company_name: req.company_name,
      action_type: 'reject',
      entity_type: req.entity_type,
      entity_id: req.entity_id,
      vehicle_plate: req.vehicle_plate,
      old_status: 'pending',
      new_status: 'rejected',
      details: `${user?.full_name} דחה: ${req.description}. סיבה: ${rejectReason}`,
    });

    setRejectId(null);
    setRejectReason('');
    toast.success('הבקשה נדחתה');
    loadRequests();
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const pendingCount = requests.filter(r => r.status === 'pending').length;

  // Check for stale requests (>48h pending)
  const staleRequests = requests.filter(r => {
    if (r.status !== 'pending') return false;
    const hours = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
    return hours > 48;
  });

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-header flex items-center gap-3 !mb-0"><CheckSquare size={28} /> אישורים</h1>
        {pendingCount > 0 && (
          <span className="px-3 py-1.5 rounded-full bg-amber-500 text-white text-sm font-bold animate-pulse">
            {pendingCount} ממתינים
          </span>
        )}
      </div>

      {staleRequests.length > 0 && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <p className="font-bold text-destructive">⚠️ {staleRequests.length} בקשות ממתינות מעל 48 שעות!</p>
        </div>
      )}

      <div className="flex gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${filter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {s === 'all' ? 'הכל' : STATUS_LABELS[s]} ({s === 'all' ? requests.length : requests.filter(r => r.status === s).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="card-elevated text-center py-12">
          <CheckCircle className="mx-auto mb-4 text-primary" size={48} />
          <p className="text-xl font-bold">אין בקשות אישור</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const isStale = req.status === 'pending' && (Date.now() - new Date(req.created_at).getTime()) / (1000 * 60 * 60) > 48;
            return (
              <div key={req.id} className={`card-elevated border-2 ${isStale ? 'border-destructive/40' : STATUS_COLORS[req.status]?.split(' ').find(c => c.startsWith('border')) || 'border-border'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${STATUS_COLORS[req.status] || ''}`}>
                        {STATUS_LABELS[req.status] || req.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground text-xs">
                        {ENTITY_LABELS[req.entity_type] || req.entity_type}
                      </span>
                      {isStale && <span className="px-2 py-0.5 rounded-lg bg-destructive text-destructive-foreground text-xs animate-pulse">מעל 48 שעות!</span>}
                    </div>
                    <p className="font-bold">{req.description || req.action_type}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Building2 size={12} /> {req.company_name}</span>
                      {req.vehicle_plate && <span className="flex items-center gap-1"><Car size={12} /> {req.vehicle_plate}</span>}
                      <span>מבקש: {req.requested_by_name}</span>
                      <span>{format(new Date(req.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}</span>
                    </div>
                    {req.status === 'approved' && req.approved_by_name && (
                      <p className="text-xs text-primary mt-1">אושר ע״י {req.approved_by_name} ב-{req.approved_at ? format(new Date(req.approved_at), 'dd/MM HH:mm', { locale: he }) : ''}</p>
                    )}
                    {req.status === 'rejected' && req.rejection_reason && (
                      <p className="text-xs text-destructive mt-1">נדחה: {req.rejection_reason}</p>
                    )}
                  </div>
                </div>

                {isManager && req.status === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-border">
                    {rejectId === req.id ? (
                      <div className="space-y-2">
                        <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                          placeholder="סיבת הדחייה..." rows={2}
                          className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm resize-none focus:border-primary focus:outline-none" />
                        <div className="flex gap-2">
                          <button onClick={() => handleReject(req)}
                            className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm">אשר דחייה</button>
                          <button onClick={() => setRejectId(null)}
                            className="py-2 px-4 rounded-xl bg-muted text-muted-foreground font-bold text-sm">ביטול</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(req)}
                          className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold">
                          <CheckCircle size={16} className="inline ml-1" /> אשר
                        </button>
                        <button onClick={() => setRejectId(req.id)}
                          className="py-3 px-6 rounded-xl bg-destructive/10 text-destructive font-bold">
                          <XCircle size={16} className="inline ml-1" /> דחה
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
