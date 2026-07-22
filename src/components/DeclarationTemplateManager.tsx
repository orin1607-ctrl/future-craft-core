import { useEffect, useState } from 'react';
import {
  Check,
  Pencil,
  Plus,
  Star,
  Trash2,
  X,
  FileText,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  DECLARATION_PLACEHOLDERS,
  DEFAULT_DECLARATION_BODY,
  canManageDeclarationTemplates,
  type DeclarationTemplate,
} from '@/utils/declarationTemplates';
import {
  createDeclarationTemplate,
  deleteDeclarationTemplate,
  ensureDefaultDeclarationTemplate,
  listDeclarationTemplates,
  setDefaultDeclarationTemplate,
  updateDeclarationTemplate,
} from '@/services/declarationTemplatesApi';

interface DeclarationTemplateManagerProps {
  companyName: string;
  /** Compact embed next to driver declaration area */
  compact?: boolean;
  onDefaultChange?: (template: DeclarationTemplate) => void;
}

export default function DeclarationTemplateManager({
  companyName,
  compact = false,
  onDefaultChange,
}: DeclarationTemplateManagerProps) {
  const { user } = useAuth();
  const canManage = canManageDeclarationTemplates(user?.role);
  const [templates, setTemplates] = useState<DeclarationTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState('');
  const [draftName, setDraftName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const selected = templates.find((t) => t.id === selectedId) || templates.find((t) => t.is_default) || templates[0] || null;

  const load = async () => {
    if (!companyName || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await ensureDefaultDeclarationTemplate(companyName, user?.id);
      const rows = await listDeclarationTemplates(companyName);
      setTemplates(rows);
      const def = rows.find((t) => t.is_default) || rows[0] || null;
      setSelectedId((prev) => {
        if (prev && rows.some((t) => t.id === prev)) return prev;
        return def?.id ?? null;
      });
      if (def) onDefaultChange?.(def);
    } catch (e: any) {
      console.error(e);
      toast.error('שגיאה בטעינת תבניות תצהיר: ' + (e?.message || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyName, canManage]);

  useEffect(() => {
    if (selected && !editing && !renaming) {
      setDraftBody(selected.body);
      setDraftName(selected.name);
    }
  }, [selected?.id, selected?.body, selected?.name, editing, renaming]);

  if (!canManage) return null;
  if (!companyName) {
    return (
      <div className="p-3 rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
        יש לבחור חברה כדי לנהל תבניות תצהיר
      </div>
    );
  }

  const startEdit = () => {
    if (!selected) return;
    setDraftBody(selected.body);
    setEditing(true);
    setRenaming(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftBody(selected?.body || '');
  };

  const saveEdit = async () => {
    if (!selected) return;
    if (!draftBody.trim()) {
      toast.error('נוסח התצהיר לא יכול להיות ריק');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateDeclarationTemplate(selected.id, { body: draftBody });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditing(false);
      toast.success('התצהיר נשמר');
      if (updated.is_default) onDefaultChange?.(updated);
    } catch (e: any) {
      console.error(e);
      toast.error('שגיאה בשמירה: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const saveRename = async () => {
    if (!selected) return;
    if (!draftName.trim()) {
      toast.error('שם התבנית לא יכול להיות ריק');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateDeclarationTemplate(selected.id, { name: draftName.trim() });
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setRenaming(false);
      toast.success('שם התבנית עודכן');
    } catch (e: any) {
      console.error(e);
      toast.error('שגיאה בשינוי שם: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const base = selected?.body || DEFAULT_DECLARATION_BODY;
      const name = `תבנית חדשה ${templates.length + 1}`;
      const created = await createDeclarationTemplate({
        companyName,
        name,
        body: base,
        isDefault: templates.length === 0,
        createdBy: user?.id,
      });
      const rows = await listDeclarationTemplates(companyName);
      setTemplates(rows);
      setSelectedId(created.id);
      setDraftBody(created.body);
      setDraftName(created.name);
      setEditing(true);
      setRenaming(false);
      toast.success('תבנית חדשה נוצרה');
    } catch (e: any) {
      console.error(e);
      toast.error('שגיאה ביצירת תבנית: ' + (e?.message || ''));
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async () => {
    if (!selected) return;
    setCreating(true);
    try {
      const created = await createDeclarationTemplate({
        companyName,
        name: `${selected.name} (עותק)`,
        body: selected.body,
        createdBy: user?.id,
      });
      const rows = await listDeclarationTemplates(companyName);
      setTemplates(rows);
      setSelectedId(created.id);
      toast.success('התבנית שוכפלה');
    } catch (e: any) {
      console.error(e);
      toast.error('שגיאה בשכפול: ' + (e?.message || ''));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (selected.is_default && templates.length > 1) {
      toast.error('לא ניתן למחוק את תבנית ברירת המחדל. בחרו תבנית אחרת כברירת מחדל תחילה.');
      return;
    }
    if (templates.length <= 1) {
      toast.error('חייבת להישאר לפחות תבנית אחת');
      return;
    }
    if (!confirm(`למחוק את התבנית "${selected.name}"?`)) return;
    try {
      await deleteDeclarationTemplate(selected.id);
      const rows = await listDeclarationTemplates(companyName);
      setTemplates(rows);
      const next = rows.find((t) => t.is_default) || rows[0] || null;
      setSelectedId(next?.id ?? null);
      setEditing(false);
      toast.success('התבנית נמחקה');
      if (next) onDefaultChange?.(next);
    } catch (e: any) {
      console.error(e);
      toast.error('שגיאה במחיקה: ' + (e?.message || ''));
    }
  };

  const handleSetDefault = async () => {
    if (!selected || selected.is_default) return;
    try {
      const updated = await setDefaultDeclarationTemplate(selected.id, companyName);
      const rows = await listDeclarationTemplates(companyName);
      setTemplates(rows);
      toast.success(`"${updated.name}" הוגדרה כברירת מחדל`);
      onDefaultChange?.(updated);
    } catch (e: any) {
      console.error(e);
      toast.error('שגיאה בהגדרת ברירת מחדל: ' + (e?.message || ''));
    }
  };

  const insertPlaceholder = (key: string) => {
    const token = `{{${key}}}`;
    setDraftBody((prev) => (prev ? `${prev}${prev.endsWith('\n') ? '' : '\n'}${token}` : token));
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-2">טוען תבניות...</div>;
  }

  return (
    <div className={`rounded-xl border border-border bg-card ${compact ? 'p-3 space-y-3' : 'p-4 space-y-4'}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="font-bold flex items-center gap-2 text-base">
          <FileText size={18} /> ניהול תבניות תצהיר
        </h4>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || editing}
          className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1 disabled:opacity-50"
        >
          <Plus size={14} /> תבנית חדשה
        </button>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <label className="text-sm text-muted-foreground">תבנית:</label>
        <select
          value={selected?.id || ''}
          disabled={editing || renaming}
          onChange={(e) => {
            setSelectedId(e.target.value);
            setEditing(false);
            setRenaming(false);
          }}
          className="flex-1 min-w-[160px] p-2 rounded-xl border border-input bg-background text-sm font-medium"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}{t.is_default ? ' ★' : ''}
            </option>
          ))}
        </select>
        {selected?.is_default && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold">
            <Star size={12} /> ברירת מחדל
          </span>
        )}
      </div>

      {selected && (
        <div className="flex gap-2 flex-wrap">
          {!editing && !renaming && (
            <>
              <button
                type="button"
                onClick={startEdit}
                className="px-3 py-2 rounded-xl bg-muted text-foreground text-sm font-bold flex items-center gap-1"
                title="עריכת נוסח"
              >
                <Pencil size={14} /> עריכה
              </button>
              <button
                type="button"
                onClick={() => { setDraftName(selected.name); setRenaming(true); }}
                className="px-3 py-2 rounded-xl bg-muted text-foreground text-sm font-bold"
              >
                שינוי שם
              </button>
              {!selected.is_default && (
                <button
                  type="button"
                  onClick={handleSetDefault}
                  className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold flex items-center gap-1"
                >
                  <Star size={14} /> הגדר כברירת מחדל
                </button>
              )}
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={creating}
                className="px-3 py-2 rounded-xl bg-muted text-foreground text-sm font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <Copy size={14} /> שכפל
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-3 py-2 rounded-xl bg-destructive/10 text-destructive text-sm font-bold flex items-center gap-1"
              >
                <Trash2 size={14} /> מחיקה
              </button>
            </>
          )}
        </div>
      )}

      {renaming && selected && (
        <div className="space-y-2">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className="w-full p-3 rounded-xl border-2 border-input bg-background text-base focus:border-primary focus:outline-none"
            placeholder="שם התבנית"
            dir="rtl"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveRename}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1 disabled:opacity-50"
            >
              <Check size={14} /> שמור
            </button>
            <button
              type="button"
              onClick={() => { setRenaming(false); setDraftName(selected.name); }}
              className="px-4 py-2 rounded-xl bg-muted text-foreground text-sm font-bold flex items-center gap-1"
            >
              <X size={14} /> ביטול
            </button>
          </div>
        </div>
      )}

      {selected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">נוסח התצהיר</p>
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                className="p-2 rounded-lg hover:bg-muted text-primary"
                title="עריכת נוסח התצהיר"
                aria-label="עריכת נוסח התצהיר"
              >
                <Pencil size={18} />
              </button>
            )}
          </div>

          {editing ? (
            <div className="space-y-2">
              <div className="flex gap-1 flex-wrap">
                {DECLARATION_PLACEHOLDERS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => insertPlaceholder(p.key)}
                    className="px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted"
                    title={`הוסף {{${p.key}}}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                rows={compact ? 10 : 14}
                dir="rtl"
                className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm leading-7 focus:border-primary focus:outline-none resize-y font-inherit"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  <Check size={14} /> שמור
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-muted text-foreground text-sm font-bold flex items-center gap-1"
                >
                  <X size={14} /> ביטול
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl border border-border bg-muted/30 text-sm leading-7 whitespace-pre-line" dir="rtl">
              {selected.body}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
