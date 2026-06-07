import { useState, useEffect } from 'react';
import {
  ClipboardList, Plus, Search, Calendar, Clock, Car, User, MapPin,
  ArrowRight, MessageSquare, Users, ChevronDown, Send, Building2, CheckCircle, XCircle, Shield,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AssignmentChat from '@/components/work-assignments/AssignmentChat';
import AssignmentStatusLog from '@/components/work-assignments/AssignmentStatusLog';
import { ORDERED_STATUSES, STATUS_LABELS, STATUS_COLORS } from '@/components/work-assignments/statusConfig';
import DriverWorkSchedule from '@/components/work-assignments/DriverWorkSchedule';
import { useDriverUrlContext } from '@/lib/entityNavContext';
import { EntityContextBanner } from '@/components/EntityContextBanner';

interface Assignment {
  id: string;
  title: string;
  description: string;
  vehicle_plate: string;
  driver_name: string;
  driver_id: string | null;
  customer_name: string;
  companion_name: string;
  companion_requested: boolean;
  scheduled_date: string | null;
  scheduled_time: string;
  end_time: string;
  location: string;
  priority: string;
  status: string;
  driver_approved_at: string | null;
  manager_approved_at: string | null;
  manager_approved_name: string;
  approval_source_driver: string;
  approval_source_manager: string;
  rejected_by: string;
  rejection_reason: string;
  notes: string;
  company_name: string;
  created_at: string;
}

const PRIORITY_LABELS: Record<string, string> = { normal: 'רגיל', high: 'גבוהה', urgent: 'דחוף' };
const PRIORITY_COLORS: Record<string, string> = { normal: 'bg-muted text-muted-foreground', high: 'bg-warning/10 text-warning', urgent: 'bg-destructive/10 text-destructive' };

export default function WorkOrders() {
  const { user } = useAuth();

  // Drivers get dedicated weekly schedule view
  if (user?.role === 'driver') {
    return <DriverWorkSchedule />;
  }

  return <ManagerWorkOrders />;
}

function ManagerWorkOrders() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const { driverId: contextDriverId, driverName: contextDriverName, locked, clearContext } = useDriverUrlContext();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Assignment | null>(null);

  const loadData = async () => {
    const { data } = await applyCompanyScope(
      supabase.from('work_assignments').select('*').order('scheduled_date', { ascending: true }).order('scheduled_time', { ascending: true }),
      companyFilter
    );
    if (data) setAssignments(data as Assignment[]);
  };

  useEffect(() => { loadData(); }, [companyFilter]);

  useEffect(() => {
    if (contextDriverName) setSearch(contextDriverName);
  }, [contextDriverName]);

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const filtered = assignments.filter(a => {
    const matchDriverContext = !locked
      || (contextDriverId ? a.driver_id === contextDriverId : false)
      || (contextDriverName ? a.driver_name === contextDriverName : false);
    const matchSearch = !search || a.title?.includes(search) || a.driver_name?.includes(search) || a.vehicle_plate?.includes(search) || a.customer_name?.includes(search);
    const matchStatus = !filterStatus || a.status === filterStatus;
    const matchDate = !filterDate || a.scheduled_date === filterDate;
    return matchDriverContext && matchSearch && matchStatus && matchDate;
  });

  const grouped: Record<string, Assignment[]> = {};
  filtered.forEach(a => {
    const day = a.scheduled_date
      ? new Date(a.scheduled_date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
      : 'ללא תאריך';
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(a);
  });

  const logStatusChange = async (assignmentId: string, oldStatus: string, newStatus: string, notes?: string) => {
    await supabase.from('work_assignment_status_log').insert({
      assignment_id: assignmentId,
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: user?.id,
      changed_by_name: user?.full_name || '',
      company_name: user?.company_name || '',
      notes: notes || '',
    });
  };

  const checkBothApproved = async (assignment: Assignment) => {
    const { data } = await supabase.from('work_assignments')
      .select('driver_approved_at, manager_approved_at')
      .eq('id', assignment.id).single();
    if (data?.driver_approved_at && data?.manager_approved_at) {
      await supabase.from('work_assignments').update({
        status: 'approved', updated_at: new Date().toISOString(),
      }).eq('id', assignment.id);
      await logStatusChange(assignment.id, assignment.status, 'approved', 'אושר ע״י שני הצדדים – נהג ומנהל צי');
      toast.success('סידור העבודה אושר על ידי שני הצדדים!');
    }
  };

  const handleStatusChange = async (assignment: Assignment, newStatus: string) => {
    await supabase.from('work_assignments').update({
      status: newStatus, updated_at: new Date().toISOString(),
    }).eq('id', assignment.id);
    await logStatusChange(assignment.id, assignment.status, newStatus);
    toast.success(`הסטטוס עודכן ל: ${STATUS_LABELS[newStatus]}`);
    loadData();
    if (selected?.id === assignment.id) setSelected({ ...assignment, status: newStatus });
  };

  const handleDriverApprove = async (assignment: Assignment) => {
    const newStatus = assignment.manager_approved_at ? 'approved' : 'pending_manager_approval';
    await supabase.from('work_assignments').update({
      driver_approved_at: new Date().toISOString(),
      approval_source_driver: 'system',
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', assignment.id);
    await logStatusChange(assignment.id, assignment.status, newStatus, 'הנהג אישר דרך המערכת');

    // Notify managers
    const { data: managers } = await supabase.from('user_roles').select('user_id')
      .eq('role', 'fleet_manager');
    if (managers) {
      const { data: managerProfiles } = await supabase.from('profiles').select('id, company_name')
        .in('id', managers.map(m => m.user_id))
        .eq('company_name', assignment.company_name);
      if (managerProfiles) {
        await supabase.from('driver_notifications').insert(
          managerProfiles.map(p => ({
            user_id: p.id,
            type: 'work_assignment',
            title: '✅ נהג אישר סידור עבודה',
            message: `${assignment.driver_name} אישר את סידור העבודה: ${assignment.title}`,
            link: '/work-orders',
          }))
        );
      }
    }

    toast.success('אישרת את סידור העבודה');
    if (assignment.manager_approved_at) {
      toast.success('סידור העבודה אושר על ידי שני הצדדים!');
    }
    loadData();
  };

  const handleManagerApprove = async (assignment: Assignment) => {
    const newStatus = assignment.driver_approved_at ? 'approved' : 'pending_driver_approval';
    await supabase.from('work_assignments').update({
      manager_approved_at: new Date().toISOString(),
      manager_approved_by: user?.id,
      manager_approved_name: user?.full_name || '',
      approval_source_manager: 'system',
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', assignment.id);
    await logStatusChange(assignment.id, assignment.status, newStatus, `מנהל צי ${user?.full_name} אישר דרך המערכת`);

    // Notify driver
    if (assignment.driver_id) {
      await supabase.from('driver_notifications').insert({
        user_id: assignment.driver_id,
        type: 'work_assignment',
        title: '✅ מנהל צי אישר סידור עבודה',
        message: `מנהל הצי אישר את סידור העבודה: ${assignment.title}`,
        link: '/work-orders',
      });
    }

    toast.success('אישרת את סידור העבודה כמנהל צי');
    if (assignment.driver_approved_at) {
      toast.success('סידור העבודה אושר על ידי שני הצדדים!');
    }
    loadData();
  };

  const handleReject = async (assignment: Assignment, reason: string) => {
    await supabase.from('work_assignments').update({
      status: 'rejected',
      rejected_by: user?.full_name || '',
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    }).eq('id', assignment.id);
    await logStatusChange(assignment.id, assignment.status, 'rejected', `נדחה ע״י ${user?.full_name}: ${reason}`);

    // Notify relevant parties (manager rejecting -> notify driver)
    if (isManager && assignment.driver_id) {
      // Notify managers
      const { data: managers } = await supabase.from('user_roles').select('user_id').eq('role', 'fleet_manager');
      if (managers) {
        const { data: mProfiles } = await supabase.from('profiles').select('id').in('id', managers.map(m => m.user_id)).eq('company_name', assignment.company_name);
        if (mProfiles) {
          await supabase.from('driver_notifications').insert(mProfiles.map(p => ({
            user_id: p.id, type: 'work_assignment',
            title: '❌ נהג דחה סידור עבודה',
            message: `${assignment.driver_name} דחה: ${assignment.title}. סיבה: ${reason}`,
            link: '/work-orders',
          })));
        }
      }
    }
    if (isManager && assignment.driver_id) {
      await supabase.from('driver_notifications').insert({
        user_id: assignment.driver_id, type: 'work_assignment',
        title: '❌ סידור עבודה נדחה',
        message: `מנהל הצי דחה את סידור העבודה: ${assignment.title}. סיבה: ${reason}`,
        link: '/work-orders',
      });
    }

    toast.success('סידור העבודה נדחה');
    loadData();
  };

  if (showForm) {
    return <AssignmentForm onDone={() => { setShowForm(false); loadData(); }} user={user} />;
  }

  const statusCounts = ORDERED_STATUSES.map(s => ({ s, count: assignments.filter(a => a.status === s).length })).filter(x => x.count > 0);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header mb-0 flex items-center gap-3"><ClipboardList size={28} /> סידור עבודה</h1>
        {isManager && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-lg font-bold min-h-[48px]">
            <Plus size={22} /> עבודה חדשה
          </button>
        )}
      </div>

      {locked && (contextDriverName || contextDriverId) && (
        <EntityContextBanner
          label={contextDriverName ? `נהג ${contextDriverName}` : 'נהג'}
          onClear={() => { clearContext(); setSearch(''); }}
        />
      )}

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש סידור עבודה, רכב או נהג..."
          disabled={locked && !!contextDriverName}
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      <div className="flex gap-2 items-center mb-3">
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
          className="p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
        {filterDate && (
          <button onClick={() => setFilterDate('')} className="px-3 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-bold">נקה</button>
        )}
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        <button onClick={() => setFilterStatus('')}
          className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${!filterStatus ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
          הכל ({assignments.length})
        </button>
        {statusCounts.map(({ s, count }) => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${filterStatus === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {STATUS_LABELS[s]} ({count})
          </button>
        ))}
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין סידורי עבודה</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, dayAssignments]) => (
            <div key={day}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={16} className="text-primary" />
                <h2 className="text-sm font-bold text-muted-foreground">{day}</h2>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-lg">{dayAssignments.length}</span>
              </div>
              <div className="space-y-3">
                {dayAssignments.map(a => (
                  <div key={a.id} className="card-elevated">
                    <button onClick={() => setSelected(a)} className="w-full text-right">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-lg font-bold">{a.title}</p>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${PRIORITY_COLORS[a.priority] || PRIORITY_COLORS.normal}`}>
                                {PRIORITY_LABELS[a.priority] || a.priority}
                              </span>
                              <span className={`status-badge ${STATUS_COLORS[a.status] || 'status-pending'} text-xs`}>
                                {STATUS_LABELS[a.status] || a.status}
                              </span>
                            </div>
                          </div>
                          {a.description && <p className="text-muted-foreground text-sm line-clamp-2 mb-2">{a.description}</p>}
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                            {a.scheduled_time && <span className="flex items-center gap-1"><Clock size={14} /> {a.scheduled_time}{a.end_time ? ` - ${a.end_time}` : ''}</span>}
                            {a.vehicle_plate && <span className="flex items-center gap-1"><Car size={14} /> {a.vehicle_plate}</span>}
                            {a.driver_name && <span className="flex items-center gap-1"><User size={14} /> {a.driver_name}</span>}
                            {a.customer_name && <span className="flex items-center gap-1"><Building2 size={14} /> {a.customer_name}</span>}
                            {a.location && <span className="flex items-center gap-1"><MapPin size={14} /> {a.location}</span>}
                          </div>
                          {/* Approval indicators */}
                          <div className="flex gap-3 mt-2">
                            <span className={`flex items-center gap-1 text-xs ${a.driver_approved_at ? 'text-primary' : 'text-muted-foreground'}`}>
                              {a.driver_approved_at ? <CheckCircle size={12} /> : <Clock size={12} />}
                              נהג {a.driver_approved_at ? '✓' : '⏳'}
                            </span>
                            <span className={`flex items-center gap-1 text-xs ${a.manager_approved_at ? 'text-primary' : 'text-muted-foreground'}`}>
                              {a.manager_approved_at ? <CheckCircle size={12} /> : <Clock size={12} />}
                              מנהל צי {a.manager_approved_at ? '✓' : '⏳'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Driver approval - drivers use dedicated view */}

                    {/* Manager approval */}
                    {isManager && ['sent_for_approval', 'pending_manager_approval'].includes(a.status) && !a.manager_approved_at && (
                      <div className="mt-3 pt-3 border-t border-border flex gap-2">
                        <button onClick={() => handleManagerApprove(a)}
                          className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold">
                          <Shield size={16} className="inline ml-1" /> אישור מנהל צי
                        </button>
                        <RejectButton onReject={(reason: string) => handleReject(a, reason)} />
                      </div>
                    )}

                    {/* Manager quick actions */}
                    {isManager && (
                      <div className="mt-3 pt-3 border-t border-border flex gap-2 flex-wrap">
                        {a.status === 'created' && (
                          <button onClick={() => handleStatusChange(a, 'sent_for_approval')}
                            className="flex-1 py-2 rounded-xl bg-primary/10 text-primary font-bold text-sm min-h-[40px]">
                            📤 שלח לאישור
                          </button>
                        )}
                        {a.status === 'approved' && (
                          <button onClick={() => handleStatusChange(a, 'active')}
                            className="flex-1 py-2 rounded-xl bg-primary/10 text-primary font-bold text-sm min-h-[40px]">
                            ▶️ הפעל
                          </button>
                        )}
                        {a.status === 'active' && (
                          <button onClick={() => handleStatusChange(a, 'in_progress')}
                            className="flex-1 py-2 rounded-xl bg-primary/10 text-primary font-bold text-sm min-h-[40px]">
                            🔄 בביצוע
                          </button>
                        )}
                        {a.status === 'in_progress' && (
                          <button onClick={() => handleStatusChange(a, 'completed')}
                            className="flex-1 py-2 rounded-xl bg-primary/10 text-primary font-bold text-sm min-h-[40px]">
                            ✅ הושלם
                          </button>
                        )}
                        {a.status === 'completed' && (
                          <button onClick={() => handleStatusChange(a, 'closed')}
                            className="flex-1 py-2 rounded-xl bg-muted text-muted-foreground font-bold text-sm min-h-[40px]">
                            🔒 סגור
                          </button>
                        )}
                        {a.status === 'rejected' && (
                          <button onClick={() => handleStatusChange(a, 'revision')}
                            className="flex-1 py-2 rounded-xl bg-warning/10 text-warning font-bold text-sm min-h-[40px]">
                            🔄 שלח לתיקון
                          </button>
                        )}
                        <button onClick={() => setSelected(a)}
                          className="py-2 px-4 rounded-xl bg-muted text-muted-foreground font-bold text-sm min-h-[40px]">
                          <MessageSquare size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); loadData(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">{selected.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`status-badge ${STATUS_COLORS[selected.status]} text-sm`}>{STATUS_LABELS[selected.status]}</span>
                  <span className={`px-2 py-1 rounded-lg text-xs font-bold ${PRIORITY_COLORS[selected.priority] || PRIORITY_COLORS.normal}`}>
                    {PRIORITY_LABELS[selected.priority] || selected.priority}
                  </span>
                </div>

                {selected.description && <p className="text-muted-foreground">{selected.description}</p>}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selected.scheduled_date && <InfoBox label="תאריך" value={new Date(selected.scheduled_date).toLocaleDateString('he-IL')} />}
                  {selected.scheduled_time && <InfoBox label="שעות עבודה" value={`${selected.scheduled_time}${selected.end_time ? ` - ${selected.end_time}` : ''}`} />}
                  {selected.driver_name && <InfoBox label="נהג / עובד" value={selected.driver_name} />}
                  {selected.customer_name && <InfoBox label="לקוח" value={selected.customer_name} />}
                  {selected.vehicle_plate && <InfoBox label="רכב" value={selected.vehicle_plate} />}
                  {selected.location && <InfoBox label="מיקום" value={selected.location} />}
                </div>

                {/* Approval status panel */}
                <div className="rounded-xl border-2 border-border p-4 space-y-3">
                  <h3 className="font-bold flex items-center gap-2"><Shield size={18} /> סטטוס אישורים</h3>
                  <div className="space-y-2">
                    <div className={`flex items-center justify-between p-3 rounded-xl ${selected.driver_approved_at ? 'bg-primary/10' : 'bg-muted'}`}>
                      <div className="flex items-center gap-2">
                        {selected.driver_approved_at ? <CheckCircle size={18} className="text-primary" /> : <Clock size={18} className="text-muted-foreground" />}
                        <div>
                          <p className="font-bold text-sm">אישור נהג</p>
                          {selected.driver_approved_at && (
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(selected.driver_approved_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                              {selected.approval_source_driver && ` (דרך ${selected.approval_source_driver === 'email' ? 'מייל' : 'המערכת'})`}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-bold ${selected.driver_approved_at ? 'text-primary' : 'text-muted-foreground'}`}>
                        {selected.driver_approved_at ? 'אושר ✓' : 'ממתין'}
                      </span>
                    </div>

                    <div className={`flex items-center justify-between p-3 rounded-xl ${selected.manager_approved_at ? 'bg-primary/10' : 'bg-muted'}`}>
                      <div className="flex items-center gap-2">
                        {selected.manager_approved_at ? <CheckCircle size={18} className="text-primary" /> : <Clock size={18} className="text-muted-foreground" />}
                        <div>
                          <p className="font-bold text-sm">אישור מנהל צי</p>
                          {selected.manager_approved_at && (
                            <p className="text-xs text-muted-foreground">
                              {selected.manager_approved_name} — {format(new Date(selected.manager_approved_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                              {selected.approval_source_manager && ` (דרך ${selected.approval_source_manager === 'email' ? 'מייל' : 'המערכת'})`}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-bold ${selected.manager_approved_at ? 'text-primary' : 'text-muted-foreground'}`}>
                        {selected.manager_approved_at ? 'אושר ✓' : 'ממתין'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Rejection info */}
                {selected.status === 'rejected' && selected.rejection_reason && (
                  <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm">
                    <p className="font-bold text-destructive">❌ נדחה על ידי: {selected.rejected_by}</p>
                    <p className="text-muted-foreground">{selected.rejection_reason}</p>
                  </div>
                )}

                {selected.notes && <p className="text-sm bg-muted p-3 rounded-xl text-muted-foreground">{selected.notes}</p>}

                {/* Driver approval - drivers use dedicated view */}

                {/* Manager approval in dialog */}
                {isManager && ['sent_for_approval', 'pending_manager_approval'].includes(selected.status) && !selected.manager_approved_at && (
                  <button onClick={() => handleManagerApprove(selected)}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold">
                    <Shield size={18} className="inline ml-2" /> אישור מנהל צי
                  </button>
                )}

                {/* Status change for managers */}
                {isManager && (
                  <div>
                    <label className="block text-sm font-bold mb-2">שנה סטטוס</label>
                    <select value={selected.status} onChange={e => handleStatusChange(selected, e.target.value)}
                      className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none">
                      {ORDERED_STATUSES.map(s => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                )}

                <AssignmentChat assignmentId={selected.id} companyName={selected.company_name} />
                <AssignmentStatusLog assignmentId={selected.id} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function RejectButton({ onReject }: { onReject: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="py-3 px-6 rounded-xl bg-destructive/10 text-destructive font-bold text-lg">
        ❌ דחה
      </button>
    );
  }

  return (
    <div className="flex-1 space-y-2">
      <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="סיבת הדחייה..."
        className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm resize-none" rows={2} />
      <div className="flex gap-2">
        <button onClick={() => { onReject(reason); setOpen(false); }}
          className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm">
          אשר דחייה
        </button>
        <button onClick={() => setOpen(false)}
          className="py-2 px-4 rounded-xl bg-muted text-muted-foreground font-bold text-sm">
          ביטול
        </button>
      </div>
    </div>
  );
}

/* ======================== Form ======================== */

function AssignmentForm({ onDone, user }: { onDone: () => void; user: any }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverId, setDriverId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [companionId, setCompanionId] = useState('');
  const [companionName, setCompanionName] = useState('');
  const [companionRequested, setCompanionRequested] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().split('T')[0]);
  const [scheduledTime, setScheduledTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [priority, setPriority] = useState('normal');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewCompanion, setShowNewCompanion] = useState(false);

  const [dbVehicles, setDbVehicles] = useState<{ license_plate: string; manufacturer: string; model: string }[]>([]);
  const [dbDrivers, setDbDrivers] = useState<{ id: string; full_name: string; phone: string }[]>([]);
  const [dbProfiles, setDbProfiles] = useState<{ id: string; full_name: string }[]>([]);
  const [dbCompanions, setDbCompanions] = useState<{ id: string; full_name: string }[]>([]);
  const [dbCustomers, setDbCustomers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      supabase.from('vehicles').select('license_plate, manufacturer, model'),
      supabase.from('drivers').select('id, full_name, phone'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('companions').select('id, full_name').eq('status', 'active'),
      supabase.from('customers').select('id, name'),
    ]).then(([v, d, p, c, cust]) => {
      if (v.data) setDbVehicles(v.data);
      if (d.data) setDbDrivers(d.data);
      if (p.data) setDbProfiles(p.data);
      if (c.data) setDbCompanions(c.data);
      if (cust.data) setDbCustomers(cust.data);
    });
  }, []);

  const handleDriverChange = (name: string) => {
    setDriverName(name);
    // Resolve driver user id: prefer matching profile (auth user), fallback to drivers row id
    // (driver records are usually created with id = auth user id by handle_new_user trigger)
    const profile = dbProfiles.find(p => p.full_name === name);
    const driverRow = dbDrivers.find(d => d.full_name === name);
    setDriverId(profile?.id || driverRow?.id || null);
  };

  const handleCustomerChange = (name: string) => {
    setCustomerName(name);
    const cust = dbCustomers.find(c => c.name === name);
    setCustomerId(cust?.id || null);
  };


  const handleCompanionChange = (id: string) => {
    setCompanionId(id);
    const comp = dbCompanions.find(c => c.id === id);
    setCompanionName(comp?.full_name || '');
  };

  const handleNewCompanionSaved = async (name: string) => {
    const { data } = await supabase.from('companions').select('id, full_name').eq('status', 'active');
    if (data) {
      setDbCompanions(data);
      const newComp = data.find(c => c.full_name === name);
      if (newComp) { setCompanionId(newComp.id); setCompanionName(newComp.full_name); }
    }
    setShowNewCompanion(false);
  };

  const isValid = title && vehiclePlate && driverName;
  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    // Status starts at 'pending_driver_approval' so the driver app surfaces it as actionable.
    const initialStatus = 'pending_driver_approval';
    const { error, data: inserted } = await supabase.from('work_assignments').insert({
      title, description,
      vehicle_plate: vehiclePlate,
      driver_name: driverName,
      driver_id: driverId,
      customer_name: customerName,
      customer_id: customerId,
      companion_id: companionId || null,
      companion_name: companionName,
      companion_requested: companionRequested,
      scheduled_date: scheduledDate || null,
      scheduled_time: scheduledTime,
      end_time: endTime,
      location, priority,
      status: initialStatus,
      notes,
      company_name: user?.company_name || '',
      created_by: user?.id,
    }).select('id').single();

    if (!error && inserted) {
      await supabase.from('work_assignment_status_log').insert({
        assignment_id: inserted.id,
        old_status: '', new_status: initialStatus,
        changed_by: user?.id,
        changed_by_name: user?.full_name || '',
        company_name: user?.company_name || '',
        notes: 'סידור עבודה חדש נוצר וממתין לאישור הנהג',
      });

      // Notify driver — try resolved id first, then fall back to looking up by name
      let notifyUserId = driverId;
      if (!notifyUserId && driverName) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id')
          .eq('full_name', driverName)
          .eq('company_name', user?.company_name || '')
          .maybeSingle();
        notifyUserId = prof?.id || null;
      }
      if (notifyUserId) {
        await supabase.from('driver_notifications').insert({
          user_id: notifyUserId, type: 'work_assignment',
          title: '📋 סידור עבודה חדש ממתין לאישורך',
          message: `${title} - ${customerName ? customerName + ' | ' : ''}${scheduledDate ? new Date(scheduledDate).toLocaleDateString('he-IL') : ''} ${scheduledTime || ''}`,
          link: '/work-orders',
        });
      } else {
        console.warn('No matching user profile for driver name; notification not sent', driverName);
      }
    }

    setLoading(false);
    if (error) { toast.error('שגיאה ביצירת סידור העבודה'); console.error(error); }
    else { toast.success('סידור עבודה חדש נוצר – ממתין לאישור הנהג'); onDone(); }
  };


  const taskTypes = ['הסעה', 'משלוח', 'איסוף', 'העברת רכב', 'טיפול', 'בדיקה', 'רחיצה', 'סיור', 'ליווי', 'אחר'];

  return (
    <div className="animate-fade-in">
      <button onClick={onDone} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה
      </button>
      <h1 className="text-2xl font-bold mb-6">סידור עבודה חדש</h1>
      <div className="space-y-5">
        <div>
          <label className="block text-lg font-medium mb-2">סוג עבודה *</label>
          <select value={title} onChange={e => setTitle(e.target.value)} className={inputClass}>
            <option value="">בחר...</option>
            {taskTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">לקוח</label>
          <select value={customerName} onChange={e => handleCustomerChange(e.target.value)} className={inputClass}>
            <option value="">בחר לקוח...</option>
            {dbCustomers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">רכב *</label>
          <select value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} className={inputClass}>
            <option value="">בחר רכב...</option>
            {dbVehicles.map(v => <option key={v.license_plate} value={v.license_plate}>{v.license_plate} - {v.manufacturer} {v.model}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-lg font-medium mb-2">נהג / עובד *</label>
          <select value={driverName} onChange={e => handleDriverChange(e.target.value)} className={inputClass}>
            <option value="">בחר...</option>
            {dbDrivers.map(d => <option key={d.full_name} value={d.full_name}>{d.full_name}</option>)}
          </select>
        </div>

        <div className="border border-border rounded-xl p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2"><Users size={18} /> מלווה</h3>
          <select value={companionId} onChange={e => handleCompanionChange(e.target.value)} className={inputClass}>
            <option value="">ללא מלווה</option>
            {dbCompanions.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowNewCompanion(true)}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold">
              <Plus size={16} /> מלווה חדש
            </button>
            {!companionId && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={companionRequested} onChange={e => setCompanionRequested(e.target.checked)} className="rounded" />
                נדרש מלווה
              </label>
            )}
          </div>
        </div>

        <div>
          <label className="block text-lg font-medium mb-2">פירוט העבודה</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="תאר את העבודה המלאה לביצוע..."
            className={`${inputClass} resize-none`} />
        </div>
        <div><label className="block text-lg font-medium mb-2">תאריך</label>
          <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} className={inputClass} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-lg font-medium mb-2">שעת התחלה</label>
            <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} className={inputClass} /></div>
          <div><label className="block text-lg font-medium mb-2">שעת סיום</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputClass} /></div>
        </div>
        <div><label className="block text-lg font-medium mb-2">מיקום</label>
          <input value={location} onChange={e => setLocation(e.target.value)} className={inputClass} /></div>
        <div>
          <label className="block text-lg font-medium mb-2">רמת עדיפות</label>
          <div className="flex gap-3">
            {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setPriority(key)}
                className={`flex-1 py-3 rounded-xl text-lg font-medium transition-colors ${priority === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div><label className="block text-lg font-medium mb-2">הערות</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} /></div>
        <button onClick={handleSubmit} disabled={!isValid || loading}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${isValid && !loading ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}>
          {loading ? 'שומר...' : '📋 צור סידור עבודה'}
        </button>
      </div>

      <Dialog open={showNewCompanion} onOpenChange={setShowNewCompanion}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>מלווה חדש</DialogTitle></DialogHeader>
          <NewCompanionInline companyName={user?.company_name || ''} userId={user?.id} onSaved={handleNewCompanionSaved} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewCompanionInline({ companyName, userId, onSaved }: { companyName: string; userId: string; onSaved: (name: string) => void }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const inputClass = "w-full p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  const handleSave = async () => {
    if (!fullName.trim()) return;
    setLoading(true);
    const { error } = await supabase.from('companions').insert({
      full_name: fullName, phone, id_number: idNumber, notes,
      company_name: companyName, created_by: userId,
    });
    setLoading(false);
    if (error) toast.error('שגיאה');
    else onSaved(fullName);
  };

  return (
    <div className="space-y-4">
      <div><label className="block font-medium mb-1">שם מלא *</label><input value={fullName} onChange={e => setFullName(e.target.value)} className={inputClass} /></div>
      <div><label className="block font-medium mb-1">טלפון</label><input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} /></div>
      <div><label className="block font-medium mb-1">ת.ז</label><input value={idNumber} onChange={e => setIdNumber(e.target.value)} className={inputClass} /></div>
      <div><label className="block font-medium mb-1">הערות</label><input value={notes} onChange={e => setNotes(e.target.value)} className={inputClass} /></div>
      <button onClick={handleSave} disabled={!fullName.trim() || loading}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold disabled:opacity-50">
        {loading ? 'שומר...' : '➕ הוסף מלווה'}
      </button>
    </div>
  );
}
