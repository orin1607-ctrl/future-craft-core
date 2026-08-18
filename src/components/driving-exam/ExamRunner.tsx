import { useState, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { gradeExam, type ExamQuestion, PASSING_SCORE } from '@/data/drivingExamQuestions';
import { submitDrivingExamByToken } from '@/lib/tokenScopedAccess';

interface ExamRunnerProps {
  examId: string;
  examToken?: string;
  questions: ExamQuestion[];
  driverName: string;
  companyName?: string;
  vehiclePlate?: string;
  showManagerSignature?: boolean;
  onComplete?: () => void;
}

export default function ExamRunner({ examId, examToken, questions, driverName, companyName, vehiclePlate, showManagerSignature, onComplete }: ExamRunnerProps) {
  const [answers, setAnswers] = useState<Record<number, number | null>>({});
  const [showSig, setShowSig] = useState(false);
  const [showManagerSig, setShowManagerSig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof gradeExam> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const managerCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const managerDrawing = useRef(false);

  const allAnswered = useMemo(() => questions.every(q => answers[q.id] !== undefined && answers[q.id] !== null), [answers, questions]);

  const createDrawHandlers = (ref: React.RefObject<HTMLCanvasElement>, drawingRef: React.MutableRefObject<boolean>) => ({
    start: (e: React.PointerEvent) => {
      drawingRef.current = true;
      const c = ref.current!;
      const rect = c.getBoundingClientRect();
      const ctx = c.getContext('2d')!;
      ctx.beginPath();
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    },
    move: (e: React.PointerEvent) => {
      if (!drawingRef.current) return;
      const c = ref.current!;
      const rect = c.getBoundingClientRect();
      const ctx = c.getContext('2d')!;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#000';
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
      ctx.stroke();
    },
    end: () => { drawingRef.current = false; },
    clear: () => {
      const c = ref.current;
      if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    },
  });

  const driverDraw = createDrawHandlers(canvasRef, drawing);
  const managerDraw = createDrawHandlers(managerCanvasRef, managerDrawing);

  const handleSubmit = async () => {
    if (!allAnswered) {
      toast.error('יש לענות על כל השאלות');
      return;
    }
    setShowSig(true);
  };

  const handleDriverSigned = () => {
    if (showManagerSignature) {
      setShowManagerSig(true);
    } else {
      finalSubmit();
    }
  };

  const finalSubmit = async () => {
    const sig = canvasRef.current?.toDataURL('image/png') || '';
    const managerSig = managerCanvasRef.current?.toDataURL('image/png') || '';
    setSubmitting(true);
    const graded = gradeExam(questions, answers);
    
    const updateData: any = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      answers: graded.answers as any,
      score: graded.score,
      correct_count: graded.correct_count,
      total_questions: graded.total,
      passed: graded.passed,
      category_breakdown: graded.category_breakdown as any,
      signature_url: sig,
    };
    
    if (managerSig && showManagerSignature) {
      updateData.manager_signature_url = managerSig;
    }

    let error = null as { message: string } | null;
    if (examToken) {
      const res = await submitDrivingExamByToken({
        token: examToken,
        answers: graded.answers,
        score: graded.score,
        correct_count: graded.correct_count,
        total_questions: graded.total,
        passed: graded.passed,
        category_breakdown: graded.category_breakdown,
        signature_url: sig,
      });
      error = res.error;
    } else {
      const res = await supabase
        .from('driving_exams')
        .update(updateData)
        .eq('id', examId);
      error = res.error;
    }
    setSubmitting(false);
    if (error) { toast.error('שגיאה בשליחה'); return; }
    setResult(graded);
    toast.success(graded.passed ? 'עברת את המבחן!' : 'המבחן נשלח');
    onComplete?.();
  };

  if (result) {
    return (
      <div className="space-y-4">
        <Card className="p-6 text-center">
          <h2 className="text-2xl font-bold mb-2">תוצאות המבחן</h2>
          <div className="text-6xl font-bold my-4" style={{ color: result.passed ? 'hsl(142 76% 36%)' : 'hsl(0 84% 60%)' }}>
            {result.score}
          </div>
          <p className="text-xl">{result.correct_count} / {result.total} תשובות נכונות</p>
          <p className={`text-2xl font-bold mt-2 ${result.passed ? 'text-green-600' : 'text-red-600'}`}>
            {result.passed ? '✓ עברת' : '✗ לא עברת'}
          </p>
          <p className="text-sm text-muted-foreground mt-2">ציון עובר: {PASSING_SCORE}</p>
        </Card>
        <Card className="p-4">
          <h3 className="font-bold mb-3">פירוט לפי קטגוריה</h3>
          {Object.entries(result.category_breakdown).map(([cat, b]) => (
            <div key={cat} className="flex justify-between py-2 border-b last:border-0">
              <span>{cat}</span>
              <span className="font-bold">{b.correct}/{b.total} ({b.percent}%)</span>
            </div>
          ))}
        </Card>
        <Card className="p-4">
          <h3 className="font-bold mb-3">פירוט תשובות</h3>
          {questions.map((q, i) => {
            const ans = result.answers.find(a => a.question_id === q.id)!;
            return (
              <div key={q.id} className={`p-3 mb-2 rounded border-r-4 ${ans.is_correct ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : 'border-red-500 bg-red-50 dark:bg-red-950/20'}`}>
                <p className="font-bold mb-1">{i + 1}. {q.question}</p>
                <p className="text-sm">תשובתך: {ans.selected_index !== null ? q.answers[ans.selected_index] : 'לא נענה'}</p>
                {!ans.is_correct && <p className="text-sm text-green-700 dark:text-green-400">תשובה נכונה: {q.answers[q.correct]}</p>}
                <p className="text-xs text-muted-foreground mt-1">{q.explanation}</p>
              </div>
            );
          })}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-primary/5">
        <h2 className="text-xl font-bold">{driverName}</h2>
        {companyName && <p className="text-sm">{companyName}</p>}
        {vehiclePlate && <p className="text-sm">רכב: {vehiclePlate}</p>}
        <p className="text-sm mt-2">סך שאלות: {questions.length} | ציון עובר: {PASSING_SCORE}</p>
      </Card>

      {questions.map((q, i) => (
        <Card key={`${q.id}-${i}`} className="p-4">
          <div className="flex justify-between mb-2">
            <span className="font-bold">שאלה {i + 1}</span>
            <span className="text-xs text-muted-foreground">{q.category}</span>
          </div>
          <p className="font-medium mb-3">{q.question}</p>
          <div className="space-y-2">
            {q.answers.map((ans, idx) => (
              <label key={idx} className={`flex items-center gap-2 p-3 rounded border cursor-pointer ${answers[q.id] === idx ? 'bg-primary/10 border-primary' : 'border-border'}`}>
                <input
                  type="radio"
                  name={`q_${q.id}`}
                  checked={answers[q.id] === idx}
                  onChange={() => setAnswers({ ...answers, [q.id]: idx })}
                />
                <span>{['א', 'ב', 'ג', 'ד'][idx]}. {ans}</span>
              </label>
            ))}
          </div>
        </Card>
      ))}

      {!showSig ? (
        <Button onClick={handleSubmit} className="w-full h-14 text-lg" disabled={!allAnswered}>
          סיום והמשך לחתימה
        </Button>
      ) : !showManagerSig ? (
        <Card className="p-4">
          <h3 className="font-bold mb-2">חתימת נהג</h3>
          <canvas
            ref={canvasRef}
            width={500}
            height={200}
            className="border border-border rounded w-full bg-white touch-none"
            onPointerDown={driverDraw.start}
            onPointerMove={driverDraw.move}
            onPointerUp={driverDraw.end}
            onPointerLeave={driverDraw.end}
          />
          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={driverDraw.clear}>נקה</Button>
            <Button onClick={handleDriverSigned} className="flex-1">
              {showManagerSignature ? 'המשך לחתימת מנהל' : submitting ? 'שולח...' : 'אשר ושלח'}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <h3 className="font-bold mb-2">חתימת מנהל צי</h3>
          <canvas
            ref={managerCanvasRef}
            width={500}
            height={200}
            className="border border-border rounded w-full bg-white touch-none"
            onPointerDown={managerDraw.start}
            onPointerMove={managerDraw.move}
            onPointerUp={managerDraw.end}
            onPointerLeave={managerDraw.end}
          />
          <div className="flex gap-2 mt-3">
            <Button variant="outline" onClick={managerDraw.clear}>נקה</Button>
            <Button onClick={finalSubmit} disabled={submitting} className="flex-1">
              {submitting ? 'שולח...' : 'אשר ושלח'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
