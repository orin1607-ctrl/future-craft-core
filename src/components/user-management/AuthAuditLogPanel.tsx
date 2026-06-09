import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ScrollText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AUTH_AUDIT_COLORS, AUTH_AUDIT_LABELS } from '@/lib/authAuditLabels';

interface AuditRow {
  id: string;
  event_type: string;
  success: boolean;
  email: string | null;
  ip_address: string | null;
  created_at: string;
  details: Record<string, unknown>;
}

const EVENT_FILTER_OPTIONS = Object.keys(AUTH_AUDIT_LABELS);

export default function AuthAuditLogPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState('all');

  useEffect(() => {
    loadLogs();
  }, [eventFilter]);

  const loadLogs = async () => {
    setLoading(true);
    let query = supabase
      .from('auth_audit_log' as 'profiles')
      .select('id, event_type, success, email, ip_address, created_at, details')
      .order('created_at', { ascending: false })
      .limit(100);

    if (eventFilter !== 'all') {
      query = query.eq('event_type', eventFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setRows(data as unknown as AuditRow[]);
    }
    setLoading(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold flex items-center gap-2">
          <ScrollText size={18} className="text-primary" />
          Audit Log — Auth
        </h3>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="סוג אירוע" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל האירועים</SelectItem>
            {EVENT_FILTER_OPTIONS.map((ev) => (
              <SelectItem key={ev} value={ev}>{AUTH_AUDIT_LABELS[ev]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>תאריך</TableHead>
                <TableHead>אירוע</TableHead>
                <TableHead>אימייל</TableHead>
                <TableHead>הצלחה</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    אין רשומות עדיין
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString('he-IL')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={AUTH_AUDIT_COLORS[row.event_type] || ''}>
                        {AUTH_AUDIT_LABELS[row.event_type] || row.event_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs" dir="ltr">{row.email || '—'}</TableCell>
                    <TableCell>{row.success ? '✅' : '❌'}</TableCell>
                    <TableCell className="text-xs">{row.ip_address || '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
