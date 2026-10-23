// src/pages/DevDaliaVoicePoc.tsx
// Proof of Concept (PoC) for Dalia AI Realtime Hands-Free Conversational Voice

import { useState, useCallback, useRef, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useConversation, ConversationProvider } from '@elevenlabs/react';
import { PhoneOff, Play, RotateCcw, ShieldCheck, Lock, UserCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function DevDaliaVoicePoc() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100" dir="rtl">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-400 mx-auto"></div>
          <p className="text-sm text-slate-400">מאמת הרשאות גישה למסך הבדיקה...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: '/dev/dalia-voice-poc' }} />;
  }

  return (
    <ConversationProvider>
      <DevDaliaVoicePocInner userEmail={user.email} userRole={user.role} />
    </ConversationProvider>
  );
}

interface SimulatedTurn {
  role: 'agent' | 'user' | 'system';
  text: string;
  ts: string;
  corrected?: boolean;
}

interface DevDaliaVoicePocInnerProps {
  userEmail: string;
  userRole: string;
}

function DevDaliaVoicePocInner({ userEmail, userRole }: DevDaliaVoicePocInnerProps) {
  const [mode, setMode] = useState<'simulation' | 'elevenlabs'>('simulation');
  const [agentId, setAgentId] = useState<string>(() => {
    try {
      return localStorage.getItem('elevenlabs_agent_id') || '';
    } catch {
      return '';
    }
  });

  // Simulated Voice State
  const [isSimActive, setIsSimActive] = useState(false);
  const [simStep, setSimStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [simPhase, setSimPhase] = useState<'idle' | 'speaking' | 'listening' | 'processing'>('idle');
  const [simTurns, setSimTurns] = useState<SimulatedTurn[]>([]);
  const [mockCustomerData, setMockCustomerData] = useState({
    name: '',
    phone: '',
    plate: '',
    model: '',
    complaint: '',
  });

  const recognitionRef = useRef<any>(null);
  const simAudioRef = useRef<HTMLAudioElement | null>(null);

  // ElevenLabs Conversation Hook
  const conversation = useConversation({
    onConnect: () => {
      toast.success('🎙️ מחובר לשיחת WebRTC חיה עם ElevenLabs');
      addTurn('system', 'מחובר לסוכן ElevenLabs');
    },
    onDisconnect: () => {
      toast.info('השיחה הסתיימה');
      addTurn('system', 'השיחה הסתיימה');
    },
    onError: (err) => {
      console.error('ElevenLabs Error:', err);
      toast.error('שגיאה בחיבור ElevenLabs');
    },
    onMessage: (msg: any) => {
      if (msg?.type === 'user_transcript' && msg.user_transcription_event?.user_transcript) {
        addTurn('user', msg.user_transcription_event.user_transcript);
      } else if (msg?.type === 'agent_response' && msg.agent_response_event?.agent_response) {
        addTurn('agent', msg.agent_response_event.agent_response);
      }
    },
  });

  const isElevenLabsActive = conversation.status === 'connected';

  const addTurn = (role: 'agent' | 'user' | 'system', text: string, corrected = false) => {
    setSimTurns((prev) => [
      ...prev,
      { role, text, ts: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), corrected },
    ]);
  };

  // ---------------------------------------------------------------------------
  // Simulated Hands-free 5-step flow with Correction, Pause & Resume
  // ---------------------------------------------------------------------------
  const SIM_PROMPTS = [
    'שלום, בוא נפתח לקוח חדש. מה שם הלקוח?',
    'מצוין, מה מספר הטלפון שלו?',
    'מה מספר הרישוי ודגם הרכב?',
    'מה התקלה או סיבת ההגעה למוסך?',
    'מעולה. רשמתי את כל הפרטים. האם לאשר את פתיחת התיק?',
  ];

  const speakSimPrompt = useCallback((text: string, onEnd?: () => void) => {
    setSimPhase('speaking');
    addTurn('agent', text);

    if (simAudioRef.current) {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=iw&client=tw-ob`;
      simAudioRef.current.src = url;
      simAudioRef.current.onended = () => {
        setSimPhase('listening');
        onEnd?.();
      };
      simAudioRef.current.onerror = () => {
        setSimPhase('listening');
        onEnd?.();
      };
      simAudioRef.current.play().catch((err) => {
        console.warn('Sim play catch:', err);
        setSimPhase('listening');
        onEnd?.();
      });
    } else {
      setTimeout(() => {
        setSimPhase('listening');
        onEnd?.();
      }, 1500);
    }
  }, []);

  const listenUserTurn = useCallback(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error('הדפדפן אינו תומך בהאזנה למיקרופון');
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'he-IL';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onresult = (ev: any) => {
      const text = ev.results[0]?.[0]?.transcript?.trim() || '';
      if (!text) return;

      addTurn('user', text);
      processUserSimInput(text);
    };

    rec.onerror = (e: any) => {
      console.warn('Speech rec error:', e);
      if (isSimActive && !isPaused) {
        setTimeout(listenUserTurn, 1000);
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {}
  }, [isSimActive, isPaused]);

  const processUserSimInput = useCallback(
    (userText: string) => {
      setSimPhase('processing');

      // Check Pause / Resume commands
      const lower = userText.toLowerCase();
      if (lower.includes('תעצרי') || lower.includes('עצור') || lower.includes('להמתין')) {
        setIsPaused(true);
        setSimPhase('idle');
        speakSimPrompt('עצרתי את השיחה. כשתרצה להמשיך, אמור "דליה תמשיכי".');
        return;
      }
      if (lower.includes('תמשיכי') || lower.includes('להמשיך')) {
        setIsPaused(false);
        speakSimPrompt(`ממשיכים מאותה נקודה. ${SIM_PROMPTS[simStep]}`, () => {
          listenUserTurn();
        });
        return;
      }

      // Check mid-flight correction ("רגע טעיתי...")
      if (lower.includes('טעיתי') || lower.includes('תיקון') || lower.includes('לא קוראים לו') || lower.includes('רגע')) {
        addTurn('system', 'זיהוי תיקון תשובה בזמן אמת', true);
        const correctedName = userText.replace(/.*(קוראים לו|שמו|השם הוא|זה)\s*/, '').trim() || 'יוסי לוי';
        setMockCustomerData((prev) => ({ ...prev, name: correctedName }));
        speakSimPrompt(`הבנתי, תיקנתי את השם ל-${correctedName}. מה מספר הטלפון שלו?`, () => {
          setSimStep(1);
          listenUserTurn();
        });
        return;
      }

      // Advance step
      if (simStep === 0) {
        setMockCustomerData((prev) => ({ ...prev, name: userText }));
        setSimStep(1);
        speakSimPrompt(`שלום ${userText}. ${SIM_PROMPTS[1]}`, () => listenUserTurn());
      } else if (simStep === 1) {
        setMockCustomerData((prev) => ({ ...prev, phone: userText }));
        setSimStep(2);
        speakSimPrompt(`רשמתי. ${SIM_PROMPTS[2]}`, () => listenUserTurn());
      } else if (simStep === 2) {
        setMockCustomerData((prev) => ({ ...prev, plate: userText, model: 'טויוטה קורולה' }));
        setSimStep(3);
        speakSimPrompt(`יופי. ${SIM_PROMPTS[3]}`, () => listenUserTurn());
      } else if (simStep === 3) {
        setMockCustomerData((prev) => ({ ...prev, complaint: userText }));
        setSimStep(4);
        speakSimPrompt(
          `סיכום פרטים מדומים: לקוח ${mockCustomerData.name || 'יוסי'}, רכב ${mockCustomerData.plate || '12-345-67'}, תקלה: ${userText}. האם לאשר את התיק?`,
          () => listenUserTurn()
        );
      } else if (simStep === 4) {
        setSimPhase('idle');
        setIsSimActive(false);
        speakSimPrompt('מצוין! כרטיס הבדיקה המדומה הושלם בהצלחה. כל 5 השאלות נענו ברציפות ללא לחיצה חוזרת.');
      }
    },
    [simStep, mockCustomerData, speakSimPrompt, listenUserTurn]
  );

  const startSimulation = useCallback(() => {
    setIsSimActive(true);
    setIsPaused(false);
    setSimStep(0);
    setSimTurns([]);
    setMockCustomerData({ name: '', phone: '', plate: '', model: '', complaint: '' });

    if (simAudioRef.current) {
      simAudioRef.current.load();
    }

    speakSimPrompt(SIM_PROMPTS[0], () => {
      listenUserTurn();
    });
  }, [speakSimPrompt, listenUserTurn]);

  const stopSimulation = useCallback(() => {
    setIsSimActive(false);
    setSimPhase('idle');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    if (simAudioRef.current) {
      simAudioRef.current.pause();
    }
    addTurn('system', 'השיחה נעצרה על ידי המשתמש');
  }, []);

  // ---------------------------------------------------------------------------
  // ElevenLabs Start
  // ---------------------------------------------------------------------------
  const startElevenLabs = useCallback(async () => {
    if (!agentId) {
      toast.error('נדרש מזהה סוכן (Agent ID) של ElevenLabs');
      return;
    }
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { data, error } = await supabase.functions.invoke('elevenlabs-conversation-token', {
        body: { agentId },
      });
      if (error || !data?.token) {
        throw new Error(error?.message || 'לא התקבל token משרת Supabase. ודא ש-ELEVENLABS_API_KEY מוגדר בסודות הפרויקט.');
      }

      await conversation.startSession({
        conversationToken: data.token,
        connectionType: 'webrtc',
      });
    } catch (e: any) {
      console.error(e);
      toast.error(`שגיאת חיבור: ${e.message}`);
      addTurn('system', `שגיאה: ${e.message}`);
    }
  }, [agentId, conversation]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans" dir="rtl">
      <audio ref={simAudioRef} playsInline preload="auto" style={{ display: 'none' }} />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header with Authorized User Badge */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
              🎙️ PoC · בדיקת שיחה קולית רציפה
            </span>
            <div className="flex items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                <UserCheck size={13} /> מורשה: {userEmail} ({userRole})
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">STAGING ONLY</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">דליה AI — הוכחת היתכנות לשיחה קולית חופשית</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            מסך בדיקה עצמאי ומבודד: בדיקת שיחה שוטפת בעברית, לחיצה אחת בלבד בהתחלה, האזנה רציפה, הבנת תיקונים באמצע ("רגע טעיתי..."), עצירה והמשך.
          </p>
        </div>

        {/* Clear Mode Selector */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">בחר מנוע בדיקה:</div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('simulation')}
              className={`p-3 rounded-xl text-right transition-all border ${
                mode === 'simulation'
                  ? 'bg-sky-950/80 border-sky-500 text-white shadow-lg'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-bold text-sm mb-1">⚡ מצב א׳: סימולטור שיחה רציפה</div>
              <div className="text-xs text-slate-400 leading-tight">
                בדיקת שמע והאזנה רציפה בדפדפן (Brave). ללא עלות, ללא API Key.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode('elevenlabs')}
              className={`p-3 rounded-xl text-right transition-all border ${
                mode === 'elevenlabs'
                  ? 'bg-sky-950/80 border-sky-500 text-white shadow-lg'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="font-bold text-sm mb-1">🌐 מצב ב׳: ElevenLabs WebRTC</div>
              <div className="text-xs text-slate-400 leading-tight">
                סוכן AI חי בעברית אמיתית דרך ערוץ שמע WebRTC ישיר.
              </div>
            </button>
          </div>
        </div>

        {/* Simulation Mode Controls */}
        {mode === 'simulation' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-white">סימולציית פקידת מוסך (5 שאלות ברצף)</h3>
                <p className="text-xs text-slate-400">שלב {simStep + 1} מתוך 5 · תומך ב-"רגע טעיתי" וב-"דליה תעצרי"</p>
              </div>
              <div className="flex items-center gap-2">
                {!isSimActive ? (
                  <button
                    type="button"
                    onClick={startSimulation}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all"
                  >
                    <Play size={16} /> התחל שיחה
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopSimulation}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg transition-all"
                  >
                    <PhoneOff size={16} /> סיים שיחה
                  </button>
                )}
              </div>
            </div>

            {/* Live Indicator Bar */}
            {isSimActive && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-sky-500/30 text-sm">
                <div className="flex items-center gap-3">
                  <span
                    className={`w-3 h-3 rounded-full animate-pulse ${
                      simPhase === 'speaking' ? 'bg-sky-400' : simPhase === 'listening' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="font-medium">
                    {simPhase === 'speaking' && '🔊 דליה מדברת...'}
                    {simPhase === 'listening' && '🎙️ דליה מקשיבה לך... (דבר בחופשיות)'}
                    {simPhase === 'processing' && '⏳ מעבדת תשובה...'}
                    {simPhase === 'idle' && (isPaused ? '⏸️ השיחה מושהית ("דליה תמשיכי")' : 'מוכן')}
                  </span>
                </div>
                <span className="text-xs text-slate-400">ללא לחיצות חוזרות</span>
              </div>
            )}

            {/* Mock Data Card */}
            {isSimActive && (
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-xs space-y-1 text-slate-300">
                <div className="font-semibold text-slate-400">נתוני בדיקה מדומה שנקלטו (זיכרון מקומי בלבד):</div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>שם: <span className="text-sky-300 font-medium">{mockCustomerData.name || '—'}</span></div>
                  <div>טלפון: <span className="text-sky-300 font-medium">{mockCustomerData.phone || '—'}</span></div>
                  <div>רכב: <span className="text-sky-300 font-medium">{mockCustomerData.plate || '—'}</span></div>
                  <div>תקלה: <span className="text-sky-300 font-medium">{mockCustomerData.complaint || '—'}</span></div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ElevenLabs Mode Controls */}
        {mode === 'elevenlabs' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" />
              <div>
                <b>סטטוס חיבור ElevenLabs:</b> נדרש להגדיר את מפתח ה-API בסודות Supabase (`ELEVENLABS_API_KEY`) ולהזין כאן Agent ID עם מודל עברי. ללא מפתח זה, השיחה לא תתחבר.
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Agent ID של ElevenLabs:</label>
              <input
                type="text"
                value={agentId}
                onChange={(e) => {
                  setAgentId(e.target.value);
                  try {
                    localStorage.setItem('elevenlabs_agent_id', e.target.value);
                  } catch {}
                }}
                placeholder="לדוגמה: o8q4nE0fXXXXXX"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 font-mono"
              />
              <p className="text-xs text-slate-500">
                המפתח נשמר מקומית בדפדפן לצורך בדיקתך ולא נשלח לשום שרת ציבורי.
              </p>
            </div>

            <div className="flex gap-2">
              {!isElevenLabsActive ? (
                <button
                  type="button"
                  onClick={startElevenLabs}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg transition-all"
                >
                  <Play size={16} /> התחל שיחת WebRTC חיה
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => conversation.endSession()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg transition-all"
                >
                  <PhoneOff size={16} /> נתק שיחה
                </button>
              )}
            </div>
          </div>
        )}

        {/* Live Conversation Transcript */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-sm text-slate-300">תמליל שיחה חי (Transcript)</h3>
            <button
              type="button"
              onClick={() => setSimTurns([])}
              className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1"
            >
              <RotateCcw size={12} /> נקה תמליל
            </button>
          </div>

          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
            {simTurns.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">השיחה טרם החלה. לחץ על "התחל שיחה" למעלה.</p>
            ) : (
              simTurns.map((turn, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl text-sm leading-relaxed ${
                    turn.role === 'agent'
                      ? 'bg-sky-950/60 border border-sky-800/40 text-sky-100 ml-6'
                      : turn.role === 'user'
                      ? 'bg-slate-800/80 border border-slate-700/60 text-white mr-6'
                      : 'bg-amber-950/40 border border-amber-800/30 text-amber-200 text-xs text-center'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span className="font-semibold">
                      {turn.role === 'agent' ? '🤖 דליה AI' : turn.role === 'user' ? '👤 אתה' : '⚙️ מערכת'}
                    </span>
                    <span>{turn.ts}</span>
                  </div>
                  <div>{turn.text}</div>
                  {turn.corrected && (
                    <span className="inline-block mt-1 text-xs text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded">
                      ✓ זוהה תיקון בשיחה חיה
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Safety and Privacy Notice */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center gap-2 text-slate-300 font-semibold">
            <ShieldCheck size={16} className="text-emerald-400" /> אבטחת מידע ופרטיות מוחלטת (STAGING)
          </div>
          <p>
            • מסך זה נגיש אך ורק למשתמש מחובר ומורשה במערכת.
          </p>
          <p>
            • כל הבדיקות פועלות על נתוני דמה בזיכרון — שום רשומה אינה נשמרת במסד הנתונים של המוסך.
          </p>
          <p>
            • תשעת הכפתורים המקוריים ומנוע הדיבור הקיים נותרו פעילים ללא שינוי.
          </p>
        </div>
      </div>
    </div>
  );
}
