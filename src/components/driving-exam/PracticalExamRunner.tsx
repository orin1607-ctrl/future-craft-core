import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, Printer, MessageCircle, ArrowRight } from 'lucide-react';
import { buildWaMeUrl } from '@/utils/israeliPhone';

// Sections matching the reference form
const VEHICLE_CONTROL = [
  'התחלת נסיעה / התנעה',
  'שליטה בהגה',
  'שימוש במצמד / נגישה במנגנון',
  'החלפת הילוכים במועד',
  'התחלת נסיעה במעלה',
  'שימוש בבלם רגל יד / במעלה',
  'שליטה כללית ברכב',
  'איתות',
  'נסיעה לאחור (כניסה/במקביל/ימין/שמאל)',
  'עצירת מטרה',
  'אבטחת הרכב לאחר חניה',
  'שימוש בבלמי האטה',
  'התייחסות למחזורים ואמצעי אזהרה',
  'אביזרי בטיחות',
  'שמשיות',
  'פיתולים',
  'נסיעה איטית',
  'איתות ידני',
  'עצירת חרום במגרש',
  'כניסה ויציאה מדרך ללא מוצא',
  'הורדה והעלאת נוסעים/תלמידים',
];

const ROAD_DRIVING = [
  'פניות ימינה/שמאלה/פרסה',
  'מיקום במפנשים',
  'משמעת נתיבים',
  'ציות לתמרורים',
  'ציות לרמזורים',
  'נסיעה בימין הדרך',
  'נהיגה בדרך שאינה עירונית',
  'התייחסות להולכי רגל',
  'שימוש בנתיב האצה/האטה',
  'נהיגה בדרך צרה',
  'נהיגה בכביש רטוב',
  'נחציית מסילת ברזל',
  'נהיגה בדרך מפותלת והררית',
];

const MOVEMENT = [
  'זהירות כללית',
  'הסתכלות',
  'שימוש במראות',
  'השתלבות בתנועה',
  'מתן זכות קדימה לרכב',
  'מהירות',
  'קצב נסיעה איטי/מהיר',
  'שמירת רווח לפנים וצמצר',
  'שמירת רווח לצדדים',
  'עקיפות / התנהגות כללית',
  'שימוש באורות / מגבים',
  'ירידה לשול סלול',
  'שימוש במד סל"ד',
  'התייחסות לכוחות טבע עקומות',
];

interface ChecklistItem {
  name: string;
  section: string;
  status: 'ok' | 'defect' | '';
}

interface Props {
  driverId: string;
  driverName: string;
  driverIdNumber?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  companyName?: string;
  onComplete?: () => void;
  onCancel?: () => void;
}

const buildInitial = (): ChecklistItem[] => [
  ...VEHICLE_CONTROL.map(name => ({ name, section: 'שליטה ברכב', status: 'ok' as const })),
  ...ROAD_DRIVING.map(name => ({ name, section: 'הדרך', status: 'ok' as const })),
  ...MOVEMENT.map(name => ({ name, section: 'התנועה', status: 'ok' as const })),
];

export default function PracticalExamRunner({ driverId, driverName, driverIdNumber, driverPhone, vehiclePlate, companyName, onComplete, onCancel }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<ChecklistItem[]>(buildInitial());
  const [examinerName, setExaminerName] = useState(user?.full_name || '');
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'checklist' | 'driver_sig' | 'examiner_sig'>('checklist');
  const [submitting, setSubmitting] = useState(false);
  const [savedExam, setSavedExam] = useState<any>(null);

  const driverCanvas = useRef<HTMLCanvasElement>(null);
  const examinerCanvas = useRef<HTMLCanvasElement>(null);
  const drawingDriver = useRef(false);
  const drawingExaminer = useRef(false);

  const updateStatus = (idx: number, status: 'ok' | 'defect') => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, status } : it));
  };

  const sectionGroups = items.reduce<Record<string, { item: ChecklistItem; idx: number }[]>>((acc, it, idx) => {
    if (!acc[it.section]) acc[it.section] = [];
    acc[it.section].push({ item: it, idx });
    return acc;
  }, {});

  const defectsCount = items.filter(i => i.status === 'defect').length;
  const passed = defectsCount === 0;

  const createDraw = (ref: React.RefObject<HTMLCanvasElement>, dRef: React.MutableRefObject<boolean>) => ({
    start: (e: React.PointerEvent) => {
      dRef.current = true;
      const c = ref.current!;
      const rect = c.getBoundingClientRect();
      const ctx = c.getContext('2d')!;
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    },
    move: (e: React.PointerEvent) => {
      if (!dRef.current) return;
      const c = ref.current!;
      const rect = c.getBoundingClientRect();
      const ctx = c.getContext('2d')!;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    },
    end: () => { dRef.current = false; },
    clear: () => {
      const c = ref.current;
      if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    },
  });

  const driverDraw = createDraw(driverCanvas, drawingDriver);
  const examinerDraw = createDraw(examinerCanvas, drawingExaminer);

  const handleFinish = async () => {
    if (!examinerName.trim()) { toast.error('יש להזין שם בוחן'); return; }
    setStep('driver_sig');
  };

  const submitFinal = async () => {
    setSubmitting(true);
    const driverSig = driverCanvas.current?.toDataURL('image/png') || '';
    const examinerSig = examinerCanvas.current?.toDataURL('image/png') || '';

    const { data, error } = await supabase.from('practical_driving_exams').insert({
      driver_id: driverId,
      driver_name: driverName,
      driver_id_number: driverIdNumber || '',
      vehicle_plate: vehiclePlate || '',
      company_name: companyName || '',
      examiner_name: examinerName,
      exam_date: examDate,
      checklist: items as any,
      notes,
      driver_signature_url: driverSig,
      examiner_signature_url: examinerSig,
      passed,
      status: 'completed',
      created_by: user?.id,
    }).select().single();

    setSubmitting(false);
    if (error || !data) { toast.error('שגיאה בשמירה'); return; }
    toast.success(passed ? 'המבחן נשמר - עבר ✓' : `המבחן נשמר - ${defectsCount} ליקויים`);
    setSavedExam(data);
  };

  const buildReportHTML = (exam: any) => {
    const checklist = exam.checklist as ChecklistItem[];
    const grouped = checklist.reduce<Record<string, ChecklistItem[]>>((a, it) => {
      (a[it.section] ||= []).push(it);
      return a;
    }, {});

    return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>מבחן מעשי בנהיגה</title>
    <style>
    body{font-family:Arial,sans-serif;padding:30px;direction:rtl;color:#1a202c}
    h1{text-align:center;color:#1a365d;border-bottom:3px solid #1a365d;padding-bottom:10px}
    .info{background:#f0f4f8;padding:15px;border-radius:8px;margin:15px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .section{margin:20px 0;page-break-inside:avoid}
    .section h2{background:#1a365d;color:white;padding:8px 12px;border-radius:6px;font-size:16px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #cbd5e0;padding:8px;text-align:right;font-size:13px}
    th{background:#edf2f7}
    .ok{color:#16a34a;font-weight:bold}
    .defect{color:#dc2626;font-weight:bold;background:#fee2e2}
    .result{font-size:24px;text-align:center;padding:15px;border-radius:8px;margin:20px 0;font-weight:bold}
    .pass{background:#d1fae5;color:#065f46}
    .fail{background:#fee2e2;color:#991b1b}
    .signatures{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}
    .sig-box{text-align:center;border:1px solid #cbd5e0;padding:10px;border-radius:8px}
    .sig-box img{max-width:250px;max-height:100px}
    @media print{body{padding:15px} .no-print{display:none}}
    </style></head><body>
    <h1>מבחן מעשי בנהיגה</h1>
    <div class="info">
      <div><strong>שם הנהג:</strong> ${exam.driver_name}</div>
      <div><strong>ת.ז:</strong> ${exam.driver_id_number || '—'}</div>
      <div><strong>מס' רכב:</strong> ${exam.vehicle_plate || '—'}</div>
      <div><strong>תאריך:</strong> ${new Date(exam.exam_date).toLocaleDateString('he-IL')}</div>
      <div><strong>בוחן:</strong> ${exam.examiner_name}</div>
      <div><strong>חברה:</strong> ${exam.company_name || '—'}</div>
    </div>

    ${Object.entries(grouped).map(([section, list]) => `
      <div class="section">
        <h2>${section}</h2>
        <table>
          <thead><tr><th style="width:70%">בדיקה</th><th>סטטוס</th></tr></thead>
          <tbody>
            ${list.map(it => `<tr>
              <td>${it.name}</td>
              <td class="${it.status === 'ok' ? 'ok' : 'defect'}">${it.status === 'ok' ? '✓ תקין' : '✗ לא תקין'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}

    ${exam.notes ? `<div class="section"><h2>הערות</h2><p>${exam.notes}</p></div>` : ''}

    <div class="result ${exam.passed ? 'pass' : 'fail'}">
      תוצאת המבחן: ${exam.passed ? 'עבר ✓' : `לא עבר ✗ (${(exam.checklist as ChecklistItem[]).filter(i => i.status === 'defect').length} ליקויים)`}
    </div>

    <div class="signatures">
      <div class="sig-box">
        <p><strong>חתימת הנהג</strong></p>
        ${exam.driver_signature_url ? `<img src="${exam.driver_signature_url}" />` : ''}
      </div>
      <div class="sig-box">
        <p><strong>חתימת הבוחן</strong></p>
        ${exam.examiner_signature_url ? `<img src="${exam.examiner_signature_url}" />` : ''}
      </div>
    </div>

    <p style="text-align:center;margin-top:30px;color:#718096;font-size:12px">חתום דיגיטלית - ${new Date().toLocaleDateString('he-IL')}</p>
    <div class="no-print" style="text-align:center;margin-top:20px">
      <button onclick="window.print()" style="padding:10px 20px;background:#1a365d;color:white;border:none;border-radius:6px;cursor:pointer;font-size:16px">הדפס</button>
    </div>
    </body></html>`;
  };

  const printReport = () => {
    if (!savedExam) return;
    const html = buildReportHTML(savedExam);
    const w = window.open('', '_blank');
    if (!w) { toast.error('חסום פופ-אפ'); return; }
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const downloadReport = () => {
    if (!savedExam) return;
    const html = buildReportHTML(savedExam);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `מבחן_מעשי_${savedExam.driver_name}_${savedExam.exam_date}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('הקובץ הורד');
  };

  const sendWhatsApp = () => {
    if (!savedExam) return;
    // Same field + normalizer as declaration / theory exam: drivers.phone → 9725XXXXXXXX
    const summary = savedExam.passed
      ? `✅ מבחן מעשי בנהיגה - עבר\nנהג: ${savedExam.driver_name}\nתאריך: ${new Date(savedExam.exam_date).toLocaleDateString('he-IL')}\nבוחן: ${savedExam.examiner_name}`
      : `❌ מבחן מעשי בנהיגה - לא עבר\nנהג: ${savedExam.driver_name}\nתאריך: ${new Date(savedExam.exam_date).toLocaleDateString('he-IL')}\nליקויים: ${(savedExam.checklist as ChecklistItem[]).filter(i => i.status === 'defect').map(i => i.name).join(', ')}`;
    const url = buildWaMeUrl(driverPhone || '', summary);
    if (!url) {
      toast.error('חסר מספר טלפון בכרטיס הנהג — לא ניתן לפתוח צ׳אט ישירות');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Result screen
  if (savedExam) {
    return (
      <div className="space-y-4">
        <Card className={`p-6 text-center ${savedExam.passed ? 'bg-green-50 dark:bg-green-950/20 border-green-500' : 'bg-red-50 dark:bg-red-950/20 border-red-500'} border-2`}>
          <div className="text-4xl mb-2">{savedExam.passed ? '✓' : '✗'}</div>
          <h2 className="text-2xl font-bold mb-1">{savedExam.passed ? 'עבר' : 'לא עבר'}</h2>
          <p className="text-sm text-muted-foreground">
            {savedExam.passed ? 'כל הסעיפים תקינים' : `${(savedExam.checklist as ChecklistItem[]).filter(i => i.status === 'defect').length} ליקויים נמצאו`}
          </p>
        </Card>
        <Card className="p-4 space-y-2">
          <Button onClick={printReport} className="w-full h-12" size="lg">
            <Printer size={18} /> הדפסת דוח
          </Button>
          <Button onClick={sendWhatsApp} className="w-full h-12 bg-green-600 hover:bg-green-700 text-white" size="lg">
            <MessageCircle size={18} /> שליחה בוואטסאפ
          </Button>
          <Button onClick={downloadReport} variant="outline" className="w-full h-12" size="lg">
            הורדת דוח כקובץ
          </Button>
          <Button onClick={onComplete} variant="ghost" className="w-full">
            סיום
          </Button>
        </Card>
      </div>
    );
  }

  // Signature screens
  if (step === 'driver_sig' || step === 'examiner_sig') {
    const isDriver = step === 'driver_sig';
    const draw = isDriver ? driverDraw : examinerDraw;
    const ref = isDriver ? driverCanvas : examinerCanvas;
    return (
      <Card className="p-4 space-y-3">
        <h3 className="font-bold text-lg">{isDriver ? 'חתימת הנהג' : 'חתימת הבוחן'}</h3>
        <canvas
          ref={ref}
          width={500}
          height={200}
          className="border-2 border-border rounded w-full bg-white touch-none"
          onPointerDown={draw.start}
          onPointerMove={draw.move}
          onPointerUp={draw.end}
          onPointerLeave={draw.end}
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={draw.clear}>נקה</Button>
          <Button
            className="flex-1 h-12"
            onClick={() => isDriver ? setStep('examiner_sig') : submitFinal()}
            disabled={submitting}
          >
            {isDriver ? 'המשך לחתימת בוחן' : (submitting ? 'שומר...' : 'סיום ושמירה')}
          </Button>
        </div>
      </Card>
    );
  }

  // Main checklist
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            <ArrowRight size={14} /> ביטול
          </Button>
        )}
        <span className={`text-sm font-bold px-3 py-1 rounded ${defectsCount === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {defectsCount === 0 ? 'הכל תקין' : `${defectsCount} ליקויים`}
        </span>
      </div>

      <Card className="p-4 bg-primary/5">
        <h2 className="text-xl font-bold text-center">מבחן מעשי בנהיגה</h2>
        <p className="text-sm text-center text-muted-foreground">פרטי ומסחרי עד 3.5 טון</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div>
            <label className="text-xs font-medium block mb-1">שם הנהג</label>
            <Input value={driverName} disabled className="text-right" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">ת.ז</label>
            <Input value={driverIdNumber || ''} disabled className="text-right" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">מס' רכב</label>
            <Input value={vehiclePlate || ''} disabled className="text-right" />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">תאריך</label>
            <Input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium block mb-1">שם הבוחן *</label>
            <Input value={examinerName} onChange={e => setExaminerName(e.target.value)} placeholder="הזן שם בוחן..." className="text-right" />
          </div>
        </div>
      </Card>

      {Object.entries(sectionGroups).map(([section, list]) => (
        <Card key={section} className="overflow-hidden">
          <div className="bg-primary text-primary-foreground px-3 py-2 font-bold text-sm">{section}</div>
          <div className="divide-y divide-border">
            {list.map(({ item, idx }) => (
              <div key={idx} className={`flex items-center gap-2 p-2 ${item.status === 'defect' ? 'bg-destructive/10' : ''}`}>
                <span className="flex-1 text-sm font-medium">{item.name}</span>
                <button
                  type="button"
                  onClick={() => updateStatus(idx, 'ok')}
                  className={`min-w-[44px] h-11 rounded-lg border-2 flex items-center justify-center transition ${
                    item.status === 'ok' ? 'bg-green-500 border-green-600 text-white' : 'border-input bg-background text-muted-foreground'
                  }`}
                  aria-label="תקין"
                >
                  <Check size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(idx, 'defect')}
                  className={`min-w-[44px] h-11 rounded-lg border-2 flex items-center justify-center transition ${
                    item.status === 'defect' ? 'bg-red-500 border-red-600 text-white' : 'border-input bg-background text-muted-foreground'
                  }`}
                  aria-label="לא תקין"
                >
                  <X size={20} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      ))}

      <Card className="p-3">
        <label className="text-sm font-medium block mb-1">הערות</label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="הערות כלליות..." />
      </Card>

      <Button onClick={handleFinish} className="w-full h-14 text-lg font-bold">
        סיום והמשך לחתימה
      </Button>
    </div>
  );
}
