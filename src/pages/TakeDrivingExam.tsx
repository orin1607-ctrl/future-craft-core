import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import ExamRunner from '@/components/driving-exam/ExamRunner';
import { Card } from '@/components/ui/card';
import type { ExamQuestion } from '@/data/drivingExamQuestions';
import { getDrivingExamByToken, startDrivingExamByToken } from '@/lib/tokenScopedAccess';

export default function TakeDrivingExam() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const token = search.get('t');
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if (token) {
        const { data, error: e } = await getDrivingExamByToken<Record<string, unknown>>(token);
        if (e || !data) { setError('המבחן לא נמצא'); setLoading(false); return; }
        if (data.status === 'completed') { setError('המבחן כבר הושלם'); setLoading(false); return; }
        if (data.status === 'sent') {
          const started = await startDrivingExamByToken<Record<string, unknown>>(token);
          setExam(started.data || data);
        } else {
          setExam(data);
        }
        setLoading(false);
        return;
      }

      if (!id) { setError('קישור לא תקין'); setLoading(false); return; }
      const { data, error: e } = await supabase.from('driving_exams').select('*').eq('id', id).maybeSingle();
      if (e || !data) { setError('המבחן לא נמצא'); setLoading(false); return; }
      if (data.status === 'completed') { setError('המבחן כבר הושלם'); setLoading(false); return; }
      if (data.status === 'sent') {
        await supabase.from('driving_exams').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', data.id);
      }
      setExam(data);
      setLoading(false);
    })();
  }, [id, token]);

  if (loading) return <div className="p-6 text-center">טוען...</div>;
  if (error) return <div className="p-6"><Card className="p-6 text-center text-destructive">{error}</Card></div>;
  if (!exam) return null;

  return (
    <div className="max-w-2xl mx-auto p-4" dir="rtl">
      <h1 className="text-2xl font-bold mb-4 text-center">מבחן כשירות נהיגה</h1>
      <ExamRunner
        examId={exam.id}
        examToken={token || undefined}
        questions={exam.questions as ExamQuestion[]}
        driverName={exam.driver_name}
        companyName={exam.company_name}
        vehiclePlate={exam.vehicle_plate}
      />
    </div>
  );
}
