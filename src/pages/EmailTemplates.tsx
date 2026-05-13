import { useState } from 'react';
import { Mail, Save, Eye, Edit3, RotateCcw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  variables: string[];
}

const DEFAULT_TEMPLATES: EmailTemplate[] = [
  {
    id: 'fault_new',
    name: 'תקלה חדשה',
    subject: 'תקלה חדשה דווחה - רכב {{vehicle_plate}}',
    body: 'שלום {{manager_name}},\n\nנהג {{driver_name}} דיווח על תקלה חדשה ברכב {{vehicle_plate}}.\n\nסוג תקלה: {{fault_type}}\nתיאור: {{description}}\nדחיפות: {{urgency}}\n\nיש לטפל בהקדם.\n\nבברכה,\nמערכת דליה',
    category: 'מעקב רכב',
    variables: ['manager_name', 'driver_name', 'vehicle_plate', 'fault_type', 'description', 'urgency'],
  },
  {
    id: 'service_order_new',
    name: 'קריאת שירות ותחזוקה חדשה',
    subject: 'קריאת שירות ותחזוקה חדשה - רכב {{vehicle_plate}}',
    body: 'שלום {{manager_name}},\n\nקריאת שירות ותחזוקה חדשה נפתחה עבור רכב {{vehicle_plate}}.\n\nסוג שירות: {{service_category}}\nתיאור: {{description}}\nספק: {{vendor_name}}\nתאריך: {{service_date}}\n\nבברכה,\nמערכת דליה',
    category: 'שירותים ותחזוקה',
    variables: ['manager_name', 'vehicle_plate', 'service_category', 'description', 'vendor_name', 'service_date'],
  },
  {
    id: 'accident_report',
    name: 'דיווח תאונה',
    subject: '🚨 דיווח תאונה - רכב {{vehicle_plate}}',
    body: 'שלום {{manager_name}},\n\nדיווח תאונה חדש:\n\nנהג: {{driver_name}}\nרכב: {{vehicle_plate}}\nמיקום: {{location}}\nתיאור: {{description}}\n\nנא לבדוק ולעדכן סטטוס.\n\nבברכה,\nמערכת דליה',
    category: 'תאונות',
    variables: ['manager_name', 'driver_name', 'vehicle_plate', 'location', 'description'],
  },
  {
    id: 'expiry_reminder',
    name: 'תזכורת תפוגה',
    subject: 'תזכורת: {{expiry_type}} עומד לפוג - {{vehicle_plate}}',
    body: 'שלום {{manager_name}},\n\nתזכורת: ה{{expiry_type}} של רכב {{vehicle_plate}} עומד לפוג בעוד {{days_left}} ימים ({{expiry_date}}).\n\nנא לטפל בחידוש בהקדם.\n\nבברכה,\nמערכת דליה',
    category: 'התראות',
    variables: ['manager_name', 'vehicle_plate', 'expiry_type', 'days_left', 'expiry_date'],
  },
  {
    id: 'work_assignment',
    name: 'סידור עבודה חדש',
    subject: 'סידור עבודה חדש - {{title}}',
    body: 'שלום {{driver_name}},\n\nשובצת לסידור עבודה חדש:\n\nכותרת: {{title}}\nתאריך: {{scheduled_date}}\nשעה: {{scheduled_time}}\nמיקום: {{location}}\n\nנא לאשר קבלה.\n\nבברכה,\nמערכת דליה',
    category: 'סידורי עבודה',
    variables: ['driver_name', 'title', 'scheduled_date', 'scheduled_time', 'location'],
  },
];

export default function EmailTemplates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>(DEFAULT_TEMPLATES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const isSuperAdmin = user?.role === 'super_admin';

  if (!isSuperAdmin) {
    return (
      <div className="animate-fade-in text-center py-16">
        <Mail size={48} className="mx-auto mb-4 text-muted-foreground opacity-50" />
        <p className="text-xl text-muted-foreground">אין הרשאה — דף זה זמין למנהלי על בלבד</p>
      </div>
    );
  }

  const updateTemplate = (id: string, field: keyof EmailTemplate, value: string) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const saveTemplate = (_id: string) => {
    toast.success('התבנית נשמרה בהצלחה');
    setEditingId(null);
  };

  const resetTemplate = (id: string) => {
    const original = DEFAULT_TEMPLATES.find(t => t.id === id);
    if (original) {
      setTemplates(prev => prev.map(t => t.id === id ? { ...original } : t));
      toast.success('התבנית אופסה לברירת מחדל');
    }
  };

  const renderPreview = (template: EmailTemplate) => {
    const sampleValues: Record<string, string> = {
      manager_name: 'ישראל ישראלי',
      driver_name: 'משה כהן',
      vehicle_plate: '12-345-67',
      fault_type: 'צמיג תקוע',
      description: 'הצמיג הקדמי ימני תקוע',
      urgency: 'דחוף',
      service_category: 'טיפול שוטף',
      vendor_name: 'מוסך דליה',
      service_date: '15/03/2026',
      location: 'צומת מגידו',
      expiry_type: 'ביטוח חובה',
      days_left: '7',
      expiry_date: '22/03/2026',
      title: 'הסעת בוקר קו 5',
      scheduled_date: '15/03/2026',
      scheduled_time: '07:00',
    };

    let preview = template.body;
    Object.entries(sampleValues).forEach(([key, val]) => {
      preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    });
    return preview;
  };

  const categories = [...new Set(templates.map(t => t.category))];

  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="page-header flex items-center gap-3"><Mail size={28} /> תבניות מייל והודעות</h1>
      <p className="text-muted-foreground">ניהול תבניות הודעות אוטומטיות — ניתן לערוך נושא ותוכן. משתנים מסומנים ב-{`{{שם_משתנה}}`}</p>

      {categories.map(cat => (
        <div key={cat} className="space-y-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Mail size={18} className="text-primary" /> {cat}
          </h2>

          {templates.filter(t => t.category === cat).map(template => {
            const isEditing = editingId === template.id;
            const isPreviewing = previewId === template.id;

            return (
              <div key={template.id} className="card-elevated space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">{template.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => setPreviewId(isPreviewing ? null : template.id)}
                      className={`p-2 rounded-xl transition-colors ${isPreviewing ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      <Eye size={16} />
                    </button>
                    <button onClick={() => setEditingId(isEditing ? null : template.id)}
                      className={`p-2 rounded-xl transition-colors ${isEditing ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      <Edit3 size={16} />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">נושא</label>
                      <input value={template.subject} onChange={e => updateTemplate(template.id, 'subject', e.target.value)}
                        className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm focus:border-primary focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">תוכן</label>
                      <textarea value={template.body} onChange={e => updateTemplate(template.id, 'body', e.target.value)}
                        rows={8}
                        className="w-full p-3 rounded-xl border-2 border-input bg-background text-sm resize-none focus:border-primary focus:outline-none font-mono" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">משתנים זמינים:</p>
                      <div className="flex flex-wrap gap-1">
                        {template.variables.map(v => (
                          <span key={v} className="px-2 py-0.5 rounded-lg bg-primary/10 text-primary text-xs font-mono">{`{{${v}}}`}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => saveTemplate(template.id)}
                        className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm">
                        <Save size={16} /> שמור
                      </button>
                      <button onClick={() => resetTemplate(template.id)}
                        className="flex items-center gap-1 px-4 py-2 rounded-xl bg-muted text-muted-foreground font-bold text-sm">
                        <RotateCcw size={16} /> איפוס
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <p><strong>נושא:</strong> {template.subject}</p>
                  </div>
                )}

                {isPreviewing && (
                  <div className="bg-muted rounded-xl p-4 space-y-2">
                    <p className="text-xs font-bold text-muted-foreground">תצוגה מקדימה (עם נתוני דוגמה):</p>
                    <p className="text-sm font-bold">{template.subject.replace(/\{\{(\w+)\}\}/g, (_, k) => {
                      const samples: Record<string, string> = { vehicle_plate: '12-345-67', expiry_type: 'ביטוח חובה', title: 'הסעת בוקר' };
                      return samples[k] || k;
                    })}</p>
                    <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">{renderPreview(template)}</pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
