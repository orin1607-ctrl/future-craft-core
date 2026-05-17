
import { CheckCircle, Calendar, Rocket, Plus, Clock, ArrowLeftRight, Pencil } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Link, Navigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DevTask {
  id: string;
  task_number: number;
  summary: string;
  clarification: string;
  status: string;
  priority: string;
  size: string;
  created_at: string;
  completed_at: string | null;
  edited_at: string | null;
}

const priorityConfig: Record<string, { label: string; color: string; icon: string }> = {
  low: { label: 'נמוכה', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', icon: '🟢' },
  medium: { label: 'בינונית', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400', icon: '🟡' },
  high: { label: 'גבוהה', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400', icon: '🟠' },
  critical: { label: 'קריטית', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400', icon: '🔴' },
};

const sizeConfig: Record<string, { label: string; color: string; hours: string }> = {
  S: { label: 'S', color: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/40 dark:text-sky-400 dark:border-sky-700', hours: '~1-2 שעות' },
  M: { label: 'M', color: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-400 dark:border-violet-700', hours: '~3-5 שעות' },
  L: { label: 'L', color: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/40 dark:text-rose-400 dark:border-rose-700', hours: '~יום עבודה+' },
};

const CompletedTasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSummary, setNewSummary] = useState('');
  const [newClarification, setNewClarification] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newSize, setNewSize] = useState('M');
  const [submitting, setSubmitting] = useState(false);
  const [editingTask, setEditingTask] = useState<DevTask | null>(null);
  const [editSummary, setEditSummary] = useState('');
  const [editClarification, setEditClarification] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editSize, setEditSize] = useState('M');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const fetchTasks = async () => {
    const { data, error } = await supabase
      .from('dev_tasks')
      .select('*')
      .order('task_number', { ascending: true });
    if (!error && data) {
      setTasks(data as unknown as DevTask[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, []);

  if (!user || (user.role !== 'super_admin' && user.role !== 'fleet_manager')) {
    return <Navigate to="/dashboard" replace />;
  }

  const pendingTasks = tasks
    .filter(t => t.status === 'pending')
    .sort((a, b) => b.task_number - a.task_number);
  const completedTasks = tasks
    .filter(t => t.status === 'completed')
    .sort((a, b) => b.task_number - a.task_number);
  const recentTasks = [...tasks]
    .sort((a, b) => {
      const aDate = a.completed_at || a.edited_at || a.created_at;
      const bDate = b.completed_at || b.edited_at || b.created_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    })
    .slice(0, 10);

  const handleAddTask = async () => {
    if (!newSummary.trim()) {
      toast.error('יש למלא תיאור משימה');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('dev_tasks').insert({
      summary: newSummary.trim(),
      clarification: newClarification.trim(),
      priority: newPriority,
      size: newSize,
      status: 'pending',
      created_by: user.id,
    } as any);
    if (error) {
      toast.error('שגיאה בשמירה');
    } else {
      toast.success('המשימה נוספה בהצלחה');
      setNewSummary('');
      setNewClarification('');
      setNewPriority('medium');
      setNewSize('M');
      fetchTasks();
    }
    setSubmitting(false);
  };

  const handleMarkCompleted = async (task: DevTask) => {
    const { error } = await supabase
      .from('dev_tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() } as any)
      .eq('id', task.id);
    if (!error) {
      toast.success(`משימה #${task.task_number} סומנה כבוצעה`);
      fetchTasks();
    }
  };

  const handleMarkPending = async (task: DevTask) => {
    const { error } = await supabase
      .from('dev_tasks')
      .update({ status: 'pending', completed_at: null } as any)
      .eq('id', task.id);
    if (!error) {
      toast.success(`משימה #${task.task_number} הוחזרה לביצוע`);
      fetchTasks();
    }
  };

  const openEditDialog = (task: DevTask) => {
    setEditingTask(task);
    setEditSummary(task.summary);
    setEditClarification(task.clarification || '');
    setEditPriority(task.priority);
    setEditSize(task.size);
  };

  const handleEditTask = async () => {
    if (!editingTask || !editSummary.trim()) {
      toast.error('יש למלא תיאור משימה');
      return;
    }
    setEditSubmitting(true);
    const { error } = await supabase
      .from('dev_tasks')
      .update({
        summary: editSummary.trim(),
        clarification: editClarification.trim(),
        priority: editPriority,
        size: editSize,
        edited_at: new Date().toISOString(),
      } as any)
      .eq('id', editingTask.id);
    if (error) {
      toast.error('שגיאה בעדכון');
    } else {
      toast.success(`משימה #${editingTask.task_number} עודכנה`);
      setEditingTask(null);
      fetchTasks();
    }
    setEditSubmitting(false);
  };

  const PriorityBadge = ({ priority }: { priority: string }) => {
    const cfg = priorityConfig[priority] || priorityConfig.medium;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.icon} {cfg.label}</span>;
  };

  const SizeBadge = ({ size }: { size: string }) => {
    const cfg = sizeConfig[size] || sizeConfig.M;
    return <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] leading-none font-bold border ${cfg.color}`}>{cfg.label}</span>;
  };

  const extractRoutes = (text: string) => {
    const matches = text.match(/\/[a-zA-Z0-9\-_/?:=&]*/g) || [];
    return [...new Set(matches.filter(Boolean))];
  };

  const renderClarification = (clarification: string) => {
    const lines = clarification.split('\n').map(line => line.trim()).filter(Boolean);
    const routes = extractRoutes(clarification);

    return (
      <div className="mt-2 space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
        {lines.map((line, index) => (
          <p key={`${line}-${index}`} className="text-xs text-muted-foreground leading-5 whitespace-pre-wrap">
            {line}
          </p>
        ))}

        {routes.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {routes.map((route) => (
              <Link
                key={route}
                to={route}
                className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-accent"
              >
                פתח {route}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  const TaskTable = ({ items, showComplete }: { items: DevTask[]; showComplete: boolean }) => (
    <div className="border border-border rounded-lg overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted">
            <th className="text-right p-3 font-semibold w-8">#</th>
            <th className="text-center p-3 font-semibold w-10">גודל</th>
            <th className="text-center p-3 font-semibold w-24">דחיפות</th>
            <th className="text-right p-3 font-semibold w-28">
              <div className="flex items-center gap-1"><Calendar size={14} />תאריך</div>
            </th>
            <th className="text-right p-3 font-semibold">תיאור המשימה</th>
            <th className="text-center p-3 font-semibold w-16">סטטוס</th>
            {isSuperAdmin && <th className="text-center p-3 font-semibold w-28">פעולה</th>}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={isSuperAdmin ? 7 : 6} className="p-8 text-center text-muted-foreground">אין משימות</td></tr>
          )}
          {items.map((task, i) => (
            <tr key={task.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
              <td className="p-3 text-muted-foreground">{task.task_number}</td>
              <td className="p-3 text-center"><SizeBadge size={task.size} /></td>
              <td className="p-3 text-center"><PriorityBadge priority={task.priority} /></td>
              <td className="p-3 text-muted-foreground font-mono text-xs">
                {task.created_at?.split('T')[0]}
              </td>
              <td className="p-3">
                <div className="flex items-center gap-2">
                  <p>{task.summary}</p>
                  {task.edited_at && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-accent text-accent-foreground text-[10px] font-medium whitespace-nowrap">✏️ נערך</span>
                  )}
                </div>
                {task.clarification && renderClarification(task.clarification)}
              </td>
              <td className="p-3 text-center">
                {task.status === 'completed'
                  ? <CheckCircle className="text-green-500 h-4 w-4 mx-auto" />
                  : <Clock className="text-amber-500 h-4 w-4 mx-auto" />
                }
              </td>
              {isSuperAdmin && (
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button size="sm" variant="ghost" className="text-xs h-7 w-7 p-0" onClick={() => openEditDialog(task)} title="ערוך">
                      <Pencil size={12} />
                    </Button>
                    {showComplete ? (
                      <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => handleMarkCompleted(task)}>
                        <CheckCircle size={12} /> בוצע
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={() => handleMarkPending(task)}>
                        <ArrowLeftRight size={12} /> החזר
                      </Button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (loading) return <div className="flex justify-center py-20 text-muted-foreground">טוען...</div>;

  return (
    <div dir="rtl" className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
          <Rocket className="text-primary" size={28} />
          משימות פיתוח תוכנה
        </h1>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <Clock size={12} className="text-amber-500" />
            {pendingTasks.length} לביצוע
          </Badge>
          <Badge variant="outline" className="gap-1">
            <CheckCircle size={12} className="text-green-500" />
            {completedTasks.length} בוצעו
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="recent" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="recent" className="gap-1.5">
            🕒 אחרונות ({recentTasks.length})
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            <Clock size={14} />
            משימות לביצוע ({pendingTasks.length})
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            <CheckCircle size={14} />
            משימות שבוצעו ({completedTasks.length})
          </TabsTrigger>
          <TabsTrigger value="add" className="gap-1.5">
            <Plus size={14} />
            הוספת משימה
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recent">
          <TaskTable items={recentTasks} showComplete={true} />
        </TabsContent>

        <TabsContent value="pending">
          <TaskTable items={pendingTasks} showComplete={true} />
        </TabsContent>

        <TabsContent value="completed">
          <TaskTable items={completedTasks} showComplete={false} />
        </TabsContent>

        <TabsContent value="add">
          <div className="border border-border rounded-lg p-6 bg-card space-y-4 max-w-2xl">
            <h2 className="text-lg font-semibold">הוספת משימה חדשה</h2>
            <p className="text-sm text-muted-foreground">המשימה תקבל מספור אוטומטי ותופיע בחוצץ "משימות לביצוע"</p>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">תיאור המשימה</label>
              <Input
                placeholder="לדוגמה: תיקון באג בדף הגדרות..."
                value={newSummary}
                onChange={(e) => setNewSummary(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">הבהרה (אופציונלי)</label>
              <Textarea
                placeholder="פרטים נוספים, הקשר, דרישות..."
                value={newClarification}
                onChange={(e) => setNewClarification(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">דחיפות</label>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🟢 נמוכה</SelectItem>
                    <SelectItem value="medium">🟡 בינונית</SelectItem>
                    <SelectItem value="high">🟠 גבוהה</SelectItem>
                    <SelectItem value="critical">🔴 קריטית</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">גודל משימה</label>
                <RadioGroup value={newSize} onValueChange={setNewSize} className="flex gap-3">
                  {Object.entries(sizeConfig).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <RadioGroupItem value={key} id={`size-${key}`} />
                      <Label htmlFor={`size-${key}`} className="cursor-pointer text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-muted-foreground text-xs mr-1">{cfg.hours}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
            <Button onClick={handleAddTask} disabled={submitting} className="gap-1.5">
              <Plus size={16} />
              {submitting ? 'שומר...' : 'הוסף משימה'}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(open) => !open && setEditingTask(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת משימה #{editingTask?.task_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">תיאור המשימה</label>
              <Input value={editSummary} onChange={(e) => setEditSummary(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">הבהרה</label>
              <Textarea value={editClarification} onChange={(e) => setEditClarification(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">דחיפות</label>
                <Select value={editPriority} onValueChange={setEditPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🟢 נמוכה</SelectItem>
                    <SelectItem value="medium">🟡 בינונית</SelectItem>
                    <SelectItem value="high">🟠 גבוהה</SelectItem>
                    <SelectItem value="critical">🔴 קריטית</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">גודל</label>
                <RadioGroup value={editSize} onValueChange={setEditSize} className="flex gap-3">
                  {Object.entries(sizeConfig).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <RadioGroupItem value={key} id={`edit-size-${key}`} />
                      <Label htmlFor={`edit-size-${key}`} className="cursor-pointer text-sm">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingTask(null)}>ביטול</Button>
              <Button onClick={handleEditTask} disabled={editSubmitting}>
                {editSubmitting ? 'שומר...' : 'שמור שינויים'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <footer className="text-center text-muted-foreground text-sm py-8 border-t border-border mt-8">
        מסמך זה נוצר אוטומטית | {new Date().toLocaleDateString('he-IL')}
      </footer>
    </div>
  );
};

export default CompletedTasks;
