import { useState, useEffect, useCallback, useRef } from 'react';
import { startCall, endCall, submitCallReport } from '@/features/telemarketing/services/telemarketingService';
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
};

export function useActiveCall() {
  const [call, setCall] = useState<TelemarketingCall | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [draft, setDraft] = useState<ReportDraft>(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const persistDraft = useCallback((callId: string, nextDraft: ReportDraft, clientToken: string) => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ callId, draft: nextDraft, clientToken }));
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  useEffect(() => {
    if (call && call.status === 'in_progress') {
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

  const beginCall = useCallback(async (payload: Omit<StartCallPayload, 'clientToken'>) => {
    setStarting(true);
    setError(null);
    const clientToken = uuid();
    submitTokenRef.current = uuid();
    try {
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
  }, [persistDraft]);

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
    if (draft.needsFollowUp && !draft.followUpDate) {
      setError('נדרשת המשכיות מסומן - חובה למלא תאריך לחזרה');
      return false;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setError(null);

    const payload: CompleteCallReportPayload = {
      callId: call.id,
      result: draft.result,
      leadRating: draft.leadRating,
      summary: draft.summary.trim(),
      needsFollowUp: draft.needsFollowUp,
      nextAction: draft.nextAction.trim() || undefined,
      followUpOwner: draft.followUpOwner.trim() || undefined,
      followUpDate: draft.followUpDate || undefined,
      followUpTime: draft.followUpTime || undefined,
      followUpUrgency: draft.needsFollowUp ? draft.followUpUrgency : undefined,
      managerNote: draft.managerNote.trim() || undefined,
      clientToken: submitTokenRef.current,
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
