import { useEffect, useRef, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight } from 'lucide-react';

/**
 * CO.CO דליה — ניהול שיווק (Super Admin only)
 * Full-screen workspace — no Dalia sidebar/chrome around the marketing app.
 */
export default function AiMarketingPage() {
  const { user } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const pushAuthToIframe = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    iframe.contentWindow.postMessage(
      {
        type: 'dalia-coco-auth',
        accessToken: session.access_token,
        supabaseUrl,
        marketingChatUrl: `${supabaseUrl}/functions/v1/marketing-ai-chat`,
      },
      '*',
    );
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.addEventListener('load', pushAuthToIframe);
    pushAuthToIframe();
    const onFocus = () => pushAuthToIframe();
    window.addEventListener('focus', onFocus);
    return () => {
      iframe.removeEventListener('load', pushAuthToIframe);
      window.removeEventListener('focus', onFocus);
    };
  }, [pushAuthToIframe]);

  if (user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const base = import.meta.env.BASE_URL || '/';
  const src = `${base}ai-marketing-platform?fullscreen=1`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-border bg-card/95 text-xs shrink-0">
        <span className="font-semibold text-foreground truncate">CO.CO — מנהל שיווק AI</span>
        <Link
          to="/admin-home"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground whitespace-nowrap"
        >
          חזרה לדליה
          <ArrowRight size={14} className="rotate-180" />
        </Link>
      </div>
      <iframe
        ref={iframeRef}
        title="ניהול שיווק — CO.CO דליה"
        src={src}
        className="flex-1 w-full border-0 min-h-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
