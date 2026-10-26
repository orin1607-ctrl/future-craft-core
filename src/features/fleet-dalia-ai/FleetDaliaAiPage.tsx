import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  Check,
  ExternalLink,
  Mic,
  MicOff,
  Paperclip,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { supabase } from '@/integrations/supabase/client';
import {
  FLEET_ACTIONS,
  FLEET_CATEGORIES,
  actionsForCategory,
  getFleetAction,
  type FleetAction,
  type FleetCategoryId,
} from './actionCatalog';
import { executeFleetAction, type ActionLink } from './liveReads';
import { matchIntent } from './intent';
import { planFleetTurn, type FleetChatTurn } from './fleetConversation';
import {
  CONTINUOUS_MIC_CONFIG,
  GARAGE_MIC,
  pickHebrewVoice,
  speakHebrew,
  stopSpeaking,
} from './speech';
import { KILL_SWITCH_KEY, STAGING_PROJECT_ID, isFleetDaliaAiEnabled } from './stagingGate';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  links?: ActionLink[];
  actionId?: string;
  timestamp?: string;
};

const THREAD_KEY = 'fleet-dalia-ai-thread';

function loadThread(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(THREAD_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

async function askGeneral(text: string, history: ChatMessage[], companyName?: string): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return 'יש להתחבר למערכת כדי לשוחח עם דליה AI.';
    }

    const chatUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-ai-chat`;
    const response = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      },
      body: JSON.stringify({
        module: 'fleet',
        company_name: companyName || undefined,
        messages: [
          ...history.slice(-6).map((item) => ({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: item.content,
          })),
          { role: 'user', content: text },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status === 402 || String(err?.error || '').includes('קרדיטים')) {
        return err?.error || 'יתרת הקרדיטים של שירות ה-AI אזלה. יש לטעון קרדיטים ב-Google AI Studio כדי להמשיך בשירות.';
      }
      return err?.error || `שגיאה בתקשורת עם דליה AI (${response.status}).`;
    }

    const raw = await response.text();
    const lines = raw.split('\n');
    let fullText = '';
    for (const line of lines) {
      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
        try {
          const json = JSON.parse(line.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) fullText += delta;
        } catch {
          // ignore
        }
      }
    }

    return fullText.trim() || 'דליה AI השיבה ללא תוכן.';
  } catch {
    return 'שגיאה בתקשורת עם שירות ה-AI (Gemini). אנא בדוק את החיבור לרשת ונסה שוב בעוד מספר רגעים.';
  }
}

export default function FleetDaliaAiPage() {
  const { user } = useAuth();
  const company = useCompanyFilter();
  const { selectedCompany, setSelectedCompany, companyOptions } = useCompanyScope();
  const storedCompany = (() => {
    try {
      return localStorage.getItem('selectedCompany') || null;
    } catch {
      return null;
    }
  })();
  const effectiveCompany = company || selectedCompany || storedCompany || (companyOptions.length > 0 ? companyOptions[0].name : null);
  const navigate = useNavigate();
  const enabled = isFleetDaliaAiEnabled();

  useEffect(() => {
    if (!company && !selectedCompany && storedCompany) {
      setSelectedCompany(storedCompany);
    } else if (!company && !selectedCompany && companyOptions.length > 0 && user?.role === 'super_admin') {
      setSelectedCompany(companyOptions[0].name);
    }
  }, [company, selectedCompany, storedCompany, companyOptions, user?.role, setSelectedCompany]);

  const [category, setCategory] = useState<FleetCategoryId>('vehicles');
  const [messages, setMessages] = useState<ChatMessage[]>(loadThread);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [voiceNote, setVoiceNote] = useState('מיקרופון בעברית ושיחה רציפה');
  const [files, setFiles] = useState<File[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<{
    action: FleetAction;
    query: string;
    description: string;
  } | null>(null);

  const recognitionRef = useRef<any>(null);
  const continuousModeRef = useRef(continuousMode);
  const isSpeakingRef = useRef(isSpeaking);
  const busyRef = useRef(busy);
  const submitRef = useRef<(text: string, attached: File[]) => Promise<void>>(async () => undefined);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;

  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    sessionStorage.setItem(THREAD_KEY, JSON.stringify(messages.slice(-30)));
    scrollerRef.current?.scrollTo?.({ top: scrollerRef.current.scrollHeight });
  }, [messages]);

  // Visual viewport keyboard inset
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const sync = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(covered);
    };
    sync();
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    return () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }, []);

  // Load browser voices
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const load = () => {
      const v = speechSynthesis.getVoices();
      setVoices(v);
      const pick = pickHebrewVoice(v, true);
      if (pick.voice) {
        setVoiceNote(pick.female ? `קול נשי: ${pick.voice.name}` : `קול עברי: ${pick.voice.name}`);
      }
    };
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: any;
      webkitSpeechRecognition?: any;
    };
    if (!window.isSecureContext) {
      setMicOk(false);
      setVoiceNote('מיקרופון בדפדפן עובד רק בחיבור מאובטח (HTTPS).');
      return;
    }
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    setMicOk(!!Recognition);
    if (!Recognition) {
      setVoiceNote('הדפדפן אינו תומך בזיהוי דיבור מובנה. ניתן להקליד בעברית בצורה חופשית.');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = CONTINUOUS_MIC_CONFIG.lang;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    recognition.onspeechstart = () => {
      // Barge-in: interrupt Dalia immediately if user starts talking!
      if (isSpeakingRef.current) {
        stopSpeaking();
        setIsSpeaking(false);
      }
    };

    recognition.onresult = (event: any) => {
      // Barge-in: interrupt immediately
      if (isSpeakingRef.current) {
        stopSpeaking();
        setIsSpeaking(false);
      }

      let interim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          finalTranscript += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }

      if (interim) {
        setInterimTranscript(interim.trim());
      }

      if (finalTranscript) {
        const trimmed = finalTranscript.trim();
        setInterimTranscript('');
        if (trimmed) {
          // Check for user voice stop command
          if (/^(עצור|עצרי|שקט|תפסיק|תפסיקי|די|ביי|להתראות)$/i.test(trimmed)) {
            stopSpeaking();
            setIsSpeaking(false);
            setContinuousMode(false);
            try {
              recognition.stop();
            } catch {
              // ignore
            }
            setListening(false);
            reply('שיחה קולית הושהתה. לחצו שוב על המיקרופון להמשך.');
            return;
          }

          void submitRef.current(trimmed, []);
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setListening(false);
        setContinuousMode(false);
        setVoiceNote('הגישה למיקרופון נחסמה בהגדרות הדפדפן. יש לאשר שימוש במיקרופון.');
      } else if (event.error !== 'no-speech') {
        setListening(false);
      }
    };

    recognition.onend = () => {
      // Auto-restart if continuous mode is still enabled and not busy
      if (continuousModeRef.current && !busyRef.current && !isSpeakingRef.current) {
        try {
          recognition.start();
          setListening(true);
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  const startListening = (continuous = false) => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    stopSpeaking();
    setIsSpeaking(false);
    setContinuousMode(continuous);
    continuousModeRef.current = continuous;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // might already be running
      setListening(true);
    }
  };

  const stopListening = () => {
    const recognition = recognitionRef.current;
    setContinuousMode(false);
    continuousModeRef.current = false;
    stopSpeaking();
    setIsSpeaking(false);
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      // ignore
    }
    setListening(false);
    setInterimTranscript('');
  };

  const resumeContinuousListeningAfterSpeech = () => {
    if (!continuousModeRef.current) return;
    setTimeout(() => {
      if (continuousModeRef.current && !busyRef.current && !isSpeakingRef.current) {
        const recognition = recognitionRef.current;
        if (!recognition) return;
        try {
          recognition.start();
          setListening(true);
        } catch {
          // ignore if already active
        }
      }
    }, 400);
  };

  const handleInterrupt = () => {
    stopSpeaking();
    setIsSpeaking(false);
    if (continuousMode) {
      startListening(true);
    }
  };

  const reply = (content: string, links?: ActionLink[], actionId?: string) => {
    const newMessage: ChatMessage = {
      role: 'assistant',
      content,
      links,
      actionId,
      timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, newMessage]);

    if (speakOn) {
      speakHebrew(content, voices, {
        allowFallback: true,
        onStart: () => setIsSpeaking(true),
        onEnd: () => {
          setIsSpeaking(false);
          resumeContinuousListeningAfterSpeech();
        },
        onError: () => {
          setIsSpeaking(false);
          resumeContinuousListeningAfterSpeech();
        },
      });
    } else {
      resumeContinuousListeningAfterSpeech();
    }
  };

  const submit = async (text: string, attached: File[]) => {
    const trimmed = text.trim();
    if (!trimmed && attached.length === 0) return;

    // Barge-in check
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    }

    const attachmentNote = attached.length
      ? `\nמצורף לשיחה בלבד: ${attached.map((file) => `${file.name} (${Math.ceil(file.size / 1024)}KB)`).join(', ')}`
      : '';
    const userText = `${trimmed}${attachmentNote}`.trim();

    const newTurn: ChatMessage = {
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, newTurn]);
    setInput('');
    setFiles([]);
    setBusy(true);

    try {
      // 1. Check conversation history context using planFleetTurn
      const historyTurns: FleetChatTurn[] = messages.slice(-10).map((m) => ({
        role: m.role,
        text: m.content,
        actionId: m.actionId,
      }));

      const plan = planFleetTurn(trimmed, historyTurns);

      if (plan.kind === 'blocked-write') {
        const action = getFleetAction(plan.actionId);
        reply(
          `⚠️ הפעולה «${action?.labelHe || 'שינוי נתונים'}» דורשת אישור מפורש. בשלב זה פעולות כתיבה נשמרות במסכים המקוריים בלבד כדי למנוע טעויות.`,
          action ? [{ label: `מעבר למסך המקורי`, path: action.source.split(' · ')[0].replace('src/pages', '').replace('.tsx', '').toLowerCase() || '/dashboard' }] : [],
          plan.actionId,
        );
        return;
      }

      if (plan.kind === 'outside-fleet') {
        reply('שיחה זו מיועדת לניהול צי הרכב, נהגים, מעקב, טיפולים ודוחות. ניהול תיקי תביעה או מוסך מתבצעים במודולים הייעודיים.');
        return;
      }

      // 2. Direct intent matching
      const intent = matchIntent(trimmed);
      if (intent.category) setCategory(intent.category);

      // Check if user asked to open a specific vehicle
      const isVehicleCardRequest = /^(?:תפתח|פתח|כרטיס|הצג)\s*(?:לי\s*)?(?:את\s*)?(?:הכרטיס\s*)?(?:של\s*)?(?:רכב)?/i.test(trimmed);

      const targetActionId = plan.kind === 'read' ? plan.actionId : intent.actionId;
      const targetQuery = plan.kind === 'read' ? plan.query : intent.query;

      if (targetActionId) {
        const action = getFleetAction(targetActionId);
        if (action?.mode === 'write' && action.needsConfirm) {
          setPendingConfirm({
            action,
            query: targetQuery,
            description: `האם לאשר ביצוע «${action.labelHe}» בחברה «${company || ''}»?`,
          });
          reply(`הפעולה «${action.labelHe}» עשויה לשנות מידע. נדרש אישורך כדי לבצע.`);
          return;
        }

        const result = await executeFleetAction(targetActionId, targetQuery, {
          role: user?.role,
          company: effectiveCompany,
        });

        // If direct vehicle opened and single card found
        if (isVehicleCardRequest && result.links && result.links.length === 1 && result.links[0].path.includes('vehicle')) {
          reply(`נמצא כרטיס הרכב. לחצו על הכפתור למעבר מהיר:`, result.links, targetActionId);
          return;
        }

        reply(result.text, result.links, targetActionId);
        return;
      }

      if (intent.category && intent.category !== 'chat') {
        const names = actionsForCategory(intent.category)
          .filter((action) => action.enabled)
          .map((action) => action.labelHe);
        reply(`נפתח תחום «${FLEET_CATEGORIES.find((item) => item.id === intent.category)?.label}». פעולות אפשריות: ${names.join(', ') || 'אין'}.`);
        return;
      }

      // 3. Fallback to Gemini AI for reasoning, calculations and open questions
      const aiResponse = await askGeneral(trimmed, messages, effectiveCompany || undefined);
      reply(aiResponse);
    } finally {
      setBusy(false);
    }
  };
  submitRef.current = submit;

  const runButton = async (id: string) => {
    const action = FLEET_ACTIONS.find((item) => item.id === id);
    if (!action) return;
    setMessages((prev) => [
      ...prev,
      {
        role: 'user',
        content: action.labelHe,
        timestamp: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setBusy(true);
    try {
      const result = await executeFleetAction(id, '', { role: user?.role, company: effectiveCompany });
      reply(result.text, result.links, id);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingConfirm) return;
    const { action, query } = pendingConfirm;
    setPendingConfirm(null);
    setBusy(true);
    try {
      const result = await executeFleetAction(action.id, query, { role: user?.role, company: effectiveCompany });
      reply(result.text, result.links, action.id);
    } finally {
      setBusy(false);
    }
  };

  if (!enabled) {
    const staging = projectId === STAGING_PROJECT_ID;
    return (
      <section className="max-w-xl mx-auto p-6 text-center space-y-4" dir="rtl" data-testid="fleet-dalia-ai-off">
        <h1 className="text-2xl font-black">דליה AI לצי כבויה</h1>
        <p className="text-muted-foreground">
          {staging
            ? 'מתג הכיבוי המקומי פעיל. מסכי הרכבים, הנהגים, המעקב והדוחות לא השתנו.'
            : 'המסך נעצר כי החיבור אינו לפרויקט הבדיקות. לא מתבצעת קריאה ולא מוצגים נתונים.'}
        </p>
        {staging && (
          <button
            type="button"
            className="min-h-12 px-4 rounded-xl bg-primary text-primary-foreground font-bold"
            onClick={() => {
              localStorage.removeItem(KILL_SWITCH_KEY);
              window.location.reload();
            }}
          >
            הפעלה מחדש בסביבת הבדיקות
          </button>
        )}
      </section>
    );
  }

  const actions = actionsForCategory(category);
  const activeCount = FLEET_ACTIONS.filter((action) => action.enabled).length;
  const inactiveCount = FLEET_ACTIONS.length - activeCount;

  return (
    <div
      className="max-w-5xl mx-auto space-y-3 pb-64 md:pb-0"
      dir="rtl"
      data-testid="fleet-dalia-ai"
      style={{ paddingBottom: keyboardInset ? keyboardInset + 220 : undefined }}
    >
      {/* Header */}
      <header className="rounded-2xl bg-gradient-to-l from-[hsl(218,58%,27%)] to-[hsl(218,58%,35%)] text-white p-4 sm:p-5 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black flex items-center gap-2">
              <Sparkles size={22} className="text-amber-300 animate-pulse" /> דליה AI · עוזר קולי לניהול צי
            </h1>
            <p className="text-sm mt-1 opacity-90">שיחה טבעית ורציפה בעברית · נתוני אמת מכל מודולי המערכת</p>
          </div>
          <button
            type="button"
            data-testid="fleet-dalia-back-dashboard"
            className="min-h-12 shrink-0 rounded-xl bg-white/15 hover:bg-white/25 transition-colors px-4 text-sm font-bold flex items-center gap-1.5"
            onClick={() => navigate('/dashboard')}
          >
            חזרה לדשבורד
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-white/20 text-xs opacity-90">
          <div className="flex items-center gap-2">
            <span>חברה:</span>
            {user?.role === 'super_admin' && companyOptions.length > 0 ? (
              <select
                value={effectiveCompany || ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setSelectedCompany(val);
                  try {
                    localStorage.setItem('selectedCompany', val || '');
                  } catch {
                    // ignore
                  }
                }}
                className="bg-white/20 text-white font-bold rounded-lg px-2.5 py-1 text-xs border border-white/30 focus:outline-none focus:bg-white focus:text-black transition-colors"
              >
                <option value="" className="text-black">בחר חברה...</option>
                {companyOptions.map((c) => (
                  <option key={c.name} value={c.name} className="text-black">{c.name}</option>
                ))}
              </select>
            ) : (
              <strong>{effectiveCompany || 'לא נבחרה — יש לבחור חברה'}</strong>
            )}
          </div>
          <span>מנוע AI: <strong>Google Gemini (AI Studio)</strong></span>
          <span>{voiceNote}</span>
        </div>
      </header>

      {/* Voice Controls Bar */}
      <section className="rounded-xl border bg-card p-3 shadow-sm flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="שיחה רציפה"
            disabled={!micOk}
            onClick={() => {
              if (continuousMode || listening) {
                stopListening();
              } else {
                startListening(true);
              }
            }}
            className={`min-h-11 px-4 rounded-xl font-bold flex items-center gap-2 transition-all ${
              continuousMode
                ? 'bg-red-600 text-white shadow-lg animate-pulse'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {continuousMode ? <Radio size={18} className="animate-spin" /> : <Mic size={18} />}
            {continuousMode ? 'שיחה רציפה פעילה (לחצו להפסקה)' : 'הפעלת שיחה רציפה חופשית'}
          </button>

          {isSpeaking && (
            <button
              type="button"
              onClick={handleInterrupt}
              className="min-h-11 px-3 rounded-xl bg-amber-500 text-white font-bold flex items-center gap-1.5 animate-bounce shadow-md"
              title="עצור את דליה באמצע התשובה ושאל שאלה חדשה"
            >
              <Square size={16} /> עצור דיבור (Barge-in)
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setSpeakOn((v) => !v)}
            className={`min-h-9 px-3 rounded-lg border font-semibold flex items-center gap-1.5 ${
              speakOn ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-muted-foreground'
            }`}
          >
            {speakOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
            {speakOn ? 'מענה קולי פעיל' : 'מענה קולי מושתק'}
          </button>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(THREAD_KEY);
                setMessages([]);
              }}
              className="min-h-9 px-2.5 rounded-lg border text-muted-foreground hover:text-foreground flex items-center gap-1"
              title="איפוס השיחה"
            >
              <RotateCcw size={14} /> ניקוי היסטוריה
            </button>
          )}
        </div>
      </section>

      {/* Live Interim Transcript Banner */}
      {(listening || interimTranscript || isSpeaking) && (
        <div
          className={`rounded-xl border p-3 text-sm flex items-center justify-between gap-2 transition-all ${
            isSpeaking
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
              : listening
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-200'
                : 'bg-muted'
          }`}
        >
          <div className="flex items-center gap-2">
            {isSpeaking ? (
              <span className="flex h-3 w-3 rounded-full bg-amber-500 animate-ping" />
            ) : (
              <span className="flex h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
            )}
            <span className="font-bold">
              {isSpeaking
                ? 'דליה מדברת כעת (אפשר להפריע בכל רגע בדיבור או לחיצה על עצור)'
                : interimTranscript
                  ? `דליה שומעת: «${interimTranscript}»`
                  : 'דליה מקשיבה לך... (דברו חופשי בעברית, ללא צורך בלחיצה)'}
            </span>
          </div>

          {listening && (
            <button
              type="button"
              onClick={stopListening}
              className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive font-bold"
            >
              הפסק הקשבה
            </button>
          )}
        </div>
      )}

      {/* Confirmation Modal / Card for Write Operations */}
      {pendingConfirm && (
        <div className="rounded-2xl border-2 border-amber-500 bg-amber-500/10 p-4 space-y-3 shadow-md">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
            <AlertTriangle size={20} />
            <span>אישור פעולה מבוקרת במערכת</span>
          </div>
          <p className="text-sm">{pendingConfirm.description}</p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="min-h-10 px-4 rounded-xl bg-muted border text-sm font-bold"
              onClick={() => {
                setPendingConfirm(null);
                reply('הפעולה בוטלה לפי בקשתך.');
              }}
            >
              <X size={16} className="inline ml-1" /> ביטול
            </button>
            <button
              type="button"
              className="min-h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow"
              onClick={() => void handleConfirmAction()}
            >
              <Check size={16} className="inline ml-1" /> אשר ביצוע
            </button>
          </div>
        </div>
      )}

      {/* Categories Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {FLEET_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`fleet-dalia-cat-${item.id}`}
            onClick={() => setCategory(item.id)}
            className={`min-h-12 rounded-xl px-2 text-sm font-bold border transition-colors ${
              category === item.id
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card border-border hover:bg-muted'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Category Fast Actions */}
      {category !== 'chat' && (
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-lg">פעולות מהירות — {FLEET_CATEGORIES.find((item) => item.id === category)?.label}</h2>
            <span className="text-xs text-muted-foreground">לחיצה מפעילה את השאילתה מול מסד הנתונים</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2" data-testid={`fleet-dalia-actions-${category}`}>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                data-testid={`fleet-dalia-action-${action.id}`}
                disabled={busy || !action.enabled}
                onClick={() => void runButton(action.id)}
                className="min-h-12 rounded-xl border px-3 py-2 text-right font-bold transition-colors disabled:opacity-50 hover:border-primary/50 flex flex-col justify-between"
              >
                <span>{action.labelHe}</span>
                <span className="text-xs font-normal text-muted-foreground mt-1">
                  {action.mode === 'navigate' ? 'ניווט למסך' : action.enabled ? 'שליפת נתוני אמת' : 'כתיבה (באישור)'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Chat Thread & Interactive Workspace */}
      <section
        className="rounded-2xl border-2 border-primary/30 bg-card flex flex-col min-h-[300px] max-h-[55vh] sm:max-h-[70vh] shadow-sm"
        aria-label="שיחה עם דליה AI"
      >
        <div ref={scrollerRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3" data-testid="fleet-dalia-thread">
          {messages.length === 0 && (
            <div className="text-center py-10 space-y-3">
              <Bot className="mx-auto text-primary" size={54} />
              <p className="text-lg font-black">שלום! אני דליה AI לניהול צי הרכב</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                אפשר לדבר איתי בעברית בצורה חופשית או להקליד.
                אני מחוברת לכל מודולי המערכת: רכבים, נהגים, מעקב, טיפולים, תקלות, תאונות, משימות, התראות ודוחות.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {[
                  'איזה רכבים צריכים טיפול החודש?',
                  'אילו רישיונות נהיגה עומדים לפוג?',
                  'תציג לי את הנהגים שיש להם מסמכים חסרים',
                  'תכין לי דוח על רכבים שלא טופלו',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void submit(q, [])}
                    className="text-xs px-3 py-1.5 rounded-full border bg-muted/60 hover:bg-muted font-medium transition-colors"
                  >
                    «{q}»
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div
                className={`max-w-[95%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed shadow-sm ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground font-medium rounded-tr-none'
                    : 'bg-muted/80 border text-foreground rounded-tl-none'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1 opacity-70 text-xs">
                  <span>{message.role === 'user' ? 'אתה' : 'דליה AI'}</span>
                  {message.timestamp && <span>{message.timestamp}</span>}
                </div>

                <div>{message.content}</div>

                {message.links && message.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-border/50">
                    {message.links.map((link) => (
                      <button
                        key={`${link.path}-${link.label}`}
                        type="button"
                        className="min-h-9 px-3 rounded-lg bg-background border hover:border-primary text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                        onClick={() => navigate(link.path)}
                      >
                        <ExternalLink size={13} /> {link.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex justify-end">
              <div className="rounded-2xl rounded-tl-none bg-muted border px-4 py-3 text-sm flex items-center gap-2 text-muted-foreground">
                <Sparkles size={16} className="text-primary animate-spin" />
                <span>דליה מאתרת נתונים מהמערכת ומגבשת תשובה...</span>
              </div>
            </div>
          )}
        </div>

        {files.length > 0 && (
          <p className="px-4 py-1 text-xs text-muted-foreground bg-muted/50 border-t">
            מצורף מקומית: {files.map((file) => file.name).join(', ')}
          </p>
        )}

        {/* Input Composer */}
        <form
          className="fixed left-2 right-16 bottom-[4.75rem] z-40 rounded-xl border bg-card p-2 flex flex-col gap-2 shadow-lg md:static md:inset-auto md:z-30 md:rounded-none md:shadow-none"
          data-testid="fleet-dalia-composer"
          style={keyboardInset > 0 ? { bottom: keyboardInset + 8 } : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void submit(input, files);
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit(input, files);
              }
            }}
            rows={2}
            enterKeyHint="send"
            placeholder="כתבו או דברו בעברית (למשל: איזה רכבים צריכים טיפול החודש?)"
            className="w-full min-h-12 rounded-xl border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            data-testid="fleet-dalia-input"
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'center' })}
          />

          <div className="flex gap-2">
            <label
              className="min-h-12 min-w-12 rounded-xl border flex items-center justify-center cursor-pointer hover:bg-muted transition-colors"
              title="צירוף מסמך או תמונה"
            >
              <Paperclip size={18} />
              <input
                className="hidden"
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files || []))}
              />
            </label>

            <button
              type="button"
              aria-label="מיקרופון"
              disabled={!micOk}
              title={continuousMode ? 'שיחה רציפה פעילה' : 'הקלטה ידנית'}
              className={`min-h-12 min-w-12 rounded-xl border flex items-center justify-center transition-colors ${
                listening || continuousMode
                  ? 'bg-destructive text-destructive-foreground animate-pulse'
                  : 'hover:bg-muted'
              }`}
              onClick={() => {
                if (listening || continuousMode) {
                  stopListening();
                } else {
                  startListening(true);
                }
              }}
            >
              {listening || continuousMode ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <button
              type="button"
              aria-label="הקראה"
              title={speakOn ? 'הקראה קולית פעילה' : 'הקראה קולית כבויה'}
              className={`min-h-12 min-w-12 rounded-xl border flex items-center justify-center transition-colors ${
                speakOn ? 'text-primary border-primary/40' : 'hover:bg-muted'
              }`}
              onClick={() => {
                if (isSpeaking) {
                  stopSpeaking();
                  setIsSpeaking(false);
                }
                setSpeakOn((v) => !v);
              }}
            >
              {speakOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>

            <button
              type="submit"
              aria-label="שליחה"
              disabled={busy}
              className="min-h-12 flex-1 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              <Send size={18} /> שליחה
            </button>
          </div>
        </form>
      </section>

      {/* Footer Info */}
      <footer className="text-xs text-muted-foreground space-y-1 pt-2">
        <p>
          מערכת פעולות מבוקרת: {activeCount} פעולות קריאה וניווט פעילות · {inactiveCount} פעולות כתיבה נדרשות אישור.
        </p>
        <p>
          ביצוע פעולות נעשה מול פרויקט STAGING בלבד. אין גישה למידע של חברות אחרות.
        </p>
        <button
          type="button"
          className="underline hover:text-foreground"
          onClick={() => {
            localStorage.setItem(KILL_SWITCH_KEY, 'off');
            window.location.reload();
          }}
        >
          כיבוי דליה AI לצי במכשיר הזה
        </button>
      </footer>
    </div>
  );
}
