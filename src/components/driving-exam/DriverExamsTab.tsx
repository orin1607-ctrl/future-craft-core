import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Send, MessageCircle, Link as LinkIcon, FileText, Trash2, Monitor, Download, AlertTriangle, ClipboardList } from 'lucide-react';
import { generateExam, EXAM_TYPES, type ExamType, type ExamQuestion } from '@/data/drivingExamQuestions';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

import ExamRunner from './ExamRunner';
import { ResolvedStorageImg } from '@/components/documents/DocumentViewer';

import PracticalExamsList from './PracticalExamsList';
import { buildWaMeUrl, hasWhatsAppPhone } from '@/utils/israeliPhone';

interface Props {
  driverId: string;
  driverName: string;
  driverIdNumber?: string;
  driverPhone?: string;
  companyName?: string;
  vehiclePlate?: string;
}

const EXAM_TYPE_LABELS: Record<string, string> = {
  general: 'כללי',
  theory: 'תיאוריה',
  safety: 'בטיחות',
  periodic: 'תקופתי',
};

export default function DriverExamsTab({ driverId, driverName, driverIdNumber, driverPhone, companyName, vehiclePlate }: Props) {
  const { user } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [note, setNote] = useState('');
  const [examType, setExamType] = useState<ExamType>('general');
  const [inPersonExam, setInPersonExam] = useState<any>(null);
  const [showDetailedAnswers, setShowDetailedAnswers] = useState(false);

  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';

  const load = async () => {
    const { data } = await supabase.from('driving_exams').select('*').eq('driver_id', driverId).order('created_at', { ascending: false });
    setExams(data || []);
  };
  useEffect(() => { load(); }, [driverId]);

  const createExam = async (sentVia: 'app' | 'sms' | 'whatsapp' | 'link' | 'in_person') => {
    setCreating(true);
    const questions = generateExam(examType);
    const { data, error } = await supabase.from('driving_exams').insert({
      driver_id: driverId,
      driver_name: driverName,
      driver_phone: driverPhone || '',
      company_name: companyName || '',
      vehicle_plate: vehiclePlate || '',
      sent_via: sentVia,
      sent_at: new Date().toISOString(),
      sent_to: driverPhone || '',
      questions: questions as any,
      total_questions: questions.length,
      created_by: user?.id,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      exam_type: examType,
    }).select().single();
    setCreating(false);
    if (error || !data) { toast.error('שגיאה ביצירת מבחן'); return; }

    if (sentVia === 'in_person') {
      // Open exam directly for driver to take on manager's computer
      setInPersonExam(data);
      toast.success('המבחן נפתח - הנהג יכול למלא כעת');
    } else {
      const link = `${window.location.origin}/take-exam?t=${data.token}`;
      const msg = `שלום ${driverName}, נשלח אליך מבחן כשירות נהיגה (${EXAM_TYPE_LABELS[examType]}). למילוי: ${link}`;

      if (sentVia === 'sms' && driverPhone) {
        window.location.href = `sms:${driverPhone}?body=${encodeURIComponent(msg)}`;
      } else if (sentVia === 'whatsapp') {
        // Same field + normalizer as declaration: drivers.phone → 9725XXXXXXXX
        const waUrl = buildWaMeUrl(driverPhone || '', msg);
        if (!waUrl) {
          toast.error('חסר מספר טלפון בכרטיס הנהג — לא ניתן לפתוח צ׳אט ישירות');
          return;
        }
        window.open(waUrl, '_blank', 'noopener,noreferrer');
      } else if (sentVia === 'link') {
        navigator.clipboard.writeText(link);
        toast.success('הקישור הועתק!');
      } else {
        toast.success('המבחן נשלח לאפליקציית הנהג');
      }
    }
    load();
  };

  const deleteExam = async (id: string) => {
    if (!confirm('למחוק מבחן זה?')) return;
    await supabase.from('driving_exams').delete().eq('id', id);
    load();
  };

  const saveNote = async () => {
    if (!selected) return;
    await supabase.from('driving_exams').update({ manager_note: note }).eq('id', selected.id);
    toast.success('הערה נשמרה');
    load();
  };

  const updateDriverExamDates = async (examDate: string) => {
    const expiryDate = new Date(examDate);
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    await supabase.from('drivers').update({
      last_exam_date: examDate,
      exam_expiry: expiryDate.toISOString().split('T')[0],
    }).eq('id', driverId);
  };

  const handleInPersonComplete = async () => {
    setInPersonExam(null);
    // Update driver exam dates
    await updateDriverExamDates(new Date().toISOString().split('T')[0]);
    load();
  };

  const exportExamPdf = (exam: any) => {
    const questions = exam.questions as ExamQuestion[];
    const answers = exam.answers as any[] || [];
    
    let html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8">
    <style>body{font-family:Arial,sans-serif;padding:40px;direction:rtl}
    h1{text-align:center;color:#1a365d}
    .info{background:#f0f4f8;padding:15px;border-radius:8px;margin:20px 0}
    .q{margin:15px 0;padding:15px;border:1px solid #e2e8f0;border-radius:8px}
    .correct{color:#16a34a;font-weight:bold}
    .wrong{color:#dc2626;font-weight:bold}
    .score{font-size:48px;text-align:center;font-weight:bold;margin:20px}
    @media print{body{padding:20px}}</style></head><body>
    <h1>מבחן כשירות נהיגה - תוצאות</h1>
    <div class="info">
    <p><strong>נהג:</strong> ${exam.driver_name}</p>
    <p><strong>חברה:</strong> ${exam.company_name || '—'}</p>
    <p><strong>רכב:</strong> ${exam.vehicle_plate || '—'}</p>
    <p><strong>סוג מבחן:</strong> ${EXAM_TYPE_LABELS[exam.exam_type] || 'כללי'}</p>
    <p><strong>תאריך:</strong> ${exam.completed_at ? new Date(exam.completed_at).toLocaleDateString('he-IL') : '—'}</p>
    <p><strong>ציון:</strong> ${exam.score ?? '—'}</p>
    <p><strong>תוצאה:</strong> ${exam.passed === null ? '—' : exam.passed ? 'עבר ✓' : 'לא עבר ✗'}</p>
    </div>
    <div class="score" style="color:${exam.passed ? '#16a34a' : '#dc2626'}">${exam.score}</div>`;

    if (questions && answers.length > 0) {
      questions.forEach((q, i) => {
        const ans = answers.find((a: any) => a.question_id === q.id);
        const isCorrect = ans?.is_correct;
        html += `<div class="q">
          <p><strong>${i + 1}. ${q.question}</strong> <small>(${q.category})</small></p>
          <p>תשובה: <span class="${isCorrect ? 'correct' : 'wrong'}">${ans?.selected_index !== null && ans?.selected_index !== undefined ? q.answers[ans.selected_index] : 'לא נענה'}</span></p>
          ${!isCorrect ? `<p class="correct">תשובה נכונה: ${q.answers[q.correct]}</p>` : ''}
          <p><small>${q.explanation}</small></p>
        </div>`;
      });
    }

    if (exam.signature_url) {
      html += `<div style="margin-top:30px"><p><strong>חתימת נהג:</strong></p><img src="${exam.signature_url}" style="max-width:300px;border:1px solid #ccc;border-radius:8px"/></div>`;
    }
    if (exam.manager_signature_url) {
      html += `<div style="margin-top:15px"><p><strong>חתימת מנהל:</strong></p><img src="${exam.manager_signature_url}" style="max-width:300px;border:1px solid #ccc;border-radius:8px"/></div>`;
    }

    html += `</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exam_${exam.driver_name}_${new Date(exam.created_at).toLocaleDateString('he-IL').replace(/\//g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('הקובץ הורד');
  };

  // Check exam expiry
  const lastCompletedExam = exams.find(e => e.status === 'completed' && e.passed);
  const examExpired = lastCompletedExam?.completed_at && 
    new Date(lastCompletedExam.completed_at).getTime() + (lastCompletedExam.exam_validity_months || 12) * 30 * 24 * 60 * 60 * 1000 < Date.now();

  // In-person exam dialog
  if (inPersonExam) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setInPersonExam(null)}>← ביטול</Button>
          <Badge variant="secondary">מבחן במחשב - {EXAM_TYPE_LABELS[inPersonExam.exam_type] || 'כללי'}</Badge>
        </div>
        <ExamRunner
          examId={inPersonExam.id}
          questions={inPersonExam.questions as ExamQuestion[]}
          driverName={driverName}
          companyName={companyName}
          vehiclePlate={vehiclePlate}
          showManagerSignature={isManager}
          onComplete={handleInPersonComplete}
        />
      </div>
    );
  }

  if (selected) {
    const questions = selected.questions as ExamQuestion[];
    const answers = selected.answers as any[] || [];
    
    return (
      <div className="space-y-3">
        <Button variant="outline" onClick={() => { setSelected(null); setShowDetailedAnswers(false); }}>← חזרה</Button>
        <Card className="p-4">
          <h3 className="font-bold mb-2">פרטי מבחן</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>תאריך שליחה: {new Date(selected.created_at).toLocaleString('he-IL')}</div>
            <div>אופן שליחה: {selected.sent_via}</div>
            <div>סוג מבחן: <Badge variant="outline">{EXAM_TYPE_LABELS[selected.exam_type] || 'כללי'}</Badge></div>
            <div>סטטוס: {selected.status}</div>
            <div>ציון: {selected.score ?? '—'}</div>
            <div>תוצאה: {selected.passed === null ? '—' : selected.passed ? 'עבר ✓' : 'לא עבר ✗'}</div>
            <div>הושלם: {selected.completed_at ? new Date(selected.completed_at).toLocaleString('he-IL') : '—'}</div>
          </div>
          {selected.signature_url && (
            <div className="mt-3">
              <p className="text-sm font-medium mb-1">חתימת נהג:</p>
              <ResolvedStorageImg url={selected.signature_url} alt="חתימת נהג" className="border rounded max-w-xs" />
            </div>
          )}
          {selected.manager_signature_url && (
            <div className="mt-3">
              <p className="text-sm font-medium mb-1">חתימת מנהל:</p>
              <ResolvedStorageImg url={selected.manager_signature_url} alt="חתימת מנהל" className="border rounded max-w-xs" />
            </div>
          )}
          {selected.status === 'completed' && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => exportExamPdf(selected)}>
              <Download size={14} /> הורד תוצאות
            </Button>
          )}
        </Card>

        {selected.category_breakdown && Object.keys(selected.category_breakdown).length > 0 && (
          <Card className="p-4">
            <h3 className="font-bold mb-2">פירוט קטגוריות</h3>
            {Object.entries(selected.category_breakdown as Record<string, any>).map(([cat, b]) => (
              <div key={cat} className="flex justify-between py-1 text-sm">
                <span>{cat}</span><span>{b.correct}/{b.total} ({b.percent}%)</span>
              </div>
            ))}
          </Card>
        )}

        {/* Full Q&A details */}
        {selected.status === 'completed' && questions.length > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">פירוט שאלות ותשובות</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowDetailedAnswers(!showDetailedAnswers)}>
                {showDetailedAnswers ? 'הסתר' : 'הצג'}
              </Button>
            </div>
            {showDetailedAnswers && questions.map((q, i) => {
              const ans = answers.find((a: any) => a.question_id === q.id);
              const isCorrect = ans?.is_correct;
              return (
                <div key={q.id} className={`p-3 mb-2 rounded border-r-4 ${isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-red-500 bg-red-50 dark:bg-red-950/20'}`}>
                  <p className="font-bold mb-1 text-sm">{i + 1}. {q.question}</p>
                  <p className="text-xs text-muted-foreground mb-1">{q.category}</p>
                  <p className="text-sm">תשובתך: {ans?.selected_index !== null && ans?.selected_index !== undefined ? q.answers[ans.selected_index] : 'לא נענה'}</p>
                  {!isCorrect && <p className="text-sm text-green-700 dark:text-green-400">תשובה נכונה: {q.answers[q.correct]}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{q.explanation}</p>
                </div>
              );
            })}
          </Card>
        )}

        {isManager && (
          <Card className="p-4">
            <h3 className="font-bold mb-2">הערת מנהל</h3>
            <Textarea value={note || selected.manager_note || ''} onChange={(e) => setNote(e.target.value)} rows={3} />
            <Button onClick={saveNote} className="mt-2" size="sm">שמור הערה</Button>
          </Card>
        )}
      </div>
    );
  }

  return (
    <Tabs defaultValue="theory" className="space-y-3">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="theory">
          <FileText size={14} className="ml-1" /> מבחן תיאוריה
        </TabsTrigger>
        <TabsTrigger value="practical">
          <ClipboardList size={14} className="ml-1" /> מבחן מעשי
        </TabsTrigger>
      </TabsList>

      <TabsContent value="theory" className="space-y-3">
        {/* Exam expiry warning */}
        {examExpired && (
          <Card className="p-3 border-destructive bg-destructive/10">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle size={18} />
              <span className="font-bold text-sm">תוקף המבחן האחרון פג! יש לבצע מבחן חדש.</span>
            </div>
          </Card>
        )}

        {isManager && (
          <Card className="p-4">
            <h3 className="font-bold mb-3">שליחת מבחן חדש</h3>
            <div className="mb-3">
              <label className="text-sm font-medium mb-1 block">סוג מבחן</label>
              <Select value={examType} onValueChange={(v) => setExamType(v as ExamType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXAM_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => createExam('in_person')} disabled={creating} size="sm" variant="default" className="col-span-2">
                <Monitor size={14} /> פתח מבחן במחשב
              </Button>
              <Button onClick={() => createExam('app')} disabled={creating} size="sm" variant="outline">
                <Plus size={14} /> שלח באפליקציה
              </Button>
              <Button onClick={() => createExam('sms')} disabled={creating || !driverPhone} variant="outline" size="sm">
                <Send size={14} /> SMS
              </Button>
              <Button onClick={() => createExam('whatsapp')} disabled={creating || !hasWhatsAppPhone(driverPhone)} variant="outline" size="sm">
                <MessageCircle size={14} /> WhatsApp
              </Button>
              <Button onClick={() => createExam('link')} disabled={creating} variant="outline" size="sm">
                <LinkIcon size={14} /> קישור
              </Button>
            </div>
          </Card>
        )}

        <Card className="p-4">
          <h3 className="font-bold mb-3">היסטוריית מבחנים ({exams.length})</h3>
          {exams.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">אין מבחנים</p>
          ) : (
            <div className="space-y-2">
              {exams.map(ex => (
                <div key={ex.id} className="border rounded p-3 flex items-center justify-between gap-2">
                  <div className="flex-1 cursor-pointer" onClick={() => { setSelected(ex); setNote(ex.manager_note || ''); }}>
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <FileText size={14} />
                      <span>{new Date(ex.created_at).toLocaleDateString('he-IL')}</span>
                      <Badge variant="outline" className="text-xs">{EXAM_TYPE_LABELS[ex.exam_type] || 'כללי'}</Badge>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">{ex.sent_via}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">{ex.status}</span>
                      {ex.score !== null && (
                        <span className={`text-xs px-2 py-0.5 rounded font-bold ${ex.passed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {ex.score} - {ex.passed ? 'עבר' : 'נכשל'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {ex.status === 'completed' && (
                      <Button size="sm" variant="ghost" onClick={() => exportExamPdf(ex)} title="הורד תוצאות">
                        <Download size={14} />
                      </Button>
                    )}
                    {isManager && (
                      <Button size="sm" variant="ghost" onClick={() => deleteExam(ex.id)}>
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="practical">
        <PracticalExamsList
          driverId={driverId}
          driverName={driverName}
          driverIdNumber={driverIdNumber}
          driverPhone={driverPhone}
          vehiclePlate={vehiclePlate}
          companyName={companyName}
        />
      </TabsContent>
    </Tabs>
  );
}
