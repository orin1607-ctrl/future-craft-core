import { useEffect, useRef, useCallback } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight } from 'lucide-react';

/**
 * CO.CO דליה — ניהול שיווק (Super Admin only)
 * Full-screen workspace — no Dalia sidebar/chrome around the marketing app.
 */
export default function AiMarketingPage() {
  const { user } = useAuth();
  const { selectedCompany, companyOptions } = useCompanyScope();
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get('customer');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const pushToIframe = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    const { data: { session } } = await supabase.auth.getSession();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    if (session?.access_token) {
      iframe.contentWindow.postMessage(
        {
          type: 'dalia-coco-auth',
          accessToken: session.access_token,
          supabaseUrl,
          anonKey,
          marketingChatUrl: `${supabaseUrl}/functions/v1/marketing-ai-chat`,
        },
        '*',
      );
    }
    iframe.contentWindow.postMessage(
      {
        type: 'dalia-coco-scope',
        selectedCompany,
        companyOptions,
      },
      '*',
    );
    if (customerId) {
      iframe.contentWindow.postMessage(
        { type: 'dalia-coco-open-customer', customerId },
        '*',
      );
    }
  }, [selectedCompany, companyOptions, customerId]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.addEventListener('load', pushToIframe);
    pushToIframe();
    const onFocus = () => pushToIframe();
    window.addEventListener('focus', onFocus);
    return () => {
      iframe.removeEventListener('load', pushToIframe);
      window.removeEventListener('focus', onFocus);
    };
  }, [pushToIframe]);

  if (user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const base = import.meta.env.BASE_URL || '/';
  const src = `${base}ai-marketing-platform.html?fullscreen=1&v=v3-claude-1to1-2${customerId ? `&customer=${encodeURIComponent(customerId)}` : ''}`;

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
