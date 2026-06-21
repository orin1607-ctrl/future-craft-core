import { useState, useRef, useEffect, useCallback } from 'react';

import { createPortal } from 'react-dom';

import { useLocation, useNavigate } from 'react-router-dom';

import { Bot, Mic, MicOff, Send, X, Loader2, Sparkles } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';

import { supabase } from '@/integrations/supabase/client';

import { Button } from '@/components/ui/button';

import { Textarea } from '@/components/ui/textarea';

import {

  buildAssistantSystem,

  detectNavIntent,

  parseNavActions,

  stripNavMarkers,

  getRouteLabel,

} from '@/lib/daliaPageContext';



type Message = {

  role: 'user' | 'assistant';

  content: string;

  actions?: { label: string; path: string }[];

};



const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-ai-chat`;

const STORAGE_KEY = 'dalia-ai-fab-history';



const QUICK_CHIPS = [

  'מה הכי דחוף היום?',

  'מה מצב החברה?',

  'מה אני רואה במסך הזה?',

  'מה צריך לעשות עכשיו?',

  'פתח לי את המסך המתאים',

  'הראה לי איפה יש בעיות',

];



function loadHistory(): Message[] {

  try {

    const raw = localStorage.getItem(STORAGE_KEY);

    if (raw) return JSON.parse(raw);

  } catch { /* ignore */ }

  return [];

}



async function probeOpenAI(): Promise<boolean> {

  try {

    const r = await fetch('/api/ai/health');

    const d = await r.json();

    return !!(r.ok && d.ok);

  } catch {

    return false;

  }

}



export default function DaliaAiFab() {

  const { user } = useAuth();

  const location = useLocation();

  const navigate = useNavigate();

  const role = user?.role || 'driver';



  const [open, setOpen] = useState(false);

  const [messages, setMessages] = useState<Message[]>(() => loadHistory());

  const [input, setInput] = useState('');

  const [loading, setLoading] = useState(false);

  const [listening, setListening] = useState(false);

  const [micOk, setMicOk] = useState(false);

  const [openAiOk, setOpenAiOk] = useState<boolean | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollEndRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any

  const recognitionRef = useRef<any>(null);



  useEffect(() => {

    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-24)));

  }, [messages]);



  useEffect(() => {

    if (open) {

      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });

      setTimeout(() => inputRef.current?.focus(), 150);

    }

  }, [messages, open, loading]);



  useEffect(() => {

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    setMicOk(!!SR);

  }, []);



  useEffect(() => {

    if (open && openAiOk === null) {

      probeOpenAI().then(setOpenAiOk);

    }

  }, [open, openAiOk]);



  const systemPrompt = useCallback(

    () =>

      buildAssistantSystem({

        pathname: location.pathname,

        role,

        userName: user?.full_name || user?.email || undefined,

        companyName: user?.company_name,

      }),

    [location.pathname, role, user]

  );



  const callOpenAI = async (text: string, history: Message[]) => {

    const res = await fetch('/api/ai/chat', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        assistant: true,

        module: 'dalia-assistant',

        system: systemPrompt(),

        prompt: text,

        history: history.slice(-10).map((m) => ({ role: m.role, content: m.content })),

        max_tokens: 1200,

      }),

    });

    const data = await res.json();

    if (!res.ok || !data.ok || !data.text) {

      throw new Error(data.message || 'OpenAI לא זמין');

    }

    return data.text as string;

  };



  const callSupabase = async (allMessages: { role: string; content: string }[]) => {

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.access_token) throw new Error('יש להתחבר למערכת');



    const resp = await fetch(CHAT_URL, {

      method: 'POST',

      headers: {

        'Content-Type': 'application/json',

        Authorization: `Bearer ${session.access_token}`,

      },

      body: JSON.stringify({

        messages: allMessages,

        company_name: user?.company_name || null,

        page_context: systemPrompt(),

      }),

    });



    if (!resp.ok) {

      const err = await resp.json().catch(() => ({ error: 'שגיאה' }));

      throw new Error(err.error || `שגיאה ${resp.status}`);

    }



    const ct = resp.headers.get('content-type') || '';

    if (ct.includes('application/json')) {

      const data = await resp.json();

      throw new Error(data.error || 'שגיאת AI');

    }



    if (!resp.body) throw new Error('אין תשובה');



    const reader = resp.body.getReader();

    const decoder = new TextDecoder();

    let assistantContent = '';

    let textBuffer = '';



    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);



    while (true) {

      const { done, value } = await reader.read();

      if (done) break;

      textBuffer += decoder.decode(value, { stream: true });

      let nl: number;

      while ((nl = textBuffer.indexOf('\n')) !== -1) {

        let line = textBuffer.slice(0, nl);

        textBuffer = textBuffer.slice(nl + 1);

        if (line.endsWith('\r')) line = line.slice(0, -1);

        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();

        if (jsonStr === '[DONE]') break;

        try {

          const parsed = JSON.parse(jsonStr);

          const content = parsed.choices?.[0]?.delta?.content as string | undefined;

          if (content) {

            assistantContent += content;

            setMessages((prev) => {

              const copy = [...prev];

              const idx = copy.length - 1;

              if (copy[idx]?.role === 'assistant') {

                copy[idx] = { ...copy[idx], content: assistantContent };

              }

              return copy;

            });

          }

        } catch {

          /* partial SSE line */

        }

      }

    }

    if (!assistantContent.trim()) throw new Error('תשובה ריקה מהשרת');

    return assistantContent;

  };



  const finalizeAssistant = (raw: string) => {

    const actions = parseNavActions(raw);

    const clean = stripNavMarkers(raw) || raw;

    setMessages((prev) => {

      const copy = [...prev];

      const idx = copy.length - 1;

      if (copy[idx]?.role === 'assistant') {

        copy[idx] = { role: 'assistant', content: clean, actions };

      } else {

        copy.push({ role: 'assistant', content: clean, actions });

      }

      return copy;

    });

  };



  const sendMessage = useCallback(

    async (text: string) => {

      if (!text.trim() || loading) return;



      const intentPath = detectNavIntent(text);

      const userMsg: Message = { role: 'user', content: text.trim() };

      const history = [...messages, userMsg];

      setMessages(history);

      setInput('');

      setLoading(true);



      if (intentPath && /^(פתח|עבור|navigate|go to)/i.test(text)) {

        setMessages((prev) => [

          ...prev,

          {

            role: 'assistant',

            content: `בטח! פותח את ${getRouteLabel(intentPath)}…`,

            actions: [{ path: intentPath, label: `↗ ${getRouteLabel(intentPath)}` }],

          },

        ]);

        setLoading(false);

        return;

      }



      try {

        let raw = '';

        const hasOpenAi = openAiOk ?? (await probeOpenAI());

        if (hasOpenAi) {

          setOpenAiOk(true);

          raw = await callOpenAI(text.trim(), messages);

          setMessages((prev) => [...prev, { role: 'assistant', content: raw }]);

        } else {

          setOpenAiOk(false);

          const apiMessages = history.map((m) => ({ role: m.role, content: m.content }));

          raw = await callSupabase(apiMessages);

        }

        finalizeAssistant(raw);

      } catch (e) {

        const msg = e instanceof Error ? e.message : 'שגיאה';

        try {

          const raw = await callOpenAI(text.trim(), messages);

          setMessages((prev) => {

            const copy = [...prev];

            if (copy[copy.length - 1]?.role === 'assistant' && !copy[copy.length - 1].content) {

              copy.pop();

            }

            copy.push({ role: 'assistant', content: raw });

            return copy;

          });

          finalizeAssistant(raw);

        } catch {

          setMessages((prev) => {

            const copy = [...prev].filter((m, i) => !(i === prev.length - 1 && m.role === 'assistant' && !m.content));

            return [

              ...copy,

              {

                role: 'assistant',

                content: `❌ ${msg}\n\nנסה שוב או בדוק חיבור OpenAI (.env.openai) / Supabase.`,

              },

            ];

          });

        }

      } finally {

        setLoading(false);

      }

    },

    [loading, messages, openAiOk, systemPrompt, user?.company_name]

  );



  const toggleMic = () => {

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SR) return;

    if (listening && recognitionRef.current) {

      recognitionRef.current.stop();

      setListening(false);

      return;

    }

    const rec = new SR();

    rec.lang = 'he-IL';

    rec.onresult = (ev: SpeechRecognitionEvent) => {

      setInput(ev.results[0][0].transcript);

      setListening(false);

    };

    rec.onerror = () => setListening(false);

    rec.onend = () => setListening(false);

    recognitionRef.current = rec;

    try {

      rec.start();

      setListening(true);

    } catch { /* ignore */ }

  };



  const firstName = (user?.full_name || 'יוני').split(' ')[0];



  const ui = (

    <>

      {open && (

        <div

          className="fixed inset-0 bg-black/50 z-[9998]"

          onClick={() => setOpen(false)}

          aria-hidden

        />

      )}



      {open && (

        <div

          className="fixed z-[9999] bg-card border-2 border-primary/40 shadow-2xl flex flex-col rounded-2xl overflow-hidden

            inset-x-3 bottom-[5.25rem] h-[min(75vh,620px)]

            md:inset-x-auto md:left-6 md:bottom-28 md:w-[440px] md:h-[min(72vh,640px)]"

          role="dialog"

          aria-label="שיחה עם עוזר דליה AI"

          onClick={(e) => e.stopPropagation()}

        >

          <div className="bg-gradient-to-l from-[hsl(218,58%,27%)] to-[hsl(218,58%,35%)] text-white px-4 py-4 flex items-center justify-between shrink-0">

            <div>

              <h2 className="font-black text-lg flex items-center gap-2">

                <Sparkles className="w-5 h-5" />

                עוזר דליה AI

              </h2>

              <p className="text-sm opacity-95 mt-1">

                {firstName}, במה תרצה שאעזור היום?

              </p>

              <p className="text-[11px] opacity-75 mt-0.5">

                {openAiOk ? '🟢 OpenAI מחובר' : openAiOk === false ? '🟠 Supabase AI' : '…'}

                {' · '}

                {getRouteLabel(location.pathname)}

              </p>

            </div>

            <button

              type="button"

              onClick={() => setOpen(false)}

              className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center hover:bg-white/25"

              aria-label="סגור"

            >

              <X className="w-5 h-5" />

            </button>

          </div>



          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">

            {messages.length === 0 && (

              <div className="text-center space-y-3 py-2">

                <Bot className="w-16 h-16 mx-auto text-primary/80" />

                <p className="text-sm text-muted-foreground px-1 leading-relaxed">

                  אני העוזר הראשי של <strong>כל מערכת דליה</strong> — צי, נהגים, תקלות, דוחות, שיווק ועוד.

                  <br />

                  שאל בשפה חופשית — אני אסביר, אנתח ואוביל אותך.

                </p>

                <div className="flex flex-wrap gap-2 justify-center pt-1">

                  {QUICK_CHIPS.map((q) => (

                    <button

                      key={q}

                      type="button"

                      onClick={() => sendMessage(q)}

                      className="text-xs px-3 py-2 rounded-full border-2 border-primary/20 bg-primary/5 hover:bg-primary/15 font-medium"

                    >

                      {q}

                    </button>

                  ))}

                </div>

              </div>

            )}

            {messages.map((msg, i) => (

              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>

                <div

                  className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${

                    msg.role === 'user'

                      ? 'bg-primary text-primary-foreground rounded-br-md'

                      : 'bg-muted border rounded-bl-md'

                  }`}

                >

                  {msg.content || (loading && i === messages.length - 1 ? '…' : '')}

                  {msg.actions && msg.actions.length > 0 && (

                    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-border/40">

                      {msg.actions.map((act) => (

                        <Button

                          key={act.path}

                          size="sm"

                          variant="secondary"

                          className="h-8 text-xs font-bold"

                          onClick={() => {

                            setOpen(false);

                            navigate(act.path);

                          }}

                        >

                          {act.label}

                        </Button>

                      ))}

                    </div>

                  )}

                </div>

              </div>

            ))}

            {loading && messages[messages.length - 1]?.role === 'user' && (

              <div className="flex justify-end">

                <div className="bg-muted rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">

                  <Loader2 className="w-4 h-4 animate-spin" />

                  חושב…

                </div>

              </div>

            )}

            <div ref={scrollEndRef} />

          </div>



          <div className="border-t p-3 flex gap-2 items-end shrink-0 bg-card">

            <Button

              type="button"

              size="icon"

              variant={listening ? 'destructive' : 'outline'}

              className="shrink-0 h-12 w-12"

              onClick={toggleMic}

              disabled={!micOk}

              title={micOk ? 'דבר במיקרופון' : 'מיקרופון לא נתמך'}

            >

              {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}

            </Button>

            <Textarea

              ref={inputRef}

              value={input}

              onChange={(e) => setInput(e.target.value)}

              onKeyDown={(e) => {

                if (e.key === 'Enter' && !e.shiftKey) {

                  e.preventDefault();

                  sendMessage(input);

                }

              }}

              placeholder="שאל כל דבר… מה דחוף? מה לעשות? פתח מסך…"

              className="min-h-[48px] max-h-28 text-sm resize-none"

              dir="rtl"

              disabled={loading}

            />

            <Button

              type="button"

              size="icon"

              className="shrink-0 h-12 w-12"

              onClick={() => sendMessage(input)}

              disabled={loading || !input.trim()}

            >

              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}

            </Button>

          </div>

        </div>

      )}



      <button

        type="button"

        onClick={(e) => {

          e.stopPropagation();

          setOpen(true);

        }}

        className="dalia-ai-fab fixed z-[9999] flex items-center justify-center gap-3 font-black

          text-white select-none touch-manipulation shadow-2xl

          bottom-[4.75rem] left-2 right-2 h-[4.25rem] rounded-2xl text-lg

          md:bottom-10 md:left-auto md:right-8 md:min-w-[320px] md:h-[4.25rem] md:rounded-full md:text-xl"

        aria-label="דבר עם AI"

        aria-expanded={open}

      >

        <Bot className="w-7 h-7 shrink-0" strokeWidth={2.5} />

        <span>🤖 דבר עם AI</span>

      </button>

    </>

  );



  if (typeof document === 'undefined') return null;

  return createPortal(ui, document.body);

}

