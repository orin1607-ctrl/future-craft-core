import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CustomerCallCard } from '@/features/telemarketing/components/CallerScreen/CustomerCallCard';
import { CallTimerBar } from '@/features/telemarketing/components/CallerScreen/CallTimerBar';
import { CallReportForm } from '@/features/telemarketing/components/CallerScreen/CallReportForm';
import { WorkTimerBar } from '@/features/telemarketing/components/WorkSession/WorkTimerBar';
import { WorkReportForm } from '@/features/telemarketing/components/WorkSession/WorkReportForm';
import { MyFollowUps } from '@/features/telemarketing/components/FollowUp/MyFollowUps';
import { LeadTimeline } from '@/features/telemarketing/components/FollowUp/LeadTimeline';
import { LeadsBoard } from '@/features/telemarketing/components/Leads/LeadsBoard';
import { DirectoryLeadCard } from '@/features/telemarketing/components/Leads/DirectoryLeadCard';
import { AgentChatEntry, DaliaChatBoard } from '@/features/telemarketing/components/DaliaCare/DaliaChatBoard';
import { MyActivityReport } from '@/features/telemarketing/components/CallerScreen/MyActivityReport';
import { DALIA_CHAT_PARAM } from '@/features/telemarketing/lib/daliaChatNav';
import { agentHomeActionsVisible } from '@/features/telemarketing/lib/agentHomeVisibility';
import { useActiveCall } from '@/features/telemarketing/hooks/useActiveCall';
import { useActiveWorkSession } from '@/features/telemarketing/hooks/useActiveWorkSession';
import { getFollowUpWorkItems, getLeadHistory } from '@/features/telemarketing/services/telemarketingService';
import { claimAssignedLead, claimNextAssignedLead, createManualDirectoryLead, listLeadDirectory } from '@/features/telemarketing/services/leadDirectoryService';
import { directoryLeadToCustomer } from '@/features/telemarketing/lib/leadAssign/selectScope';
import { keepsContinuedTreatment } from '@/features/telemarketing/lib/leadTraffic';
import { formatLeadTitle } from '@/features/telemarketing/lib/leadLabel';
import type { CustomerRef, FollowUpWorkItem, TelemarketingEmployee } from '@/features/telemarketing/types';
import type { LeadDirectoryRecord } from '@/features/telemarketing/lib/leadImport/types';
import { TeleInnerNav, TeleOverlayNavProvider } from '@/features/telemarketing/components/Nav/TeleInnerNav';
import { ClipboardList } from 'lucide-react';

const EMPTY_MANUAL_CUSTOMER: CustomerRef = {
  companyName: '',
  contactName: '',
  contactRole: '',
  phone: '',
  email: '',
  vehicleCount: null,
  city: '',
};

export function TelemarketingAgentScreen({ currentEmployee }: { currentEmployee: TelemarketingEmployee }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [manualCustomer, setManualCustomer] = useState<CustomerRef>(EMPTY_MANUAL_CUSTOMER);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [followUpReload, setFollowUpReload] = useState(0);
  const [returnHint, setReturnHint] = useState<FollowUpWorkItem | null>(null);
  const [activeDirectoryLead, setActiveDirectoryLead] = useState<LeadDirectoryRecord | null>(null);
  const [dueFollowUpCount, setDueFollowUpCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [myReportOpen, setMyReportOpen] = useState(false);
  const {
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
  } = useActiveCall(currentEmployee.id);
  const {
    session: workSession,
    elapsedSeconds: workElapsed,
    reportElapsedSeconds: workReportElapsed,
    draft: workDraft,
    updateDraft: updateWorkDraft,
    beginWork,
    finishWorkTiming,
    submitWork,
    submitting: workSubmitting,
    starting: workStarting,
    error: workError,
  } = useActiveWorkSession(currentEmployee.id, currentEmployee.displayName);

  useLayoutEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    setChatOpen(false);
    setMyReportOpen(false);
    window.scrollTo(0, 0);
    if (window.history.state?.teleAgentChat) {
      window.history.replaceState({ ...(window.history.state || {}), teleAgentChat: false }, '');
    }
    const params = new URLSearchParams(location.search);
    const dirty =
      params.has(DALIA_CHAT_PARAM) ||
      params.has('v') ||
      /dalia/i.test(location.hash);
    if (dirty) {
      navigate({ pathname: '/telemarketing', search: '', hash: '' }, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (chatOpen || myReportOpen) return;
    window.scrollTo(0, 0);
  }, [chatOpen, myReportOpen]);

  useEffect(() => {
    const onPop = () => {
      setChatOpen(false);
      setMyReportOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const openChats = () => {
    setMyReportOpen(false);
    setChatOpen(true);
    window.history.pushState({ teleAgentChat: true }, '');
    window.scrollTo(0, 0);
  };

  const openMyReport = () => {
    setChatOpen(false);
    setMyReportOpen(true);
    window.scrollTo(0, 0);
  };

  const backToWork = () => {
    setChatOpen(false);
    setMyReportOpen(false);
    window.scrollTo(0, 0);
    if (window.history.state?.teleAgentChat) {
      window.history.replaceState({ ...(window.history.state || {}), teleAgentChat: false }, '');
    }
    navigate({ pathname: '/telemarketing', search: '', hash: '' }, { replace: true });
  };

  useEffect(() => {
    if (!call?.sourceFollowUpId) {
      setReturnHint(null);
      return;
    }
    let cancelled = false;
    void getFollowUpWorkItems().then((rows) => {
      if (cancelled) return;
      const found = rows.find((row) => row.id === call.sourceFollowUpId);
      if (found) setReturnHint(found);
    });
    return () => {
      cancelled = true;
    };
  }, [call?.sourceFollowUpId]);

  useEffect(() => {
    let cancelled = false;
    void getFollowUpWorkItems().then((rows) => {
      if (cancelled) return;
      const today = new Date().toISOString().slice(0, 10);
      setDueFollowUpCount(rows.filter((row) => row.status !== 'done' && row.dueDate && row.dueDate <= today).length);
    }).catch(() => setDueFollowUpCount(0));
    return () => {
      cancelled = true;
    };
  }, [followUpReload]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  };

  const startCallWith = async (customer: CustomerRef, sourceFollowUpId?: string | null) => {
    await beginCall({
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.displayName,
      customerId: null,
      companyName: customer.companyName,
      contactName: customer.contactName,
      contactRole: customer.contactRole,
      phone: customer.phone,
      email: customer.email,
      vehicleCount: customer.vehicleCount,
      city: customer.city,
      sourceFollowUpId: sourceFollowUpId || undefined,
    });
  };

  const handleStart = async () => {
    if (!manualCustomer.companyName && !manualCustomer.phone) {
      showToast('error', 'חובה למלא שם חברה או טלפון לפני התחלת שיחה');
      return;
    }
    try {
      if (!activeDirectoryLead) {
        const resolved = await createManualDirectoryLead({
          companyName: manualCustomer.companyName,
          phone: manualCustomer.phone,
          email: manualCustomer.email,
          region: manualCustomer.city,
          fleetSize: manualCustomer.vehicleCount != null ? String(manualCustomer.vehicleCount) : '',
        });
        if (resolved.action === 'duplicate_other') {
          showToast('error', `הטלפון/מייל כבר במאגר (ליד ${resolved.leadNumber || ''}). בקשו ממנהל-על לשייך את הליד אליכם.`);
          return;
        }
        if (resolved.lead) {
          setActiveDirectoryLead(resolved.lead);
          setManualCustomer(directoryLeadToCustomer(resolved.lead));
          if (resolved.action === 'created') {
            showToast('success', `נוצר ליד #${resolved.lead.leadNumber}`);
          } else if (resolved.action === 'existing') {
            showToast('success', `הליד כבר במאגר (#${resolved.lead.leadNumber}) — ממשיכים עליו, לא נוצר ליד חדש`);
          }
          await startCallWith(directoryLeadToCustomer(resolved.lead), returnHint?.id);
          return;
        }
      }
      await startCallWith(manualCustomer, returnHint?.id);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'שגיאה בהתחלת שיחה');
    }
  };

  const handleWorkFromList = async () => {
    try {
      const next = await claimNextAssignedLead();
      if (!next) {
        showToast('error', 'אין ליד משויך פנוי בתור');
        return;
      }
      setReturnHint(null);
      setActiveDirectoryLead(next);
      setManualCustomer(directoryLeadToCustomer(next));
      showToast('success', `ליד #${next.leadNumber} מוכן. לחצו התחל שיחה אחרי שקראתם את הפרטים.`);
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'שגיאה בלקיחת ליד מהרשימה');
    }
  };

  const handleStartReturn = async (item: FollowUpWorkItem) => {
    const history = await getLeadHistory(item.phone, item.companyName);
    const last = history[history.length - 1];
    const lead: CustomerRef = {
      companyName: item.companyName || last?.companyName || '',
      contactName: item.contactName || last?.contactName,
      contactRole: last?.contactRole,
      phone: item.phone || last?.phone || '',
      email: last?.email,
      vehicleCount: last?.vehicleCount ?? null,
      city: last?.city,
    };
    try {
      const directory = await listLeadDirectory();
      const phoneKey = (lead.phone || '').replace(/[^0-9*]/g, '');
      const match = directory.find((row) => {
        const rowPhone = (row.phone || '').replace(/[^0-9*]/g, '');
        return (phoneKey && rowPhone === phoneKey) || (!phoneKey && row.companyName === lead.companyName);
      });
      if (match) {
        try {
          setActiveDirectoryLead(await claimAssignedLead(match.id));
        } catch {
          setActiveDirectoryLead(match);
        }
      }
    } catch {
      /* keep return without directory card */
    }
    setManualCustomer(lead);
    setReturnHint(item);
    showToast('success', 'פרטי הליד מוצגים. לחצו התחל שיחה כדי להמשיך טיפול.');
  };

  const handleStartWork = async () => {
    try {
      await beginWork({
        companyName: manualCustomer.companyName,
        contactName: manualCustomer.contactName,
        phone: manualCustomer.phone,
      });
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'שגיאה בהתחלת משימה');
    }
  };

  const handleSubmitWork = async () => {
    const ok = await submitWork();
    if (ok) {
      showToast('success', 'משימת העבודה נשמרה');
      setFollowUpReload((n) => n + 1);
    } else {
      showToast('error', 'לא ניתן לשמור את המשימה');
    }
  };

  const handleSubmit = async () => {
    const continued = keepsContinuedTreatment(draft.result);
    const ok = await submitReport();
    if (ok) {
      showToast('success', continued ? 'נשמר בהמשך טיפול על אותו ליד. הליד לא נסגר.' : 'השיחה נשמרה בהצלחה');
      setManualCustomer(EMPTY_MANUAL_CUSTOMER);
      setActiveDirectoryLead(null);
      setReturnHint(null);
      setFollowUpReload((n) => n + 1);
    } else {
      showToast('error', 'לא ניתן לשמור - יש לתקן ולנסות שוב. הטקסט שהוזן לא נמחק.');
    }
  };

  const callStatus = !call ? 'idle' : call.endedAt ? 'ended' : 'in_progress';
  const reportOpen = callStatus === 'ended';
  const workStatus = !workSession ? 'idle' : workSession.endedAt ? 'ended' : 'in_progress';
  const workReportOpen = workStatus === 'ended';
  const showIdleBoards = agentHomeActionsVisible(callStatus, workStatus);
  const showHomeActions = callStatus === 'idle' && workStatus === 'idle';
  const showLeadPreview = showHomeActions && Boolean(activeDirectoryLead || returnHint);
  const clearLeadPreview = () => {
    setActiveDirectoryLead(null);
    setReturnHint(null);
    setManualCustomer(EMPTY_MANUAL_CUSTOMER);
  };
  const goAgentDashboard = () => {
    setChatOpen(false);
    setMyReportOpen(false);
    navigate({ pathname: '/telemarketing', search: '', hash: '' });
    requestAnimationFrame(() => {
      document.getElementById('tele-work-home')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const inner = myReportOpen ? (
    <MyActivityReport
      employeeName={currentEmployee.displayName}
      onBack={() => setMyReportOpen(false)}
      onHome={goAgentDashboard}
    />
  ) : chatOpen ? (
      <DaliaChatBoard
        currentUserId={currentEmployee.id}
        currentUserName={currentEmployee.displayName}
        isAdmin={false}
        reloadToken={followUpReload}
        onBackToWork={backToWork}
      />
  ) : (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      {toast && (
        <div
          className={`fixed inset-x-4 top-4 z-50 rounded-xl p-3 text-center font-bold text-white ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-destructive'
          }`}
        >
          {toast.text}
        </div>
      )}

      <div
        data-testid="telemarketing-agent-home"
        data-tele-build={String(import.meta.env.VITE_BUILD_COMMIT || '').slice(0, 7)}
        id="tele-work-home"
        className="scroll-mt-28"
      >
        <h1 className="text-2xl font-black">טלמיטינג</h1>
        <p className="text-sm text-muted-foreground">
          {currentEmployee.displayName}
          {currentEmployee.employeeCode ? ` · ${currentEmployee.employeeCode}` : ''}
        </p>
        {showIdleBoards && (
          <div className="mt-3 space-y-2">
            <CallTimerBar
              status="idle"
              elapsedSeconds={elapsedSeconds}
              reportElapsedSeconds={reportElapsedSeconds}
              starting={starting}
              isRecording={false}
              employeeName={currentEmployee.displayName}
              onStart={() => void handleStart()}
              onEnd={() => void finishCallTiming()}
            />
            <AgentChatEntry currentUserId={currentEmployee.id} onOpen={openChats} reloadToken={followUpReload} />
            <button
              type="button"
              data-testid="tele-my-report"
              onClick={openMyReport}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-primary bg-primary/10 py-4 text-lg font-black text-foreground active:scale-[0.99]"
            >
              📊 הדוח שלי
            </button>
            {showHomeActions && !activeDirectoryLead && (
              <button
                type="button"
                data-testid="tele-work-from-list"
                onClick={() => void handleWorkFromList()}
                disabled={starting}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-amber-700 py-4 text-lg font-bold text-white active:scale-[0.99] disabled:opacity-50"
              >
                <ClipboardList size={22} />
                📋 עבודה מרשימת לידים
              </button>
            )}
          </div>
        )}
        {showHomeActions && dueFollowUpCount > 0 && (
          <p className="mt-2 rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-sm font-semibold dark:bg-amber-950/30">
            יש {dueFollowUpCount} לידים בהמשך טיפול. הם מוצגים למטה ולא נעלמים בגלל רצף הרשימה.
          </p>
        )}
        {(error || workError) && !call && !workSession && (
          <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm font-semibold text-destructive">{error || workError}</p>
        )}
      </div>

      {showLeadPreview && (
        <div className="space-y-2" data-testid="tele-lead-preview">
          <TeleInnerNav
            onBack={clearLeadPreview}
            onHome={() => {
              clearLeadPreview();
              goAgentDashboard();
            }}
          />
          {activeDirectoryLead && (
            <p className="rounded-xl border border-emerald-700/40 bg-emerald-50 p-3 text-center text-xl font-black dark:bg-emerald-950/30" data-testid="tele-lead-number">
              {formatLeadTitle(activeDirectoryLead.leadNumber, activeDirectoryLead.companyName)}
            </p>
          )}
          {activeDirectoryLead && (
            <p className="rounded-xl border border-emerald-700/40 bg-emerald-50 p-3 text-sm font-semibold dark:bg-emerald-950/30">
              פרטי הליד מוצגים למטה. השיחה לא התחילה. לחצו «התחל שיחה» כשאתם מוכנים.
            </p>
          )}
        </div>
      )}

      {(call?.sourceFollowUpId || (returnHint && showHomeActions)) && (
        <div className="space-y-2 rounded-xl border border-primary/40 bg-primary/10 p-3 text-sm">
          <p className="font-black">
            {formatLeadTitle(activeDirectoryLead?.leadNumber, returnHint?.companyName || activeDirectoryLead?.companyName)}
          </p>
          <p className="font-black">
            {call?.sourceFollowUpId ? 'שיחת חזרה — נוצרת רשומת שיחה חדשה. הסיכום הקודם נשמר בהיסטוריה.' : 'המשך טיפול — אותו ליד. לחצו התחל שיחה אחרי עיון בפרטים.'}
          </p>
          {returnHint && (
            <>
              <p>
                מועד החזרה: {returnHint.dueDate}
                {returnHint.dueTime ? ` ${returnHint.dueTime}` : ''} · {returnHint.urgency}
              </p>
              {returnHint.actionNeeded && <p className="font-semibold">מה צריך לבצע: {returnHint.actionNeeded}</p>}
              {returnHint.lastSummary && <p>סיכום קודם: {returnHint.lastSummary}</p>}
            </>
          )}
          {returnHint && (
            <details className="rounded-lg bg-background/70 p-2">
              <summary className="cursor-pointer font-bold">היסטוריית שיחות</summary>
              <div className="mt-2">
                <LeadTimeline followUp={returnHint} actor={{ id: currentEmployee.id, displayName: currentEmployee.displayName }} />
              </div>
            </details>
          )}
        </div>
      )}

      {showIdleBoards && (
        <div id="new-lead" className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-base font-black">לקוח / ליד חדש</p>
          <p className="text-xs text-muted-foreground">
            מילאו שם חברה או טלפון, ואז לחצו התחל שיחה. ליד חדש מקבל מספר אוטומטי ונכנס למאגר המנהל. «עבודה מרשימת לידים» לוקחת את הליד הבא ששויך אליכם.
          </p>
          <label className="block text-xs font-semibold text-muted-foreground">
            שם החברה
            <input
              placeholder="שם החברה"
              value={manualCustomer.companyName}
              onChange={(e) => setManualCustomer((c) => ({ ...c, companyName: e.target.value }))}
              className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              איש קשר
              <input
                placeholder="איש קשר"
                value={manualCustomer.contactName}
                onChange={(e) => setManualCustomer((c) => ({ ...c, contactName: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
              />
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              תפקיד
              <input
                placeholder="תפקיד"
                value={manualCustomer.contactRole}
                onChange={(e) => setManualCustomer((c) => ({ ...c, contactRole: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              טלפון
              <input
                placeholder="טלפון"
                value={manualCustomer.phone}
                onChange={(e) => setManualCustomer((c) => ({ ...c, phone: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
                dir="ltr"
              />
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              אימייל
              <input
                placeholder="אימייל"
                value={manualCustomer.email}
                onChange={(e) => setManualCustomer((c) => ({ ...c, email: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
                dir="ltr"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold text-muted-foreground">
              מס' רכבים
              <input
                placeholder="מס' רכבים"
                type="number"
                value={manualCustomer.vehicleCount ?? ''}
                onChange={(e) =>
                  setManualCustomer((c) => ({ ...c, vehicleCount: e.target.value ? Number(e.target.value) : null }))
                }
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
              />
            </label>
            <label className="block text-xs font-semibold text-muted-foreground">
              עיר
              <input
                placeholder="עיר"
                value={manualCustomer.city}
                onChange={(e) => setManualCustomer((c) => ({ ...c, city: e.target.value }))}
                className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background p-3 text-base font-normal text-foreground"
              />
            </label>
          </div>
        </div>
      )}

      {showIdleBoards && <MyFollowUps onStartReturn={(item) => void handleStartReturn(item)} reloadToken={followUpReload} currentEmployee={currentEmployee} />}

      {showIdleBoards && <LeadsBoard currentEmployee={currentEmployee} hideEmployeeFilter />}

      {callStatus === 'ended' && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-50 p-3 text-sm font-semibold dark:bg-amber-950/30">
          יש להשלים דיווח למטה לפני מעבר ללקוח / ליד הבא
        </p>
      )}

      {activeDirectoryLead && (call || showHomeActions) && <DirectoryLeadCard lead={activeDirectoryLead} />}

      {(call || manualCustomer.companyName || manualCustomer.phone) && (
        <CustomerCallCard
          leadNumber={activeDirectoryLead?.leadNumber}
          customer={call ? {
          companyName: call.companyName,
          contactName: call.contactName,
          contactRole: call.contactRole,
          phone: call.phone,
          email: call.email,
          vehicleCount: call.vehicleCount,
          city: call.city,
        } : manualCustomer} />
      )}

      {callStatus !== 'idle' && (
        <CallTimerBar
          status={callStatus}
          elapsedSeconds={elapsedSeconds}
          reportElapsedSeconds={reportElapsedSeconds}
          starting={starting}
          isRecording={isRecording}
          startedAt={call?.startedAt}
          endedAt={call?.endedAt}
          employeeName={call?.employeeName || currentEmployee.displayName}
          leadLabel={activeDirectoryLead?.leadNumber ? formatLeadTitle(activeDirectoryLead.leadNumber, call?.companyName || activeDirectoryLead.companyName) : undefined}
          onStart={() => void handleStart()}
          onEnd={() => void finishCallTiming()}
        />
      )}

      {reportOpen && (
        <CallReportForm
          leadNumber={activeDirectoryLead?.leadNumber}
          companyName={call?.companyName || activeDirectoryLead?.companyName}
          draft={draft}
          onChange={updateDraft}
          onSubmit={() => void handleSubmit()}
          submitting={submitting}
          error={error}
        />
      )}

      {workStatus !== 'idle' && (
        <WorkTimerBar
          status={workStatus}
          elapsedSeconds={workElapsed}
          reportElapsedSeconds={workReportElapsed}
          starting={workStarting}
          startedAt={workSession?.startedAt}
          endedAt={workSession?.endedAt}
          employeeName={workSession?.employeeName || currentEmployee.displayName}
          onStart={() => void handleStartWork()}
          onEnd={() => void finishWorkTiming()}
        />
      )}
      {workReportOpen && (
        <WorkReportForm
          draft={workDraft}
          onChange={updateWorkDraft}
          onSubmit={() => void handleSubmitWork()}
          submitting={workSubmitting}
          error={workError}
        />
      )}
    </div>
  );

  return (
    <TeleOverlayNavProvider homePath="/telemarketing" homeAnchorId="tele-work-home">
      {inner}
    </TeleOverlayNavProvider>
  );
}
