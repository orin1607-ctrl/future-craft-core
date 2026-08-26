import { useState, useEffect, useCallback, useRef } from 'react';
import { getOpenCallForEmployee } from '@/features/telemarketing/services/telemarketingService';
import {
  endWorkSession,
  getOpenWorkSession,
  startWorkSession,
  submitWorkSessionReport,
} from '@/features/telemarketing/services/workSessionService';
import type { TelemarketingWorkSession, UrgencyLevel, WorkTaskType } from '@/features/telemarketing/types';
import { EMPTY_DALIA_CARE } from '@/features/telemarketing/components/DaliaCare/DaliaCareFields';
import { validateDaliaCare } from '@/features/telemarketing/services/teamChatService';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface WorkDraft {
  taskType: WorkTaskType | '';
  description: string;
  note: string;
  needsFollowUp: boolean;
  companyName: string;
  contactName: string;
  phone: string;
  needsDaliaCare: boolean;
  daliaCareType: string;
  daliaCareTypeOther: string;
  daliaCareDetail: string;
  daliaCareUrgency: UrgencyLevel;
  daliaCareDueDate: string;
}

const EMPTY_WORK_DRAFT: WorkDraft = {
  taskType: '',
  description: '',
  note: '',
  needsFollowUp: false,
  companyName: '',
  contactName: '',
  phone: '',
  ...EMPTY_DALIA_CARE,
};

export function useActiveWorkSession(employeeId?: string, employeeName?: string) {
  const [session, setSession] = useState<TelemarketingWorkSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reportElapsedSeconds, setReportElapsedSeconds] = useState(0);
  const [draft, setDraft] = useState<WorkDraft>(EMPTY_WORK_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string>(uuid());
  const lockRef = useRef(false);

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    void getOpenWorkSession(employeeId).then((open) => {
      if (cancelled || !open) return;
      setSession(open);
      setDraft((prev) => ({
        ...prev,
        companyName: open.companyName || prev.companyName,
        contactName: open.contactName || prev.contactName,
        phone: open.phone || prev.phone,
        taskType: (open.taskType as WorkTaskType) || prev.taskType,
        description: open.description || prev.description,
      }));
      if (open.endedAt && open.durationSeconds != null) setElapsedSeconds(open.durationSeconds);
      else setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(open.startedAt).getTime()) / 1000)));
    });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  useEffect(() => {
    if (session && !session.endedAt) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session]);

  useEffect(() => {
    if (session && session.endedAt && session.status === 'in_progress') {
      const startMs = new Date(session.reportStartedAt || session.endedAt).getTime();
      setReportElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
      reportTimerRef.current = setInterval(() => {
        setReportElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
      }, 1000);
    } else {
      if (!session || session.status === 'completed') setReportElapsedSeconds(0);
      if (reportTimerRef.current) clearInterval(reportTimerRef.current);
    }
    return () => {
      if (reportTimerRef.current) clearInterval(reportTimerRef.current);
    };
  }, [session]);

  const beginWork = useCallback(
    async (lead?: { companyName?: string; contactName?: string; phone?: string }) => {
      if (!employeeId || !employeeName) throw new Error('חסר משתמש מחובר');
      setStarting(true);
      setError(null);
      try {
        const openCall = await getOpenCallForEmployee(employeeId);
        if (openCall) {
          throw new Error('יש שיחה פעילה — יש לסיים אותה לפני משימת עבודה');
        }
        const openWork = await getOpenWorkSession(employeeId);
        if (openWork) {
          setSession(openWork);
          throw new Error('יש משימת עבודה פעילה — יש להשלים דיווח לפני משימה חדשה');
        }
        tokenRef.current = uuid();
        const created = await startWorkSession({
          employeeId,
          employeeName,
          companyName: lead?.companyName,
          contactName: lead?.contactName,
          phone: lead?.phone,
          clientToken: tokenRef.current,
        });
        setSession(created);
        setElapsedSeconds(0);
        setDraft({
          ...EMPTY_WORK_DRAFT,
          companyName: lead?.companyName || '',
          contactName: lead?.contactName || '',
          phone: lead?.phone || '',
        });
        return created;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'שגיאה בהתחלת משימה';
        setError(message);
        throw e;
      } finally {
        setStarting(false);
      }
    },
    [employeeId, employeeName],
  );

  const finishWorkTiming = useCallback(async () => {
    if (!session) return;
    try {
      const updated = await endWorkSession(session.id);
      setSession(updated);
      if (updated.durationSeconds != null) setElapsedSeconds(updated.durationSeconds);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בסיום משימה');
    }
  }, [session]);

  const updateDraft = useCallback((patch: Partial<WorkDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const submitWork = useCallback(async (): Promise<boolean> => {
    if (!session || lockRef.current) return false;
    if (!draft.taskType) {
      setError('חובה לבחור סוג משימה');
      return false;
    }
    if (!draft.description.trim()) {
      setError('חובה לכתוב מה בוצע');
      return false;
    }
    const daliaError = validateDaliaCare(draft);
    if (daliaError) {
      setError(daliaError);
      return false;
    }
    lockRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await submitWorkSessionReport({
        sessionId: session.id,
        taskType: draft.taskType,
        description: draft.description,
        note: draft.note,
        needsFollowUp: draft.needsFollowUp,
        companyName: draft.companyName,
        contactName: draft.contactName,
        phone: draft.phone,
        needsDaliaCare: draft.needsDaliaCare,
        daliaCareType: draft.daliaCareType,
        daliaCareTypeOther: draft.daliaCareTypeOther,
        daliaCareDetail: draft.daliaCareDetail,
        daliaCareUrgency: draft.needsDaliaCare ? draft.daliaCareUrgency : undefined,
        daliaCareDueDate: draft.daliaCareDueDate || undefined,
      });
      setSession(null);
      setDraft(EMPTY_WORK_DRAFT);
      setElapsedSeconds(0);
      setReportElapsedSeconds(0);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירת המשימה');
      return false;
    } finally {
      lockRef.current = false;
      setSubmitting(false);
    }
  }, [session, draft]);

  return {
    session,
    elapsedSeconds,
    reportElapsedSeconds,
    draft,
    updateDraft,
    beginWork,
    finishWorkTiming,
    submitWork,
    submitting,
    starting,
    error,
  };
}
