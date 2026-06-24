import { useEffect, useRef, useCallback } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight } from 'lucide-react';

/**
 * דליה CRM — Super Admin (iframe shell, same auth bridge as marketing)
 */
export default function DaliaCrmPage() {
  const { user } = useAuth();
  const { selectedCompany, companyOptions } = useCompanyScope();
  const navigate = useNavigate();
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
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'dalia-coco-exit') {
        const path = typeof e.data.path === 'string' ? e.data.path : '/admin-home';
        navigate(path);
      }
      if (e.data?.type === 'dalia-coco-navigate' && typeof e.data.path === 'string') {
        navigate(e.data.path);
      }
    };
    window.addEventListener('message', onMessage);
    iframe.addEventListener('load', pushToIframe);
    pushToIframe();
    return () => {
      window.removeEventListener('message', onMessage);
      iframe.removeEventListener('load', pushToIframe);
    };
  }, [pushToIframe, navigate]);

  if (user?.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  const base = import.meta.env.BASE_URL || '/';
  const src = `${base}dalia-crm-platform.html?fullscreen=1&v=crm-1${customerId ? `&customer=${encodeURIComponent(customerId)}` : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-border bg-card/95 text-xs shrink-0">
        <span className="font-semibold text-foreground truncate">דליה CRM — ניהול לקוחות</span>
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
        title="דליה CRM"
        src={src}
        className="flex-1 w-full border-0 min-h-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
