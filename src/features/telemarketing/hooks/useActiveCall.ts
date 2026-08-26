import { useState, useEffect, useCallback, useRef } from 'react';
import { startCall, endCall, submitCallReport, getOpenCallForEmployee } from '@/features/telemarketing/services/telemarketingService';
import { getOpenWorkSession } from '@/features/telemarketing/services/workSessionService';
import { sendFollowUpNotifications } from '@/features/telemarketing/services/notificationService';
import {
  startCallRecording,
  stopCallRecording,
  uploadCallRecording,
  markCallRecordingStatus,
} from '@/features/telemarketing/services/callRecordingService';
import type {
  CallResult,
  CompleteCallReportPayload,
  LeadRating,
  StartCallPayload,
  TelemarketingCall,
  UrgencyLevel,
} from '@/features/telemarketing/types';
import type { LeadColor, LeadStatus } from '@/features/telemarketing/lib/leadTraffic';
import { EMPTY_DALIA_CARE } from '@/features/telemarketing/components/DaliaCare/DaliaCareFields';
import { validateDaliaCare } from '@/features/telemarketing/services/teamChatService';
import { keepsContinuedTreatment } from '@/features/telemarketing/lib/leadTraffic';
import { localDateStr } from '@/features/telemarketing/lib/localDate';

const DRAFT_KEY = 'telemarketing_draft_report_v1';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ReportDraft {
  result: CallResult | null;
  leadRating: LeadRating | null;
  summary: string;
  needsFollowUp: boolean;
  nextAction: string;
  followUpOwner: string;
  followUpDate: string;
  followUpTime: string;
  followUpUrgency: UrgencyLevel;
  managerNote: string;
  leadColor: LeadColor | null;
  leadStatus: LeadStatus | null;
  closeReason: string;
  closeOpenFollowUps: boolean;
  leadColorTouched: boolean;
  needsDaliaCare: boolean;
  daliaCareType: string;
  daliaCareTypeOther: string;
  daliaCareDetail: string;
  daliaCareUrgency: UrgencyLevel;
  daliaCareDueDate: string;
}

const EMPTY_DRAFT: ReportDraft = {
  result: null,
  leadRating: null,
  summary: '',
  needsFollowUp: false,
  nextAction: '',
  followUpOwner: '',
  followUpDate: '',
  followUpTime: '',
  followUpUrgency: 'רגיל',
  managerNote: '',
  leadColor: null,
  leadStatus: null,
  closeReason: '',
  closeOpenFollowUps: true,
  leadColorTouched: false,
  ...EMPTY_DALIA_CARE,
};

export function useActiveCall(employeeId?: string) {
  const [call, setCall] = useState<TelemarketingCall | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [reportElapsedSeconds, setReportElapsedSeconds] = useState(0);
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitTokenRef = useRef<string>(uuid());
  const submitLockRef = useRef(false);

  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.callId && parsed.draft) {
          setDraft(parsed.draft);
          submitTokenRef.current = parsed.clientToken || uuid();
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    let cancelled = false;
    void getOpenCallForEmployee(employeeId).then((open) => {
      if (cancelled || !open) return;
      setCall(open);
      if (open.endedAt && open.durationSeconds != null) {
        setElapsedSeconds(open.durationSeconds);
        if (open.status === 'in_progress') {
          const startMs = new Date(open.reportStartedAt || open.endedAt).getTime();
          setReportElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
        }
      } else {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(open.startedAt).getTime()) / 1000)));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const persistDraft = useCallback((callId: string, nextDraft: ReportDraft, clientToken: string) => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ callId, draft: nextDraft, clientToken }));
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  useEffect(() => {
    if (call && !call.endedAt) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - new Date(call.startedAt).getTime()) / 1000));
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [call]);

  useEffect(() => {
    if (call && call.endedAt && call.status === 'in_progress') {
      const startMs = new Date(call.reportStartedAt || call.endedAt).getTime();
      setReportElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
      reportTimerRef.current = setInterval(() => {
        setReportElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
      }, 1000);
    } else {
      if (!call || call.status === 'completed') setReportElapsedSeconds(0);
      if (reportTimerRef.current) clearInterval(reportTimerRef.current);
    }
    return () => {
      if (reportTimerRef.current) clearInterval(reportTimerRef.current);
    };
  }, [call]);

  const beginCall = useCallback(async (payload: Omit<StartCallPayload, 'clientToken'>) => {
    setStarting(true);
    setError(null);
    try {
      const open = employeeId ? await getOpenCallForEmployee(employeeId) : null;
      if (open) {
        setCall(open);
        if (open.endedAt && open.durationSeconds != null) setElapsedSeconds(open.durationSeconds);
        throw new Error('יש שיחה פתוחה — יש להשלים דיווח לפני לקוח חדש');
      }
      if (employeeId) {
        const openWork = await getOpenWorkSession(employeeId);
        if (openWork) {
          throw new Error('יש משימת עבודה פעילה — יש לסיים אותה לפני התחלת שיחה');
        }
      }
      const clientToken = uuid();
      submitTokenRef.current = uuid();
      const created = await startCall({ ...payload, clientToken });
      setCall(created);
      setElapsedSeconds(0);
      setDraft(EMPTY_DRAFT);
      persistDraft(created.id, EMPTY_DRAFT, submitTokenRef.current);
      void startCallRecording()
        .then((started) => {
          setIsRecording(started);
          if (started) void markCallRecordingStatus(created.id, 'pending');
        })
        .catch(() => setIsRecording(false));
      return created;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'שגיאה בהתחלת שיחה';
      setError(message);
      throw e;
    } finally {
      setStarting(false);
    }
  }, [persistDraft, employeeId]);

  const finishCallTiming = useCallback(async () => {
    if (!call) return;
    setIsRecording(false);
    const blobPromise = stopCallRecording().catch(() => null);
    try {
      const updated = await endCall(call.id);
      setCall(updated);
      if (updated.durationSeconds != null) setElapsedSeconds(updated.durationSeconds);
      void blobPromise.then(async (blob) => {
        if (!blob || blob.size <= 0) return;
        try {
          const uploaded = await uploadCallRecording({
            callId: updated.id,
            employeeId: updated.employeeId,
            blob,
          });
          setCall((prev) =>
            prev && prev.id === updated.id
              ? {
                  ...prev,
                  recordingPath: uploaded.path,
                  recordingStatus: uploaded.status,
                  recordingMime: uploaded.mime,
                }
              : prev,
          );
        } catch {
          /* upload failure must not undo End Call */
        }
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בסיום שיחה');
    }
  }, [call]);

  const updateDraft = useCallback(
    (patch: Partial<ReportDraft>) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        if (call) persistDraft(call.id, next, submitTokenRef.current);
        return next;
      });
    },
    [call, persistDraft],
  );

  const submitReport = useCallback(async (): Promise<boolean> => {
    if (!call) return false;
    if (submitting || submitLockRef.current) return false;

    if (!draft.result) {
      setError('חובה לבחור תוצאת שיחה');
      return false;
    }
    if (!draft.leadRating) {
      setError('חובה לבחור דירוג ליד');
      return false;
    }
    if (!draft.summary.trim()) {
      setError('חובה למלא סיכום קצר');
      return false;
    }
    if (draft.needsFollowUp && !draft.followUpDate && draft.leadColor !== 'red' && !keepsContinuedTreatment(draft.result)) {
      setError('נדרשת המשכיות מסומן - חובה למלא תאריך לחזרה');
      return false;
    }
    if (!draft.leadColor || !draft.leadStatus) {
      setError('חובה לבחור רמזור ליד (אדום / צהוב / ירוק)');
      return false;
    }
    if (draft.leadColor === 'red' && !draft.closeReason.trim() && !draft.summary.trim()) {
      setError('ליד אדום — חובה לכתוב סיבת סגירה');
      return false;
    }
    const daliaError = validateDaliaCare(draft);
    if (daliaError) {
      setError(daliaError);
      return false;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setError(null);

    const continued = keepsContinuedTreatment(draft.result);
    const payload: CompleteCallReportPayload = {
      callId: call.id,
      result: draft.result,
      leadRating: draft.leadRating,
      summary: draft.summary.trim(),
      needsFollowUp: draft.needsFollowUp || continued,
      nextAction: draft.nextAction.trim() || (continued ? 'המשך טיפול — אין מענה' : undefined),
      followUpOwner: draft.followUpOwner.trim() || (continued ? call.employeeName : undefined),
      followUpDate: draft.followUpDate || (continued ? localDateStr() : undefined),
      followUpTime: draft.followUpTime || undefined,
      followUpUrgency: draft.needsFollowUp || continued ? draft.followUpUrgency : undefined,
      managerNote: draft.managerNote.trim() || undefined,
      clientToken: submitTokenRef.current,
      sourceFollowUpId: call.sourceFollowUpId,
      leadColor: draft.leadColor ?? undefined,
      leadStatus: draft.leadStatus ?? undefined,
      closeReason: draft.closeReason.trim() || draft.summary.trim(),
      closeOpenFollowUps: draft.leadColor === 'red' ? draft.closeOpenFollowUps : false,
      needsDaliaCare: draft.needsDaliaCare,
      daliaCareType: draft.daliaCareType || undefined,
      daliaCareTypeOther: draft.daliaCareTypeOther || undefined,
      daliaCareDetail: draft.daliaCareDetail || undefined,
      daliaCareUrgency: draft.needsDaliaCare ? draft.daliaCareUrgency : undefined,
      daliaCareDueDate: draft.daliaCareDueDate || undefined,
    };

    try {
      const { call: savedCall } = await submitCallReport(payload);
      if (savedCall.needsFollowUp) {
        void sendFollowUpNotifications(savedCall);
      }
      clearDraft();
      setCall(null);
      setDraft(EMPTY_DRAFT);
      setElapsedSeconds(0);
      setReportElapsedSeconds(0);
      setIsRecording(false);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירת הדיווח - הנתונים שהוזנו לא אבדו, ניתן לנסות שוב');
      return false;
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [call, draft, submitting, clearDraft]);

  return {
    call,
    elapsedSeconds,
    reportElapsedSeconds,
    draft,
    updateDraft,
    beginCall,
    finishCallTiming,
    submitReport,
    submitting,
    starting,
    isRecording,
    error,
    setError,
  };
}
