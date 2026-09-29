import { useEffect, useRef, useCallback } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight } from 'lucide-react';

/**
 * דליה — ניהול שיווק 2 (STAGING)
 * המערכת החדשה, מותאמת באופן מלא למובייל ומחשב.
 */
export default function AiMarketingV2Page() {
  const { user } = useAuth();
  const { selectedCompany, companyOptions } = useCompanyScope();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get('customer');
  const tab = searchParams.get('tab');
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
          marketingGeminiChatUrl: `${supabaseUrl}/functions/v1/marketing-gemini-chat`,
          marketingClaudeChatUrl: `${supabaseUrl}/functions/v1/marketing-claude-chat`,
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
  }, [selectedCompany, companyOptions]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'dalia-coco-exit') {
        const path = typeof e.data.path === 'string' ? e.data.path : '/dashboard';
        navigate(path);
      }
    };
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', pushToIframe);
    pushToIframe();
    const onFocus = () => pushToIframe();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', pushToIframe);
      window.removeEventListener('focus', onFocus);
    };
  }, [pushToIframe, navigate]);

  if (user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const base = import.meta.env.BASE_URL || '/';
  const build = (import.meta.env.VITE_BUILD_COMMIT as string) || '';
  const qs = new URLSearchParams();
  if (build) qs.set('b', build.replace(/[^a-f0-9]/gi, '').slice(0, 12));
  if (customerId) qs.set('customer', customerId);
  if (tab) qs.set('tab', tab);
  const src = `${base}dalia-marketing-center-v2.html${qs.toString() ? `?${qs.toString()}` : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#04091a]">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-white/10 bg-[#071022] text-xs shrink-0 text-white">
        <div className="flex items-center gap-2">
          <span className="font-semibold truncate">דליה — ניהול שיווק 2</span>
          <span className="bg-blue-600/30 text-blue-300 text-[10px] px-1.5 py-0.5 rounded font-medium border border-blue-500/30">חדש · מובייל</span>
        </div>

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-white/70 hover:text-white whitespace-nowrap text-xs"
        >
          חזרה לדליה
          <ArrowRight size={14} className="rotate-180" />
        </Link>
      </div>

      <iframe
        ref={iframeRef}
        title="ניהול שיווק 2 — דליה"
        src={src}
        className="flex-1 w-full border-0 min-h-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
