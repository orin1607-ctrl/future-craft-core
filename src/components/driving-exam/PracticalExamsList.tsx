import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Plus, Printer, MessageCircle, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import PracticalExamRunner from './PracticalExamRunner';
import { buildWaMeUrl } from '@/utils/israeliPhone';

interface Props {
  driverId: string;
  driverName: string;
  driverIdNumber?: string;
  driverPhone?: string;
  vehiclePlate?: string;
  companyName?: string;
}

interface ChecklistItem { name: string; section: string; status: 'ok' | 'defect' | ''; }

export default function PracticalExamsList({ driverId, driverName, driverIdNumber, driverPhone, vehiclePlate, companyName }: Props) {
  const { user } = useAuth();
  const isManager = user?.role === 'fleet_manager' || user?.role === 'super_admin';
  const [exams, setExams] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('practical_driving_exams')
      .select('*').eq('driver_id', driverId).order('created_at', { ascending: false });
    setExams(data || []);
  };
  useEffect(() => { load(); }, [driverId]);

  const handleDelete = async (id: string) => {
    if (!confirm('למחוק מבחן מעשי זה?')) return;
    await supabase.from('practical_driving_exams').delete().eq('id', id);
    toast.success('המבחן נמחק');
    load();
  };

  const buildReportHTML = (exam: any) => {
    const checklist = exam.checklist as ChecklistItem[];
    const grouped = checklist.reduce<Record<string, ChecklistItem[]>>((a, it) => {
      (a[it.section] ||= []).push(it);
      return a;
    }, {});
    return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>מבחן מעשי</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;direction:rtl}
    h1{text-align:center;color:#1a365d;border-bottom:3px solid #1a365d;padding-bottom:10px}
    .info{background:#f0f4f8;padding:15px;border-radius:8px;margin:15px 0;display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .section h2{background:#1a365d;color:white;padding:8px 12px;border-radius:6px;font-size:16px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #cbd5e0;padding:8px;text-align:right;font-size:13px}
    th{background:#edf2f7}
    .ok{color:#16a34a;font-weight:bold} .defect{color:#dc2626;font-weight:bold;background:#fee2e2}
    .result{font-size:24px;text-align:center;padding:15px;border-radius:8px;margin:20px 0;font-weight:bold}
    .pass{background:#d1fae5;color:#065f46} .fail{background:#fee2e2;color:#991b1b}
    .signatures{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:30px}
    .sig-box{text-align:center;border:1px solid #cbd5e0;padding:10px;border-radius:8px}
    .sig-box img{max-width:250px;max-height:100px}
    @media print{body{padding:15px}.no-print{display:none}}</style></head><body>
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
      <div class="section"><h2>${section}</h2><table>
        <thead><tr><th style="width:70%">בדיקה</th><th>סטטוס</th></tr></thead>
        <tbody>${list.map(it => `<tr>
          <td>${it.name}</td>
          <td class="${it.status === 'ok' ? 'ok' : 'defect'}">${it.status === 'ok' ? '✓ תקין' : '✗ לא תקין'}</td>
        </tr>`).join('')}</tbody></table></div>`).join('')}
    ${exam.notes ? `<div class="section"><h2>הערות</h2><p>${exam.notes}</p></div>` : ''}
    <div class="result ${exam.passed ? 'pass' : 'fail'}">תוצאת המבחן: ${exam.passed ? 'עבר ✓' : `לא עבר ✗ (${(exam.checklist as ChecklistItem[]).filter(i => i.status === 'defect').length} ליקויים)`}</div>
    <div class="signatures">
      <div class="sig-box"><p><strong>חתימת הנהג</strong></p>${exam.driver_signature_url ? `<img src="${exam.driver_signature_url}" />` : ''}</div>
      <div class="sig-box"><p><strong>חתימת הבוחן</strong></p>${exam.examiner_signature_url ? `<img src="${exam.examiner_signature_url}" />` : ''}</div>
    </div>
    <div class="no-print" style="text-align:center;margin-top:20px">
      <button onclick="window.print()" style="padding:10px 20px;background:#1a365d;color:white;border:none;border-radius:6px;cursor:pointer">הדפס</button>
    </div></body></html>`;
  };

  const printExam = (exam: any) => {
    const html = buildReportHTML(exam);
    const w = window.open('', '_blank');
    if (!w) { toast.error('חסום פופ-אפ'); return; }
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 500);
  };

  const downloadExam = (exam: any) => {
    const html = buildReportHTML(exam);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `מבחן_מעשי_${exam.driver_name}_${exam.exam_date}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendWhatsApp = (exam: any) => {
    // Same field + normalizer as declaration / theory exam: drivers.phone → 9725XXXXXXXX
    const summary = exam.passed
      ? `✅ מבחן מעשי בנהיגה - עבר\nנהג: ${exam.driver_name}\nתאריך: ${new Date(exam.exam_date).toLocaleDateString('he-IL')}\nבוחן: ${exam.examiner_name}`
      : `❌ מבחן מעשי בנהיגה - לא עבר\nנהג: ${exam.driver_name}\nתאריך: ${new Date(exam.exam_date).toLocaleDateString('he-IL')}\nליקויים: ${(exam.checklist as ChecklistItem[]).filter(i => i.status === 'defect').map(i => i.name).join(', ')}`;
    const url = buildWaMeUrl(driverPhone || '', summary);
    if (!url) {
      toast.error('חסר מספר טלפון בכרטיס הנהג — לא ניתן לפתוח צ׳אט ישירות');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (creating) {
    return (
      <PracticalExamRunner
        driverId={driverId}
        driverName={driverName}
        driverIdNumber={driverIdNumber}
        driverPhone={driverPhone}
        vehiclePlate={vehiclePlate}
        companyName={companyName}
        onComplete={() => { setCreating(false); load(); }}
        onCancel={() => setCreating(false)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {isManager && (
        <Button onClick={() => setCreating(true)} className="w-full h-14" size="lg">
          <Plus size={18} /> מבחן מעשי חדש
        </Button>
      )}

      <Card className="p-4">
        <h3 className="font-bold mb-3 flex items-center gap-2">
          <ClipboardList size={18} /> היסטוריית מבחנים מעשיים ({exams.length})
        </h3>
        {exams.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">אין מבחנים מעשיים</p>
        ) : (
          <div className="space-y-2">
            {exams.map(ex => {
              const defects = (ex.checklist as ChecklistItem[] || []).filter(i => i.status === 'defect').length;
              return (
                <div key={ex.id} className="border rounded p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <div className="flex items-center gap-2 flex-wrap text-sm">
                      <span className="font-medium">{new Date(ex.exam_date).toLocaleDateString('he-IL')}</span>
                      <Badge variant="outline">בוחן: {ex.examiner_name}</Badge>
                      {ex.passed ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">עבר ✓</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{defects} ליקויים</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <Button size="sm" variant="outline" onClick={() => printExam(ex)}>
                      <Printer size={14} /> הדפס
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => sendWhatsApp(ex)}>
                      <MessageCircle size={14} /> וואטסאפ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => downloadExam(ex)}>
                      <Download size={14} />
                    </Button>
                    {isManager && (
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(ex.id)}>
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
