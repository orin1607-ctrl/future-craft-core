import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Message = { role: "user" | "assistant"; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/help-ai-chat`;
const STORAGE_KEY = "help-ai-chat-history";

const DRIVER_QUESTIONS = [
  "איך מדווחים על תקלה?",
  "איך לבצע החלפת רכב?",
  "מה לעשות בתאונה?",
  "איך מעדכנים קילומטראז'?",
];

const FLEET_MANAGER_QUESTIONS = [
  "כמה תקלות פתוחות יש?",
  "אילו רכבים יש להם טסט שפג בחודש הקרוב?",
  "סיכום הוצאות החודש האחרון",
  "כמה נהגים פעילים?",
];

const SUPER_ADMIN_QUESTIONS = [
  "תן סיכום כללי של המערכת",
  "כמה רכבים, נהגים ותקלות יש?",
  "אילו התראות פעילות יש?",
  "סיכום הוצאות לכל החברות",
];

function loadHistory(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveHistory(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {}
}

export function AIChatAssistant() {
  const { user } = useAuth();
  const role = user?.role || "driver";
  const QUICK_QUESTIONS =
    role === "super_admin"
      ? SUPER_ADMIN_QUESTIONS
      : role === "fleet_manager"
      ? FLEET_MANAGER_QUESTIONS
      : DRIVER_QUESTIONS;

  const [messages, setMessages] = useState<Message[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveHistory(messages);
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const clearHistory = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMsg: Message = { role: "user", content: text.trim() };
      const allMessages = [...messages, userMsg];
      setMessages(allMessages);
      setInput("");
      setIsLoading(true);

      let assistantContent = "";

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error("יש להתחבר למערכת כדי להשתמש בעוזר AI");
        }

        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: allMessages,
            company_name: user?.company_name || null,
          }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "שגיאה" }));
          throw new Error(err.error || "שגיאה בתקשורת");
        }
        if (!resp.body) throw new Error("אין תשובה מהשרת");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") break;
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content as string | undefined;
              if (content) {
                assistantContent += content;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return prev.map((m, i) =>
                      i === prev.length - 1 ? { ...m, content: assistantContent } : m
                    );
                  }
                  return [...prev, { role: "assistant", content: assistantContent }];
                });
              }
            } catch {
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }
      } catch (e) {
        console.error("AI Chat error:", e);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `❌ ${e instanceof Error ? e.message : "שגיאה לא צפויה"}` },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, user?.company_name]
  );

  return (
    <div className="flex flex-col h-[500px]" dir="rtl">
      {messages.length > 0 && (
        <div className="flex justify-between items-center px-3 py-2 border-b">
          <span className="text-xs text-muted-foreground">{messages.length} הודעות</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearHistory}
            className="text-xs gap-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-3 h-3" />
            נקה היסטוריה
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="text-center space-y-4 py-6">
            <Bot className="w-12 h-12 mx-auto text-primary/60" />
            <div>
              <h4 className="font-semibold text-foreground">עוזר AI חכם</h4>
              <p className="text-sm text-muted-foreground mt-1">
                שאל אותי כל שאלה על המערכת או על הנתונים שלך
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 mt-4">
              {QUICK_QUESTIONS.map((q, i) => (
                <Button
                  key={i}
                  variant="outline"
                  size="sm"
                  className="text-xs justify-start h-auto py-2 px-3 whitespace-normal text-right"
                  onClick={() => sendMessage(q)}
                >
                  {q}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}
                >
                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div
                  className={`rounded-lg px-3 py-2 max-w-[85%] text-sm whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-muted">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="rounded-lg px-3 py-2 bg-muted">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-3 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder="שאל שאלה על המערכת..."
          disabled={isLoading}
          className="text-sm"
          dir="rtl"
        />
        <Button
          size="icon"
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
