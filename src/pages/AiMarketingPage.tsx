import { useEffect, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/**
 * CO.CO דליה — ניהול שיווק (Super Admin only)
 * Marketing AI lives inside this iframe only — separate from fleet Help AI.
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
  const src = `${base}ai-marketing-platform?embedded=1`;

  return (
    <div
      className="fixed z-10 bg-background left-0 right-0 md:right-72 top-16 md:top-0 bottom-16 md:bottom-0 -mx-4 md:-mx-8 -mt-4 md:-mt-8"
      style={{ marginBottom: 0 }}
    >
      <iframe
        ref={iframeRef}
        title="ניהול שיווק — CO.CO דליה"
        src={src}
        className="w-full h-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
