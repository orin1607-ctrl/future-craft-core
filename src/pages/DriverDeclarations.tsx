import { useState, useEffect } from 'react';
import { FileText, Search, Check, Clock, AlertTriangle, Download, Printer, Pencil, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { exportToCsv } from '@/utils/exportCsv';
import { printDeclaration } from '@/utils/printDeclaration';
import { canManageDeclarationTemplates } from '@/utils/declarationTemplates';
import { normalizeTemplateCompanyName } from '@/services/declarationTemplatesApi';
import DeclarationTemplateManager from '@/components/DeclarationTemplateManager';
import DeclarationPreviewModal from '@/components/DeclarationPreviewModal';
import { ResolvedStorageImg } from '@/components/documents/DocumentViewer';

interface DeclarationRow {
  id: string;
  driver_id: string;
  driver_name: string;
  id_number: string | null;
  license_number: string | null;
  company_name: string | null;
  declaration_text?: string | null;
  status: string;
  signed_at: string | null;
  signature_url: string | null;
  expires_at: string | null;
  sent_via: string | null;
  created_at: string;
}

export default function DriverDeclarations() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [declarations, setDeclarations] = useState<DeclarationRow[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);
  const [previewDeclaration, setPreviewDeclaration] = useState<DeclarationRow | null>(null);
  const canManageTemplates = canManageDeclarationTemplates(user?.role);
  const templateCompany = normalizeTemplateCompanyName(companyFilter || user?.company_name || '');

  const loadData = async () => {
    setLoading(true);
    const { data } = await applyCompanyScope(
      supabase.from('driver_declarations').select('*'),
      companyFilter
    ).order('created_at', { ascending: false });
    if (data) setDeclarations(data as DeclarationRow[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const getEffectiveStatus = (d: DeclarationRow) => {
    if (d.status === 'signed' && d.expires_at && new Date(d.expires_at) < new Date()) return 'expired';
    return d.status;
  };

  const filtered = declarations.filter(d => {
    const matchSearch = !search || d.driver_name?.includes(search) || d.id_number?.includes(search);
    const effective = getEffectiveStatus(d);
    const matchStatus = statusFilter === 'all' || effective === statusFilter;
    return matchSearch && matchStatus;
  });

  const counts = {
    all: declarations.length,
    pending: declarations.filter(d => d.status === 'pending').length,
    signed: declarations.filter(d => d.status === 'signed' && (!d.expires_at || new Date(d.expires_at) >= new Date())).length,
    expired: declarations.filter(d => d.status === 'signed' && d.expires_at && new Date(d.expires_at) < new Date()).length,
  };

  const getStatusBadge = (d: DeclarationRow) => {
    const effective = getEffectiveStatus(d);
    if (effective === 'expired') return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-destructive/10 text-destructive text-sm font-bold"><AlertTriangle size={14} /> פג תוקף</span>;
    if (effective === 'signed') return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-success/10 text-success text-sm font-bold"><Check size={14} /> נחתם</span>;
    return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-warning/10 text-warning text-sm font-bold"><Clock size={14} /> ממתין</span>;
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h1 className="page-header mb-0 flex items-center gap-2"><FileText size={28} /> תצהירי נהגים</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {canManageTemplates && (
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm font-bold min-h-[48px]"
            >
              <Pencil size={18} /> תבניות תצהיר
            </button>
          )}
          <button onClick={() => exportToCsv('declarations', [
            { key: 'driver_name', label: 'שם נהג' },
            { key: 'id_number', label: 'ת.ז' },
            { key: 'status', label: 'סטטוס' },
            { key: 'signed_at', label: 'תאריך חתימה' },
            { key: 'expires_at', label: 'תוקף עד' },
            { key: 'company_name', label: 'חברה' },
          ], filtered)} className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm font-bold min-h-[48px]">
            <Download size={18} /> ייצוא
          </button>
        </div>
      </div>

      {canManageTemplates && showTemplates && (
        <div className="mb-4">
          <DeclarationTemplateManager companyName={templateCompany} />
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם נהג או ת.ז..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: 'all', label: 'הכל', count: counts.all },
          { key: 'pending', label: 'ממתין', count: counts.pending },
          { key: 'signed', label: 'נחתם', count: counts.signed },
          { key: 'expired', label: 'פג תוקף', count: counts.expired },
        ].map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${statusFilter === f.key ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין תצהירים</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => (
            <div key={d.id} className="card-elevated p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-lg font-bold">{d.driver_name}</p>
                  <p className="text-sm text-muted-foreground">ת.ז: {d.id_number || '—'} | {d.company_name}</p>
                </div>
                {getStatusBadge(d)}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <span>נוצר: {new Date(d.created_at).toLocaleDateString('he-IL')}</span>
                {d.signed_at && <span>נחתם: {new Date(d.signed_at).toLocaleDateString('he-IL')}</span>}
                {d.expires_at && <span>תוקף עד: {new Date(d.expires_at).toLocaleDateString('he-IL')}</span>}
              </div>
              {d.signature_url && (
                <ResolvedStorageImg url={d.signature_url} alt="חתימה" className="h-12 mt-2 rounded border border-border bg-white p-1" />
              )}
              <div className="mt-3 flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPreviewDeclaration(d)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-muted text-foreground text-sm font-bold"
                  title="תצוגה מקדימה — כך ייראה התצהיר לנהג"
                >
                  <Eye size={16} /> תצוגה מקדימה
                </button>
                {d.status === 'signed' && (
                  <button
                    onClick={() => printDeclaration(d as any)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold"
                  >
                    <Printer size={16} /> הדפס / שמור PDF
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewDeclaration && (
        <DeclarationPreviewModal
          declaration={previewDeclaration}
          onClose={() => setPreviewDeclaration(null)}
        />
      )}
    </div>
  );
}
