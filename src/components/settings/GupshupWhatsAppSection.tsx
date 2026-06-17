import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { checkGupshupConnection, sendWhatsAppTestMessage } from '@/lib/whatsappClient';

const TEST_MESSAGE = 'שלום, זו הודעת בדיקה ממערכת דליה';

export default function GupshupWhatsAppSection() {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [gupshupVerified, setGupshupVerified] = useState(false);
  const [providerInfo, setProviderInfo] = useState<{
    app_name?: string;
    source?: string;
    secret_name?: string;
    message?: string;
  }>({});
  const [testPhone, setTestPhone] = useState('');
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);

  const refreshStatus = useCallback(async () => {
    setChecking(true);
    try {
      const result = await checkGupshupConnection();
      setConfigured(Boolean(result.configured));
      setGupshupVerified(Boolean(result.gupshup_verified));
      setProviderInfo({
        app_name: result.app_name,
        source: result.source,
        secret_name: result.secret_name,
        message: result.message,
      });
      if (result.gupshup_verified && result.gupshup_status) {
        toast.success(`חיבור Gupshup תקין (HTTP ${result.gupshup_status})`);
      } else if (result.configured && result.error) {
        toast.warning(`Secret מוגדר — Gupshup: ${result.error}`);
      } else if (result.success) {
        toast.success(result.message || 'מפתח מוגדר');
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בבדיקת חיבור');
      setConfigured(false);
    } finally {
      setChecking(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      toast.error('הזן מספר טלפון לבדיקה');
      return;
    }
    setSending(true);
    try {
      const result = await sendWhatsAppTestMessage(testPhone.trim(), TEST_MESSAGE);
      if (!result.success) {
        toast.error(result.error || 'שגיאה בשליחה');
        return;
      }
      toast.success(`הודעת בדיקה נשלחה ל-${result.destination}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שגיאה בשליחה');
    } finally {
      setSending(false);
    }
  };

  const inputClass =
    'w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none';

  return (
    <div className="card-elevated mb-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#25D366]/15 flex items-center justify-center">
          <MessageCircle size={24} className="text-[#25D366]" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold">WhatsApp — Gupshup</h2>
          <p className="text-sm text-muted-foreground">שליחת הודעות דרך WhatsApp Business API (Staging)</p>
        </div>
        <span
          className={`status-badge ${gupshupVerified ? 'status-active' : configured ? 'status-pending' : 'status-pending'}`}
        >
          {loading ? 'בודק...' : gupshupVerified ? 'חיבור תקין' : configured ? 'מפתח דורש אימות' : 'מפתח חסר'}
        </span>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
        <p><strong>ספק:</strong> Gupshup</p>
        <p><strong>App:</strong> {providerInfo.app_name || 'DaliaVehicle'}</p>
        <p dir="ltr" className="text-right"><strong>Source:</strong> {providerInfo.source || '972546500305'}</p>
        <p><strong>Secret:</strong> {providerInfo.secret_name || 'GUPSHUP_API_KEY'}</p>
        {providerInfo.message && (
          <p className="text-muted-foreground">{providerInfo.message}</p>
        )}
      </div>

      <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 font-bold">
          <ShieldCheck size={18} className="text-primary" />
          <span>איך מגדירים / מחליפים API Key</span>
        </div>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Supabase Dashboard → פרויקט זה (<code dir="ltr">{import.meta.env.VITE_SUPABASE_PROJECT_ID}</code>)</li>
          <li>Edge Functions → Secrets</li>
          <li>הוסף או עדכן: <code dir="ltr">GUPSHUP_API_KEY</code></li>
          <li>לחץ «בדוק חיבור» — אין צורך בשינוי קוד</li>
        </ol>
        <p className="text-xs text-muted-foreground">
          המפתח לא נשמר ב-Git, לא ב-Frontend, ולא בבסיס הנתונים — רק ב-Supabase Secrets.
        </p>
      </div>

      <button
        type="button"
        onClick={refreshStatus}
        disabled={checking}
        className="w-full py-3 rounded-xl border-2 border-border text-base font-bold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />
        {checking ? 'בודק חיבור...' : 'בדוק חיבור'}
      </button>

      <div className="border-t border-border pt-4 space-y-3">
        <p className="font-bold">שליחת הודעת בדיקה</p>
        <p className="text-sm text-muted-foreground">
          הודעה: «{TEST_MESSAGE}»
        </p>
        <div>
          <label className="block text-base font-medium mb-1.5">מספר נמען (פורמט בינלאומי)</label>
          <input
            type="tel"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className={inputClass}
            dir="ltr"
            placeholder="972501234567"
            disabled={!gupshupVerified}
          />
        </div>
        <button
          type="button"
          onClick={handleSendTest}
          disabled={!gupshupVerified || sending || !testPhone.trim()}
          className="w-full py-4 rounded-xl bg-[#25D366] text-white text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Send size={20} />
          {sending ? 'שולח...' : 'שלח הודעת בדיקה'}
        </button>
        {!gupshupVerified && (
          <p className="text-sm text-destructive">
            {configured
              ? 'החיבור ל-Gupshup לא אומת — עדכן GUPSHUP_API_KEY ב-Supabase Secrets ולחץ «בדוק חיבור».'
              : 'הגדר את GUPSHUP_API_KEY ב-Supabase Secrets לפני שליחת הודעה.'}
          </p>
        )}
      </div>
    </div>
  );
}
