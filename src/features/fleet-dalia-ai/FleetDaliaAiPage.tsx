import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Mic, MicOff, Paperclip, Send, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import {
  FLEET_ACTIONS,
  FLEET_CATEGORIES,
  actionsForCategory,
  type FleetCategoryId,
} from './actionCatalog';
import { executeFleetAction, type ActionLink } from './liveReads';
import { matchIntent } from './intent';
import { GARAGE_MIC, speakHebrew } from './speech';
import { KILL_SWITCH_KEY, STAGING_PROJECT_ID, isFleetDaliaAiEnabled } from './stagingGate';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  links?: ActionLink[];
};

const THREAD_KEY = 'fleet-dalia-ai-thread';

function loadThread(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(THREAD_KEY);
    return raw ? JSON.parse(raw) as ChatMessage[] : [];
  } catch {
    return [];
  }
}

async function askGeneral(text: string, history: ChatMessage[]): Promise<string> {
  const system = [
    'אתה דליה AI לניהול צי רכב בסביבת בדיקות.',
    'ענה בעברית, קצר וברור.',
    'אין בהודעה נתוני לקוחות. אל תמציא כמויות, לוחיות או שמות.',
    'לבקשת נתון, הפנה לכפתורי רכבים, נהגים, מעקב, דוחות או משימות.',
    'פעולות כתיבה אינן פעילות.',
  ].join('\n');
  try {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assistant: true,
        module: 'fleet-dalia-ai',
        system,
        prompt: text,
        history: history.filter((item) => item.role === 'user').slice(-6).map((item) => ({
          role: item.role,
          content: item.content.slice(0, 400),
        })),
        max_tokens: 600,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok || !data.text) {
      return 'המודל החי לא מחובר עכשיו. אפשר לבקש חיפוש, מעקב, דוח או משימות, או להשתמש בכפתורים. לא המצאתי נתונים.';
    }
    return String(data.text);
  } catch {
    return 'המודל החי לא מחובר עכשיו. אפשר לבקש חיפוש, מעקב, דוח או משימות, או להשתמש בכפתורים.';
  }
}

export default function FleetDaliaAiPage() {
  const { user } = useAuth();
  const company = useCompanyFilter();
  const navigate = useNavigate();
  const enabled = isFleetDaliaAiEnabled();
  const [category, setCategory] = useState<FleetCategoryId>('vehicles');
  const [messages, setMessages] = useState<ChatMessage[]>(loadThread);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [speakOn, setSpeakOn] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [voiceNote, setVoiceNote] = useState('מיקרופון בעברית, כמו בדליה של המוסך. הקראה רק אם יש קול נשי עברי.');
  const [files, setFiles] = useState<File[]>([]);
  const recognitionRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const submitRef = useRef<(text: string, attached: File[]) => Promise<void>>(async () => undefined);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;

  useEffect(() => {
    sessionStorage.setItem(THREAD_KEY, JSON.stringify(messages.slice(-30)));
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        start: () => void;
        stop: () => void;
        onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
        onerror: ((event: { error?: string }) => void) | null;
        onend: (() => void) | null;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        start: () => void;
        stop: () => void;
        onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
        onerror: ((event: { error?: string }) => void) | null;
        onend: (() => void) | null;
      };
    };
    if (!window.isSecureContext) {
      setMicOk(false);
      setVoiceNote('המיקרופון בדפדפן עובד רק בכתובת מאובטחת. בטלפון פתחו את כתובת ה-https של הבדיקה המקומית.');
      return;
    }
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    setMicOk(!!Recognition);
    if (!Recognition) {
      setVoiceNote('הדפדפן הזה לא מציע מיקרופון עברי. אפשר לכתוב בעברית. בכרום של הטלפון המיקרופון זמין.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = GARAGE_MIC.lang;
    recognition.interimResults = GARAGE_MIC.interimResults;
    recognition.maxAlternatives = GARAGE_MIC.maxAlternatives;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.trim();
      setListening(false);
      if (transcript) void submitRef.current(transcript, []);
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceNote('המיקרופון נחסם. בטלפון: לחצו על המנעול ליד הכתובת, בחרו הרשאות, ואפשרו מיקרופון.');
      }
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

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

  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const reply = (content: string, links?: ActionLink[]) => {
    setMessages((prev) => [...prev, { role: 'assistant', content, links }]);
    if (speakOn) {
      const pick = speakHebrew(content, voices);
      setVoiceNote(pick.spoken
        ? `קול נשי בעברית: ${pick.voice?.name}`
        : 'אין קול נשי עברי בדפדפן הזה. לא מושמע קול אחר. המיקרופון נשאר במנגנון העברית של דליה.');
    }
  };

  const submit = async (text: string, attached: File[]) => {
    const trimmed = text.trim();
    if (!trimmed && attached.length === 0) return;
    const attachmentNote = attached.length
      ? `\nמצורף לשיחה בלבד, לא נשמר ברשומות: ${attached.map((file) => `${file.name} (${Math.ceil(file.size / 1024)}KB)`).join(', ')}`
      : '';
    const userText = `${trimmed}${attachmentNote}`.trim();
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setInput('');
    setFiles([]);
    setBusy(true);
    try {
      const intent = matchIntent(trimmed);
      if (intent.category) setCategory(intent.category);
      if (intent.category === 'chat' && !intent.actionId) {
        reply(await askGeneral(trimmed, messages));
        return;
      }
      if (intent.actionId) {
        const result = await executeFleetAction(intent.actionId, intent.query, {
          role: user?.role,
          company,
        });
        reply(result.text, result.links);
        return;
      }
      if (intent.category) {
        const names = actionsForCategory(intent.category).filter((action) => action.enabled).map((action) => action.labelHe);
        reply(`נפתח הדשבורד «${FLEET_CATEGORIES.find((item) => item.id === intent.category)?.label}». פעולות קריאה: ${names.join(', ') || 'אין'}.`);
        return;
      }
      reply(await askGeneral(trimmed, messages));
    } finally {
      setBusy(false);
    }
  };
  submitRef.current = submit;

  const runButton = async (id: string) => {
    const action = FLEET_ACTIONS.find((item) => item.id === id);
    if (!action) return;
    setMessages((prev) => [...prev, { role: 'user', content: action.labelHe }]);
    setBusy(true);
    try {
      const result = await executeFleetAction(id, '', { role: user?.role, company });
      reply(result.text, result.links);
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
    <div className="max-w-5xl mx-auto space-y-3 pb-64 md:pb-0" dir="rtl" data-testid="fleet-dalia-ai" style={{ paddingBottom: keyboardInset ? keyboardInset + 220 : undefined }}>
      <header className="rounded-2xl bg-gradient-to-l from-[hsl(218,58%,27%)] to-[hsl(218,58%,35%)] text-white p-4 sm:p-5">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Sparkles size={22} /> דליה AI · ניהול צי
        </h1>
        <p className="text-sm mt-1 opacity-90">סביבת בדיקות בלבד · קריאה לפי החברה שנבחרה · בלי שינוי במסכים הקיימים</p>
        <p className="text-xs mt-2 opacity-80">
          חברה: {company || 'לא נבחרה — קריאות נעצרות'} · {voiceNote}
        </p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {FLEET_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            data-testid={`fleet-dalia-cat-${item.id}`}
            onClick={() => setCategory(item.id)}
            className={`min-h-12 rounded-xl px-2 text-sm font-bold border ${category === item.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {category !== 'chat' && (
        <section className="rounded-2xl border bg-card p-4 space-y-3">
          <h2 className="font-black text-lg">{FLEET_CATEGORIES.find((item) => item.id === category)?.label}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid={`fleet-dalia-actions-${category}`}>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                data-testid={`fleet-dalia-action-${action.id}`}
                disabled={busy || !action.enabled}
                onClick={() => void runButton(action.id)}
                className="min-h-12 rounded-xl border px-3 py-2 text-right font-bold disabled:opacity-60"
              >
                {action.labelHe}
                <span className="block text-xs font-normal text-muted-foreground">{action.enabled ? 'קריאה' : 'לא פעיל בשלב זה'}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border-2 border-primary/30 bg-card flex flex-col min-h-[240px] max-h-[50vh] sm:max-h-[68vh]" aria-label="שיחה עם דליה AI">
        <div ref={scrollerRef} className="flex-1 overflow-y-auto p-3 space-y-3" data-testid="fleet-dalia-thread">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <Bot className="mx-auto text-primary" size={48} />
              <p className="font-bold">אפשר להקליד או לדבר בעברית</p>
              <p className="text-sm text-muted-foreground">לדוגמה: חפש רכב, תוקף רישיון, טסט קרוב, משימות פתוחות</p>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[95%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted border'}`}>
                {message.content}
                {message.links && message.links.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {message.links.map((link) => (
                      <button key={`${link.path}-${link.label}`} type="button" className="min-h-9 px-2 rounded-lg bg-background border text-xs font-bold" onClick={() => navigate(link.path)}>
                        {link.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="text-sm text-muted-foreground">קוראת...</p>}
        </div>
        {files.length > 0 && (
          <p className="px-4 text-xs text-muted-foreground">מצורף מקומית: {files.map((file) => file.name).join(', ')}</p>
        )}
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
            placeholder="כתבו או דברו בעברית"
            className="w-full min-h-12 rounded-xl border bg-background px-3 py-2 text-base"
            data-testid="fleet-dalia-input"
            onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'center' })}
          />
          <div className="flex gap-2">
            <label className="min-h-12 min-w-12 rounded-xl border flex items-center justify-center cursor-pointer" title="צירוף מקומי">
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
              className={`min-h-12 min-w-12 rounded-xl border ${listening ? 'bg-destructive text-destructive-foreground' : ''}`}
              onClick={() => {
                const recognition = recognitionRef.current;
                if (!recognition) return;
                if (listening) {
                  recognition.stop();
                  setListening(false);
                  return;
                }
                setListening(true);
                recognition.start();
              }}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button type="button" aria-label="הקראה" className="min-h-12 min-w-12 rounded-xl border" onClick={() => setSpeakOn((value) => !value)}>
              {speakOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button type="submit" aria-label="שליחה" disabled={busy} className="min-h-12 flex-1 rounded-xl bg-primary text-primary-foreground font-bold">
              <Send size={18} className="inline" /> שליחה
            </button>
          </div>
        </form>
      </section>

      <footer className="text-xs text-muted-foreground space-y-1">
        <p>פעולות קריאה פעילות: {activeCount}. פעולות כתיבה מוצגות וכבויות: {inactiveCount}.</p>
        <p>ייצוא הדוח, עריכת רכב ונהג, והעלאה לתיק נשארים במסכים הקיימים.</p>
        <button
          type="button"
          className="underline"
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
