import { useEffect, useRef, useCallback } from 'react';

import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

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

  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();

  const customerId = searchParams.get('customer');

  const tab = searchParams.get('tab');

  const mode = searchParams.get('mode') || 'center';

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

    if (customerId) {

      iframe.contentWindow.postMessage(

        { type: 'dalia-coco-open-customer', customerId },

        '*',

      );

    }

    if (tab === 'crm') {

      iframe.contentWindow.postMessage({ type: 'dalia-coco-open-crm' }, '*');

    }

  }, [selectedCompany, companyOptions, customerId, tab]);



  useEffect(() => {

    const iframe = iframeRef.current;

    if (!iframe) return;

    const onMessage = (e: MessageEvent) => {

      if (e.data?.type === 'dalia-coco-exit') {

        const path = typeof e.data.path === 'string' ? e.data.path : '/admin-home';

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
  const targetFile = mode === 'coco' ? 'ai-marketing-platform.html' : 'dalia-marketing-center.html';
  const src = `${base}${targetFile}${qs.toString() ? `?${qs.toString()}` : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#04091a]">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-white/10 bg-[#071022] text-xs shrink-0 text-white">
        <div className="flex items-center gap-2">
          <span className="font-semibold truncate">דליה — מרכז השיווק והפרסום</span>
          <div className="flex items-center rounded bg-white/10 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => {
                const n = new URLSearchParams(searchParams);
                n.delete('mode');
                setSearchParams(n);
              }}
              className={`px-2 py-0.5 rounded transition-colors ${mode !== 'coco' ? 'bg-blue-600 text-white font-medium' : 'text-white/60 hover:text-white'}`}
            >
              מרכז השיווק (חדש)
            </button>
            <button
              type="button"
              onClick={() => {
                const n = new URLSearchParams(searchParams);
                n.set('mode', 'coco');
                setSearchParams(n);
              }}
              className={`px-2 py-0.5 rounded transition-colors ${mode === 'coco' ? 'bg-blue-600 text-white font-medium' : 'text-white/60 hover:text-white'}`}
            >
              ממשק CO.CO
            </button>
          </div>
        </div>

        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-white/70 hover:text-white whitespace-nowrap"
        >
          חזרה לדליה
          <ArrowRight size={14} className="rotate-180" />
        </Link>
      </div>

      <iframe
        ref={iframeRef}
        title="מרכז השיווק והפרסום — דליה"
        src={src}
        className="flex-1 w-full border-0 min-h-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>

  );

}

