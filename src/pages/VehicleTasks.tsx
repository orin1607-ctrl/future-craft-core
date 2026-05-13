import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Search, CheckCircle2, Clock, Wrench, Car, CalendarDays, Shield, FileText, Trash2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface TaskRow {
  id: string;
  vehicle_id: string | null;
  vehicle_plate: string;
  inspection_id: string | null;
  title: string;
  description: string;
  status: string;
  resolved_at: string | null;
  resolved_by_name: string;
  company_name: string;
  created_at: string;
  requires_follow_up: boolean;
  follow_up_date: string | null;
  resolution_notes: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  open: { label: 'פתוח', color: 'text-destructive', bg: 'bg-destructive/10', icon: AlertTriangle },
  in_progress: { label: 'בטיפול', color: 'text-warning', bg: 'bg-warning/10', icon: Wrench },
  resolved: { label: 'טופל', color: 'text-success', bg: 'bg-success/10', icon: CheckCircle2 },
};

const getDaysSince = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export default function VehicleTasks() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const companyFilter = useCompanyFilter();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [vehicleMap, setVehicleMap] = useState<Record<string, { id: string; internal_number: string }>>({});
  const [vehicleByPlate, setVehicleByPlate] = useState<Record<string, { id: string; internal_number: string }>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [dateFilter, setDateFilter] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolveDialog, setResolveDialog] = useState<TaskRow | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null);

  const loadTasks = async () => {
    setLoading(true);
    const [tRes, vRes] = await Promise.all([
      applyCompanyScope(supabase.from('vehicle_tasks').select('*'), companyFilter).order('created_at', { ascending: false }),
      applyCompanyScope(supabase.from('vehicles').select('id, license_plate, internal_number'), companyFilter),
    ]);
    if (tRes.data) setTasks(tRes.data as TaskRow[]);
    if (vRes.data) {
      const byId: Record<string, { id: string; internal_number: string }> = {};
      const byPlate: Record<string, { id: string; internal_number: string }> = {};
      (vRes.data as any[]).forEach(v => {
        byId[v.id] = { id: v.id, internal_number: v.internal_number || '' };
        if (v.license_plate) byPlate[v.license_plate] = { id: v.id, internal_number: v.internal_number || '' };
      });
      setVehicleMap(byId);
      setVehicleByPlate(byPlate);
    }
    setLoading(false);
  };

  useEffect(() => { loadTasks(); }, []);

  const getInternal = (t: TaskRow) => (t.vehicle_id && vehicleMap[t.vehicle_id]?.internal_number) || vehicleByPlate[t.vehicle_plate]?.internal_number || '';
  const getVehicleId = (t: TaskRow) => t.vehicle_id || vehicleByPlate[t.vehicle_plate]?.id || null;

  const filtered = tasks.filter(t => {
    const internal = getInternal(t);
    const matchSearch = !search || t.vehicle_plate?.includes(search) || internal.includes(search) || t.title?.includes(search) || t.description?.includes(search);
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchFollowUp = !followUpOnly || t.requires_follow_up;
    
    // Date filtering
    let matchDate = true;
    if (dateFilter) {
      const taskDate = t.created_at.split('T')[0];
      matchDate = taskDate >= dateFilter;
    }
    if (dateFilterEnd) {
      const taskDate = t.created_at.split('T')[0];
      matchDate = matchDate && taskDate <= dateFilterEnd;
    }
    
    return matchSearch && matchStatus && matchFollowUp && matchDate;
  });

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const handleStatusChange = async (task: TaskRow, newStatus: string) => {
    if (newStatus === 'resolved') {
      setResolveDialog(task);
      setResolutionNotes('');
      return;
    }
    
    const updates: any = { status: newStatus };
    if (newStatus !== 'resolved') {
      updates.resolved_at = null;
      updates.resolved_by_name = '';
      updates.resolution_notes = '';
    }

    const { error } = await supabase.from('vehicle_tasks').update(updates).eq('id', task.id);
    if (error) {
      toast.error('שגיאה בעדכון');
    } else {
      const statusLabel = STATUS_CONFIG[newStatus]?.label || newStatus;
      toast.success(`הליקוי עודכן ל: ${statusLabel}`);
      loadTasks();
    }
  };

  const confirmResolve = async () => {
    if (!resolveDialog) return;
    if (!resolutionNotes.trim()) {
      toast.error('יש לפרט מה התיקון שבוצע');
      return;
    }
    
    const { error } = await supabase.from('vehicle_tasks').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by_name: user?.full_name || '',
      resolution_notes: resolutionNotes.trim(),
    }).eq('id', resolveDialog.id);

    if (error) {
      toast.error('שגיאה בסגירת הליקוי');
    } else {
      toast.success('הליקוי נסגר בהצלחה');
      setResolveDialog(null);
      loadTasks();
    }
  };

  const confirmDelete = async () => {
    if (!deleteTask) return;
    const { error } = await supabase.from('vehicle_tasks').delete().eq('id', deleteTask.id);
    if (error) {
      toast.error('שגיאה במחיקת הליקוי');
    } else {
      toast.success('הליקוי נמחק');
      setDeleteTask(null);
      loadTasks();
    }
  };

  const toggleFollowUp = async (task: TaskRow) => {
    const { error } = await supabase.from('vehicle_tasks').update({
      requires_follow_up: !task.requires_follow_up,
    }).eq('id', task.id);
    if (!error) {
      toast.success(task.requires_follow_up ? 'הוסר מרשימת המעקב' : 'סומן כחייב מעקב');
      loadTasks();
    }
  };

  const setFollowUpDate = async (task: TaskRow, date: string) => {
    await supabase.from('vehicle_tasks').update({ follow_up_date: date || null }).eq('id', task.id);
    loadTasks();
  };

  const statusCounts = {
    all: tasks.length,
    open: tasks.filter(t => t.status === 'open').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    resolved: tasks.filter(t => t.status === 'resolved').length,
  };

  const overdueCount = tasks.filter(t => 
    t.status !== 'resolved' && t.follow_up_date && new Date(t.follow_up_date) < new Date()
  ).length;

  const inputClass = "w-full p-3 text-base rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  return (
    <div className="animate-fade-in">
      <h1 className="page-header flex items-center gap-3">
        <AlertTriangle size={28} /> ניהול ליקויים
      </h1>
      <p className="text-muted-foreground mb-4 -mt-2">ליקויים שנמצאו בביקורות רכב — מעקב וטיפול</p>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר רכב, ליקוי או תיאור..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      {/* Date filters */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">מתאריך</label>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">עד תאריך</label>
          <input type="date" value={dateFilterEnd} onChange={e => setDateFilterEnd(e.target.value)} className={inputClass} />
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {([
          { key: 'all', label: 'הכל', emoji: '📋' },
          { key: 'open', label: 'פתוחים', emoji: '🔴' },
          { key: 'in_progress', label: 'בטיפול', emoji: '🟡' },
          { key: 'resolved', label: 'טופלו', emoji: '🟢' },
        ] as const).map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
              statusFilter === f.key ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}>
            <span>{f.emoji}</span>
            {f.label} ({statusCounts[f.key]})
          </button>
        ))}
      </div>

      {/* Follow-up filter */}
      <div className="flex gap-2 mb-5">
        <button onClick={() => setFollowUpOnly(!followUpOnly)}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
            followUpOnly ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>
          <Shield size={14} /> חייבים מעקב
        </button>
        {overdueCount > 0 && (
          <Badge variant="destructive" className="flex items-center gap-1 text-sm px-3">
            ⏰ {overdueCount} באיחור
          </Badge>
        )}
        {(dateFilter || dateFilterEnd) && (
          <button onClick={() => { setDateFilter(''); setDateFilterEnd(''); }}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-muted text-muted-foreground hover:bg-muted/80">
            ✕ נקה תאריכים
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="card-elevated text-center py-3">
          <p className="text-2xl font-black text-destructive">{statusCounts.open}</p>
          <p className="text-xs text-muted-foreground font-medium">פתוחים</p>
        </div>
        <div className="card-elevated text-center py-3">
          <p className="text-2xl font-black text-warning">{statusCounts.in_progress}</p>
          <p className="text-xs text-muted-foreground font-medium">בטיפול</p>
        </div>
        <div className="card-elevated text-center py-3">
          <p className="text-2xl font-black text-success">{statusCounts.resolved}</p>
          <p className="text-xs text-muted-foreground font-medium">טופלו</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין ליקויים{statusFilter !== 'all' ? ` בסטטוס "${STATUS_CONFIG[statusFilter]?.label || statusFilter}"` : ''}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.open;
            const StatusIcon = cfg.icon;
            const daysSinceCreated = getDaysSince(t.created_at);
            const isOverdue = t.follow_up_date && new Date(t.follow_up_date) < new Date() && t.status !== 'resolved';
            
            return (
              <div key={t.id} className={`card-elevated ${isOverdue ? 'border-2 border-destructive' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                    <StatusIcon size={24} className={cfg.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-lg font-bold">{t.title}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {t.requires_follow_up && t.status !== 'resolved' && (
                        <Badge variant="outline" className="text-xs border-primary text-primary">
                          <Shield size={10} className="mr-1" /> חייב מעקב
                        </Badge>
                      )}
                      {isOverdue && (
                        <Badge variant="destructive" className="text-xs">
                          ⏰ באיחור
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                      <Car size={14} />
                      <span className="font-medium">רכב {t.vehicle_plate}</span>
                      {getInternal(t) && (
                        <span className="font-medium text-primary">| פנימי {getInternal(t)}</span>
                      )}
                      {getVehicleId(t) && (
                        <button onClick={() => navigate(`/vehicles?vehicleId=${getVehicleId(t)}`)} className="inline-flex items-center gap-1 text-primary hover:underline text-xs">
                          <ExternalLink size={12} /> כרטיס רכב
                        </button>
                      )}
                      <span>•</span>
                      <span>{new Date(t.created_at).toLocaleDateString('he-IL')}</span>
                      {t.status !== 'resolved' && daysSinceCreated > 0 && (
                        <span className={`text-xs ${daysSinceCreated > 7 ? 'text-destructive font-bold' : ''}`}>
                          ({daysSinceCreated} ימים)
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-sm text-muted-foreground mt-1.5 bg-muted/50 p-2 rounded-lg">{t.description}</p>
                    )}

                    {/* Follow-up date */}
                    {t.status !== 'resolved' && isManager && (
                      <div className="flex items-center gap-2 mt-2">
                        <CalendarDays size={14} className="text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">תאריך מעקב:</span>
                        <input
                          type="date"
                          value={t.follow_up_date || ''}
                          onChange={e => setFollowUpDate(t, e.target.value)}
                          className="text-xs p-1 rounded border border-input bg-background"
                        />
                      </div>
                    )}

                    {t.resolved_at && (
                      <div className="mt-2 p-2 bg-success/5 rounded-lg border border-success/20">
                        <p className="text-xs text-success font-medium">
                          ✅ טופל ב-{new Date(t.resolved_at).toLocaleDateString('he-IL')} ע"י {t.resolved_by_name}
                        </p>
                        {t.resolution_notes && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                            <FileText size={12} className="mt-0.5 flex-shrink-0" />
                            {t.resolution_notes}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Status action buttons for managers */}
                {isManager && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-border flex-wrap">
                    {t.status === 'open' && (
                      <>
                        <button onClick={() => handleStatusChange(t, 'in_progress')}
                          className="flex-1 py-2 rounded-xl bg-warning/10 text-warning text-sm font-bold hover:bg-warning/20 transition-colors flex items-center justify-center gap-1.5">
                          <Wrench size={16} /> העבר לטיפול
                        </button>
                        <button onClick={() => handleStatusChange(t, 'resolved')}
                          className="flex-1 py-2 rounded-xl bg-success/10 text-success text-sm font-bold hover:bg-success/20 transition-colors flex items-center justify-center gap-1.5">
                          <CheckCircle2 size={16} /> סגור ליקוי
                        </button>
                      </>
                    )}
                    {t.status === 'in_progress' && (
                      <>
                        <button onClick={() => handleStatusChange(t, 'open')}
                          className="flex-1 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-bold hover:bg-muted/80 transition-colors flex items-center justify-center gap-1.5">
                          <AlertTriangle size={16} /> החזר לפתוח
                        </button>
                        <button onClick={() => handleStatusChange(t, 'resolved')}
                          className="flex-1 py-2 rounded-xl bg-success/10 text-success text-sm font-bold hover:bg-success/20 transition-colors flex items-center justify-center gap-1.5">
                          <CheckCircle2 size={16} /> סגור ליקוי
                        </button>
                      </>
                    )}
                    {t.status === 'resolved' && (
                      <button onClick={() => handleStatusChange(t, 'open')}
                        className="flex-1 py-2 rounded-xl bg-destructive/10 text-destructive text-sm font-bold hover:bg-destructive/20 transition-colors flex items-center justify-center gap-1.5">
                        <AlertTriangle size={16} /> פתח מחדש
                      </button>
                    )}
                    {t.status !== 'resolved' && (
                      <>
                        <button onClick={() => toggleFollowUp(t)}
                          className={`py-2 px-3 rounded-xl text-sm font-bold transition-colors flex items-center gap-1.5 ${
                            t.requires_follow_up ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                          <Shield size={14} /> {t.requires_follow_up ? 'הסר מעקב' : 'חייב מעקב'}
                        </button>
                        <button onClick={() => setDeleteTask(t)}
                          className="py-2 px-3 rounded-xl text-sm font-bold bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors flex items-center gap-1.5">
                          <Trash2 size={14} /> מחק
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Resolution confirmation dialog */}
      <Dialog open={!!resolveDialog} onOpenChange={(open) => { if (!open) setResolveDialog(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>סגירת ליקוי - אישור תיקון</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-xl">
              <p className="font-bold">{resolveDialog?.title}</p>
              <p className="text-sm text-muted-foreground">רכב {resolveDialog?.vehicle_plate}</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">פירוט התיקון שבוצע *</label>
              <Textarea
                value={resolutionNotes}
                onChange={e => setResolutionNotes(e.target.value)}
                rows={3}
                placeholder="תאר את התיקון שבוצע..."
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setResolveDialog(null)} className="flex-1">ביטול</Button>
              <Button onClick={confirmResolve} className="flex-1" disabled={!resolutionNotes.trim()}>
                <CheckCircle2 size={16} className="mr-2" /> אשר סגירה
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTask} onOpenChange={(open) => { if (!open) setDeleteTask(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת ליקוי</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את הליקוי "{deleteTask?.title}" ברכב {deleteTask?.vehicle_plate}? פעולה זו לא ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
