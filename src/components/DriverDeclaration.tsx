import { useState, useEffect, useRef } from 'react';
import { FileText, Send, Check, Clock, AlertTriangle, ArrowRight, Pencil, Printer, Settings2, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { printDeclaration } from '@/utils/printDeclaration';
import {
  DEFAULT_DECLARATION_BODY,
  canManageDeclarationTemplates,
  renderDeclarationTemplate,
} from '@/utils/declarationTemplates';
import { getDefaultDeclarationTemplate } from '@/services/declarationTemplatesApi';
import DeclarationTemplateManager from '@/components/DeclarationTemplateManager';
import DeclarationPreviewModal from '@/components/DeclarationPreviewModal';
import { buildSignDeclarationUrl } from '@/utils/appUrls';
import { buildWaMeUrl, hasWhatsAppPhone } from '@/utils/israeliPhone';

interface Declaration {
  id: string;
  driver_id: string;
  driver_name: string;
  id_number: string | null;
  license_number: string | null;
  company_name: string | null;
  declaration_text?: string | null;
  status: string;
  signed_at: string | null;
  signature_url: string | null;
  expires_at: string | null;
  sent_via: string | null;
  sent_at: string | null;
  token: string | null;
  template_id?: string | null;
  created_at: string;
}

interface DriverDeclarationProps {
  driverId: string;
  driverName: string;
  idNumber?: string;
  licenseNumber?: string;
  companyName?: string;
  /** Driver mobile from the driver card — used for direct WhatsApp chat deep-link */
  driverPhone?: string;
  mode?: 'manager' | 'driver';
}

function resolveDeclarationDisplayText(d: Declaration): string {
  return renderDeclarationTemplate(d.declaration_text || DEFAULT_DECLARATION_BODY, {
    driver_name: d.driver_name,
    id_number: d.id_number,
    license_number: d.license_number,
    company_name: d.company_name,
    date: d.created_at ? new Date(d.created_at).toLocaleDateString('he-IL') : new Date().toLocaleDateString('he-IL'),
  });
}

export default function DriverDeclaration({ driverId, driverName, idNumber, licenseNumber, companyName, driverPhone, mode = 'manager' }: DriverDeclarationProps) {
  const { user } = useAuth();
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [signing, setSigning] = useState(false);
  const [activeDeclaration, setActiveDeclaration] = useState<Declaration | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [previewDeclaration, setPreviewDeclaration] = useState<Declaration | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const effectiveCompany = companyName || user?.company_name || '';
  const canManageTemplates = mode === 'manager' && canManageDeclarationTemplates(user?.role);

  const loadDeclarations = async () => {
    const { data } = await supabase
      .from('driver_declarations')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });
    if (data) setDeclarations(data as Declaration[]);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    loadDeclarations();
  }, [driverId]);

  const createDeclaration = async () => {
    // Stay on this driver's card — never navigate away after create.
    setCreating(true);
    try {
      let declarationText = DEFAULT_DECLARATION_BODY;
      let templateId: string | null = null;

      if (effectiveCompany) {
        try {
          const template = await getDefaultDeclarationTemplate(effectiveCompany, user?.id);
          declarationText = template.body;
          templateId = template.id;
        } catch (templateErr) {
          console.warn('Falling back to built-in declaration text', templateErr);
        }
      }

      const snapshot = renderDeclarationTemplate(declarationText, {
        driver_name: driverName,
        id_number: idNumber || '',
        license_number: licenseNumber || '',
        company_name: effectiveCompany,
        date: new Date().toLocaleDateString('he-IL'),
      });

      const { error } = await supabase.from('driver_declarations').insert({
        driver_id: driverId,
        driver_name: driverName,
        id_number: idNumber || null,
        license_number: licenseNumber || null,
        company_name: effectiveCompany,
        declaration_text: snapshot,
        template_id: templateId,
        status: 'pending',
        created_by: user?.id,
      } as any);

      if (error) {
        toast.error('שגיאה ביצירת התצהיר');
        console.error(error);
      } else {
        toast.success('תצהיר נוצר בהצלחה');
        await loadDeclarations();
        // Keep the declarations block in view on the same driver card
        requestAnimationFrame(() => {
          document.getElementById('driver-declaration-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
    } catch (e) {
      console.error(e);
      toast.error('שגיאה ביצירת התצהיר');
    } finally {
      setCreating(false);
    }
  };

  const sendDeclaration = async (declaration: Declaration, via: 'whatsapp' | 'email') => {
    if (!declaration.token) {
      toast.error('חסר קישור חתימה לתצהיר זה');
      return;
    }
    const signUrl = buildSignDeclarationUrl(declaration.token);

    if (via === 'whatsapp') {
      // Canonical field: drivers.phone (passed as driverPhone from the driver card)
      if (!hasWhatsAppPhone(driverPhone)) {
        toast.error('חסר מספר טלפון בכרטיס הנהג — לא ניתן לפתוח צ׳אט ישירות');
        return;
      }
      const message = `שלום ${driverName}, אנא חתום על תצהיר נהג בקישור הבא:\n${signUrl}`;
      const waUrl = buildWaMeUrl(driverPhone!, message);
      if (!waUrl) {
        toast.error('חסר מספר טלפון בכרטיס הנהג — לא ניתן לפתוח צ׳אט ישירות');
        return;
      }
      // Open the driver's chat directly (wa.me/<phone>?text=...) — not the contact picker
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } else {
      await navigator.clipboard.writeText(signUrl);
      toast.success('קישור הועתק ללוח – שלח אותו באימייל לנהג');
    }

    await supabase.from('driver_declarations').update({
      sent_via: via,
      sent_at: new Date().toISOString(),
    } as any).eq('id', declaration.id);
    await loadDeclarations();
  };

  // Canvas signature handling — DPR-aware so signatures render crisply on
  // mobile / Retina screens (otherwise strokes can look invisible).
  const initCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  useEffect(() => {
    if (signing) {
      const t = setTimeout(initCanvas, 80);
      const onResize = () => initCanvas();
      window.addEventListener('resize', onResize);
      return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
    }
  }, [signing]);

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const signDeclaration = async () => {
    if (!activeDeclaration || !canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');

    // Upload signature image
    const blob = await (await fetch(dataUrl)).blob();
    const path = `declarations/sig_${activeDeclaration.id}_${Date.now()}.png`;
    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(path, blob, { contentType: 'image/png', upsert: false, cacheControl: '3600' });
    if (uploadErr) {
      console.error('Signature upload error:', uploadErr);
      toast.error('שגיאה בשמירת החתימה: ' + uploadErr.message);
      return;
    }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);

    const signedAt = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 5);

    const { error: updateErr } = await supabase.from('driver_declarations').update({
      status: 'signed',
      signed_at: signedAt,
      signature_url: urlData.publicUrl,
      expires_at: expiresAt.toISOString(),
    } as any).eq('id', activeDeclaration.id);

    if (updateErr) {
      console.error('Update error:', updateErr);
      toast.error('שגיאה בעדכון התצהיר: ' + updateErr.message);
      return;
    }

    toast.success('התצהיר נחתם בהצלחה!');
    setSigning(false);
    setActiveDeclaration(null);
    loadDeclarations();
  };

  const getStatusBadge = (d: Declaration) => {
    if (d.status === 'signed') {
      const isExpired = d.expires_at && new Date(d.expires_at) < new Date();
      const isExpiringSoon = d.expires_at && new Date(d.expires_at) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      if (isExpired) return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-destructive/10 text-destructive text-sm font-bold"><AlertTriangle size={14} /> פג תוקף</span>;
      if (isExpiringSoon) return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-warning/10 text-warning text-sm font-bold"><Clock size={14} /> תוקף עומד לפוג</span>;
      return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-success/10 text-success text-sm font-bold"><Check size={14} /> נחתם</span>;
    }
    return <span className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-warning/10 text-warning text-sm font-bold"><Clock size={14} /> ממתין לחתימה</span>;
  };


  if (signing && activeDeclaration) {
    const displayText = resolveDeclarationDisplayText(activeDeclaration);
    return (
      <div className="space-y-4">
        <button onClick={() => { setSigning(false); setActiveDeclaration(null); }} className="flex items-center gap-2 text-primary text-lg font-medium min-h-[48px]">
          <ArrowRight size={20} /> חזרה
        </button>
        <h2 className="text-xl font-bold">תצהיר בעל רישיון נהיגה</h2>
        
        <div className="p-4 rounded-xl border border-border bg-muted/30 text-sm leading-7 whitespace-pre-line" dir="rtl">
          <p className="font-bold mb-2">אני, {activeDeclaration.driver_name}, ת.ז {activeDeclaration.id_number || '______'}</p>
          {displayText}
        </div>

        <div>
          <p className="text-lg font-medium mb-2">חתימה דיגיטלית:</p>
          <div className="border-2 border-input rounded-xl overflow-hidden bg-white" style={{ height: 180 }}>
            <canvas
              ref={canvasRef}
              className="w-full h-full touch-none block"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <button onClick={clearCanvas} className="text-sm text-muted-foreground mt-1 underline">נקה חתימה</button>
        </div>

        <button onClick={signDeclaration} className="w-full py-4 rounded-xl bg-primary text-primary-foreground text-lg font-bold flex items-center justify-center gap-2">
          <Pencil size={20} /> חתום ואשר
        </button>
      </div>
    );
  }

  if (loading) return <div className="text-center py-4 text-muted-foreground">טוען...</div>;

  const latest = declarations[0];
  const needsRenewal = latest?.status === 'signed' && latest.expires_at && new Date(latest.expires_at) < new Date();

  return (
    <div id="driver-declaration-section" className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-bold flex items-center gap-2"><FileText size={20} /> תצהיר נהג</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {canManageTemplates && (
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="px-3 py-2 rounded-xl bg-muted text-foreground text-sm font-bold flex items-center gap-1"
              title="ניהול תבניות תצהיר"
            >
              <Settings2 size={14} />
              <Pencil size={14} />
              תבניות
            </button>
          )}
          {(mode === 'manager' || !latest) && (
            <button type="button" onClick={createDeclaration} disabled={creating || (latest?.status === 'pending')}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50">
              {creating ? 'יוצר...' : needsRenewal ? 'חדש תצהיר' : latest ? 'תצהיר חדש' : 'צור תצהיר'}
            </button>
          )}
        </div>
      </div>

      {canManageTemplates && showTemplates && (
        <DeclarationTemplateManager companyName={effectiveCompany} compact />
      )}

      {declarations.length === 0 ? (
        <p className="text-muted-foreground text-center py-6">אין תצהירים – לחץ ״צור תצהיר״</p>
      ) : (
        <div className="space-y-3">
          {declarations.map(d => (
            <div key={d.id} className="p-4 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center justify-between">
                {getStatusBadge(d)}
                <span className="text-sm text-muted-foreground">{new Date(d.created_at).toLocaleDateString('he-IL')}</span>
              </div>
              
              {d.signed_at && (
                <p className="text-sm text-muted-foreground">נחתם: {new Date(d.signed_at).toLocaleDateString('he-IL')}</p>
              )}
              {d.expires_at && (
                <p className="text-sm text-muted-foreground">תוקף עד: {new Date(d.expires_at).toLocaleDateString('he-IL')}</p>
              )}
              {d.signature_url && (
                <div>
                  <img src={d.signature_url} alt="חתימה" className="h-16 rounded border border-border bg-white p-1" />
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPreviewDeclaration(d)}
                  className="px-3 py-2 rounded-xl bg-muted text-foreground text-sm font-bold flex items-center gap-1"
                  title="תצוגה מקדימה — כך ייראה התצהיר לנהג"
                >
                  <Eye size={14} /> תצוגה מקדימה
                </button>
                {d.status === 'pending' && mode === 'driver' && (
                  <button onClick={() => { setActiveDeclaration(d); setSigning(true); }}
                    className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold flex items-center gap-1">
                    <Pencil size={14} /> חתום עכשיו
                  </button>
                )}
                {d.status === 'pending' && mode === 'manager' && (
                  <>
                    <button onClick={() => sendDeclaration(d, 'whatsapp')}
                      className="px-3 py-2 rounded-xl bg-success/10 text-success text-sm font-bold flex items-center gap-1">
                      <Send size={14} /> שלח בוואטסאפ
                    </button>
                    <button onClick={() => sendDeclaration(d, 'email')}
                      className="px-3 py-2 rounded-xl bg-info/10 text-info text-sm font-bold flex items-center gap-1">
                      <Send size={14} /> העתק קישור
                    </button>
                    <button onClick={() => { setActiveDeclaration(d); setSigning(true); }}
                      className="px-3 py-2 rounded-xl bg-muted text-foreground text-sm font-bold flex items-center gap-1">
                      <Pencil size={14} /> חתום כעת
                    </button>
                  </>
                )}
                {d.status === 'signed' && (
                  <button onClick={() => printDeclaration({ ...d, declaration_text: d.declaration_text || resolveDeclarationDisplayText(d) })}
                    className="px-3 py-2 rounded-xl bg-primary/10 text-primary text-sm font-bold flex items-center gap-1">
                    <Printer size={14} /> הדפס / שמור PDF
                  </button>
                )}
              </div>

              {d.sent_via && (
                <p className="text-xs text-muted-foreground">נשלח דרך {d.sent_via === 'whatsapp' ? 'וואטסאפ' : 'אימייל'} ב-{d.sent_at ? new Date(d.sent_at).toLocaleDateString('he-IL') : ''}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {previewDeclaration && (
        <DeclarationPreviewModal
          declaration={previewDeclaration}
          onClose={() => setPreviewDeclaration(null)}
        />
      )}
    </div>
  );
}
