import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Clock, CheckCircle2, History } from 'lucide-react';
import { toast } from 'sonner';

type Status = 'open' | 'in_treatment' | 'resolved';

const STATUS_LABEL: Record<Status, string> = {
  open: 'פתוח',
  in_treatment: 'בטיפול',
  resolved: 'טופל',
};

const STATUS_ICON: Record<Status, JSX.Element> = {
  open: <AlertTriangle size={14} className="text-destructive" />,
  in_treatment: <Clock size={14} className="text-warning" />,
  resolved: <CheckCircle2 size={14} className="text-success" />,
};

interface TrackingRow {
  id: string;
  gap_key: string;
  status: Status;
  notes: string | null;
  updated_at: string;
}

interface HistoryRow {
  id: string;
  old_status: string | null;
  new_status: string;
  notes: string | null;
  changed_by_name: string | null;
  created_at: string;
}

interface Props {
  entityType: 'vehicle' | 'driver';
  entityId: string;
  companyName: string;
  gaps: string[]; // current detected missing gaps
}

export default function InfoGapTracker({ entityType, entityId, companyName, gaps }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<TrackingRow[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const load = async () => {
    const { data } = await supabase
      .from('info_gap_tracking')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId);
    if (data) setRows(data as TrackingRow[]);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, entityType]);

  // Auto-create tracking rows for new gaps
  useEffect(() => {
    if (!isManager || gaps.length === 0) return;
    const existing = new Set(rows.map(r => r.gap_key));
    const toCreate = gaps.filter(g => !existing.has(g));
    if (toCreate.length === 0) return;
    (async () => {
      const inserts = toCreate.map(g => ({
        entity_type: entityType,
        entity_id: entityId,
        gap_key: g,
        status: 'open' as Status,
        company_name: companyName,
        created_by: user?.id,
        updated_by: user?.id,
      }));
      const { error } = await supabase.from('info_gap_tracking').insert(inserts);
      if (!error) load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaps.join('|'), rows.length]);

  const updateStatus = async (row: TrackingRow, status: Status) => {
    const { error } = await supabase
      .from('info_gap_tracking')
      .update({ status, updated_by: user?.id })
      .eq('id', row.id);
    if (error) {
      toast.error('שגיאה בעדכון סטטוס');
      return;
    }
    toast.success('הסטטוס עודכן');
    load();
  };

  const loadHistory = async (rowId: string) => {
    if (openHistory === rowId) {
      setOpenHistory(null);
      return;
    }
    const { data } = await supabase
      .from('info_gap_history')
      .select('*')
      .eq('tracking_id', rowId)
      .order('created_at', { ascending: false });
    setHistory(h => ({ ...h, [rowId]: (data || []) as HistoryRow[] }));
    setOpenHistory(rowId);
  };

  // Show all rows that are still open/in_treatment OR are currently detected
  const visibleRows = rows.filter(r => r.status !== 'resolved' || gaps.includes(r.gap_key));

  if (visibleRows.length === 0) return null;

  return (
    <div className="mb-4 p-4 rounded-xl bg-destructive/10 border-2 border-destructive/30">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={20} className="text-destructive" />
        <h3 className="font-bold text-destructive">חוסרים ומעקב טיפול</h3>
      </div>
      <div className="space-y-2">
        {visibleRows.map(row => (
          <div key={row.id} className="rounded-lg bg-background/50 border border-border p-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {STATUS_ICON[row.status]}
                <span className="font-medium">{row.gap_key}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                  {STATUS_LABEL[row.status]}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isManager && (['open', 'in_treatment', 'resolved'] as Status[]).map(s => (
                  <button
                    key={s}
                    onClick={() => updateStatus(row, s)}
                    disabled={row.status === s}
                    className={`text-xs px-2 py-1 rounded-md transition-colors ${
                      row.status === s
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/70'
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
                <button
                  onClick={() => loadHistory(row.id)}
                  className="p-1.5 rounded-md bg-muted hover:bg-muted/70"
                  title="היסטוריה"
                >
                  <History size={14} />
                </button>
              </div>
            </div>
            {openHistory === row.id && history[row.id] && (
              <div className="mt-2 pt-2 border-t border-border space-y-1">
                {history[row.id].length === 0 && (
                  <p className="text-xs text-muted-foreground">אין היסטוריה</p>
                )}
                {history[row.id].map(h => (
                  <div key={h.id} className="text-xs text-muted-foreground">
                    <span className="font-medium">
                      {h.old_status ? `${STATUS_LABEL[h.old_status as Status] || h.old_status} → ` : ''}
                      {STATUS_LABEL[h.new_status as Status] || h.new_status}
                    </span>
                    {' • '}
                    {h.changed_by_name || 'מערכת'}
                    {' • '}
                    {new Date(h.created_at).toLocaleDateString('he-IL')}{' '}
                    {new Date(h.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
