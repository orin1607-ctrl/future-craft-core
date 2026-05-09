import { useState, useRef, useEffect } from 'react';
import { FileSignature, ArrowRight, Search, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyFilter, applyCompanyScope } from '@/hooks/useCompanyFilter';
import { toast } from 'sonner';
import ImageUpload from '@/components/ImageUpload';

interface DeclarationRow {
  id: string;
  driver_name: string;
  id_number: string;
  license_number: string;
  signature_url: string;
  license_image_url: string;
  declaration_date: string;
  company_name: string;
  created_at: string;
}

type ViewMode = 'list' | 'form';

export default function HealthDeclaration() {
  const { user } = useAuth();
  const companyFilter = useCompanyFilter();
  const [declarations, setDeclarations] = useState<DeclarationRow[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const { data } = await applyCompanyScope(
      supabase.from('driver_health_declarations').select('*'), companyFilter
    ).order('created_at', { ascending: false });
    if (data) setDeclarations(data as DeclarationRow[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filtered = declarations.filter(d =>
    !search || d.driver_name?.includes(search) || d.id_number?.includes(search)
  );

  if (viewMode === 'form') {
    return <DeclarationForm user={user} onDone={() => { setViewMode('list'); loadData(); }} onBack={() => setViewMode('list')} />;
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="page-header !mb-0 flex items-center gap-3"><FileSignature size={28} /> הצהרות בריאות</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם נהג או ת.ז..."
          className="w-full pr-12 p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none" />
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileSignature size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-xl">אין הצהרות</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(d => (
            <div key={d.id} className="card-elevated">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <FileSignature size={24} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-lg font-bold">{d.driver_name}</p>
                    {d.signature_url && <span className="text-success text-sm font-medium">✅ חתום</span>}
                  </div>
                  <p className="text-muted-foreground text-sm">ת.ז: {d.id_number || '—'} • רישיון: {d.license_number || '—'}</p>
                  <p className="text-muted-foreground text-sm">תאריך: {new Date(d.declaration_date).toLocaleDateString('he-IL')}</p>

                  <div className="mt-3 p-3 bg-muted/40 rounded-xl text-sm leading-relaxed space-y-1.5">
                    <p className="font-bold text-foreground">תוכן ההצהרה:</p>
                    <p>• אני מצהיר/ה כי לא חלה כל מגבלה במצב בריאותי המונעת ממני לנהוג, לרבות מגבלות במערכת העצבים, בעצמות, הראייה או השמיעה.</p>
                    <p>• לא נפסלתי מלקבל רישיון נהיגה או מלהחזיק בו על-ידי בית המשפט, רשות הרישוי או קצין משטרה.</p>
                    <p>• לא חל שינוי במצבי הבריאותי במשך חמש השנים האחרונות.</p>
                    <p>• מתחייב/ת לא לנהוג תחת השפעת סמים או משקאות משכרים.</p>
                    <p>• מתחייב/ת להודיע מיידית על כל שינוי במצב בריאותי או ברישיון הנהיגה.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                    {d.signature_url && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">חתימה</p>
                        <a href={d.signature_url} target="_blank" rel="noopener noreferrer">
                          <img src={d.signature_url} alt="חתימה" className="w-full max-h-32 object-contain bg-white rounded-xl border border-border" />
                        </a>
                      </div>
                    )}
                    {d.license_image_url && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">צילום רישיון נהיגה</p>
                        <a href={d.license_image_url} target="_blank" rel="noopener noreferrer">
                          <img src={d.license_image_url} alt="רישיון" className="w-full max-h-32 object-contain bg-white rounded-xl border border-border" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => setViewMode('form')}
        className="fixed bottom-24 left-6 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-xl hover:shadow-2xl transition-all flex items-center justify-center hover:scale-110"
        title="הצהרה חדשה">
        <FileSignature size={28} />
      </button>
    </div>
  );
}

function DeclarationForm({ user, onDone, onBack }: { user: any; onDone: () => void; onBack: () => void }) {
  const [driverName, setDriverName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseImageUrl, setLicenseImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSigned, setHasSigned] = useState(false);

  const inputClass = "w-full p-4 text-lg rounded-xl border-2 border-input bg-background focus:border-primary focus:outline-none";

  // Canvas signature
  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    setHasSigned(true);
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : (e as React.MouseEvent).clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
  };

  const handleSubmit = async () => {
    if (!driverName || !idNumber || !licenseNumber || !hasSigned) {
      toast.error('יש למלא את כל השדות ולחתום');
      return;
    }
    setLoading(true);

    let signatureUrl = '';
    // Upload signature
    const canvas = canvasRef.current;
    if (canvas) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const path = `${user?.id}/health-declarations/${crypto.randomUUID()}.png`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(path, blob);
        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(path);
          signatureUrl = publicUrl;
        }
      }
    }

    const { error } = await supabase.from('driver_health_declarations').insert({
      driver_name: driverName,
      id_number: idNumber,
      license_number: licenseNumber,
      signature_url: signatureUrl,
      license_image_url: licenseImageUrl || '',
      declaration_date: new Date().toISOString().split('T')[0],
      company_name: user?.company_name || '',
      created_by: user?.id,
    });

    setLoading(false);
    if (error) {
      toast.error('שגיאה בשמירה');
    } else {
      toast.success('ההצהרה נשמרה בהצלחה');
      onDone();
    }
  };

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="flex items-center gap-2 text-primary text-lg font-medium mb-4 min-h-[48px]">
        <ArrowRight size={20} /> חזרה
      </button>
      <h1 className="text-2xl font-bold mb-4">הצהרת בריאות נהג</h1>

      <div className="card-elevated mb-6 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-bold text-foreground mb-3">הצהרת בעל/ת רישיון נהיגה</h2>
        <p className="mb-2 text-destructive font-medium">חובה להחתים את הנהג ולצרף צילום דו-צדדי של רישיון הנהיגה בתוקף</p>
        <p className="mb-2">אני החתום/ה מטה, מצהיר/ה בזה כי לא חלה כל מגבלה במצב בריאותי המונעת ממני לנהוג, לרבות מגבלות במערכת העצבים, בעצמות, הראייה או השמיעה, ומצב בריאותי הנוכחי כשיר לנהיגה.</p>
        <p className="mb-2">אני מצהיר/ה כי לא נפסלתי מלקבל רישיון נהיגה או מלהחזיק בו על-ידי בית המשפט, רשות הרישוי או קצין משטרה.</p>
        <p className="mb-2">אני מצהיר/ה כי לא חל שינוי במצבי הבריאותי במשך חמש השנים האחרונות.</p>
        <p className="mb-2">אני מתחייב/ת בזה לא לנהוג תחת השפעת סמים משכרים או משקאות משכרים.</p>
        <p className="mb-2">* במידה ויחולו שינויים במצב בריאותי בעתיד, או ישונה מצב סוג ו/או תוקף רישיון הנהיגה שלי, אני מתחייב/ת להודיע על כך מיידית לקצין הבטיחות בעבודה.</p>
        <p>* פסילה מנהיגה ע"י: בית משפט, קצין משטרה ורשות הרישוי.</p>
      </div>

      <div className="space-y-5">
        <div>
          <label className="block text-lg font-medium mb-2">שם מלא *</label>
          <input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="שם הנהג..." className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-lg font-medium mb-2">תעודת זהות *</label>
            <input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="מספר ת.ז..." className={inputClass} />
          </div>
          <div>
            <label className="block text-lg font-medium mb-2">מספר רישיון נהיגה *</label>
            <input value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} placeholder="מספר רישיון..." className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-lg font-medium mb-2">תאריך</label>
          <input type="date" value={new Date().toISOString().split('T')[0]} readOnly className={`${inputClass} bg-muted`} />
        </div>

        {/* Signature canvas */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-lg font-medium">חתימה דיגיטלית *</label>
            <button type="button" onClick={clearSignature} className="text-sm text-primary font-medium">נקה חתימה</button>
          </div>
          <canvas
            ref={canvasRef}
            width={350}
            height={150}
            className="w-full border-2 border-input rounded-xl bg-white touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
          />
          {!hasSigned && <p className="text-sm text-muted-foreground mt-1">חתום כאן באצבע או בעכבר</p>}
        </div>

        {/* License photo */}
        <ImageUpload
          label="צילום רישיון נהיגה (דו-צדדי)"
          required
          imageUrl={licenseImageUrl}
          onImageUploaded={setLicenseImageUrl}
          folder="health-declarations"
        />

        <button onClick={handleSubmit} disabled={!driverName || !idNumber || !licenseNumber || !hasSigned || loading}
          className={`w-full py-5 rounded-xl text-xl font-bold transition-colors ${
            driverName && idNumber && licenseNumber && hasSigned && !loading
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}>
          {loading ? 'שולח...' : '📤 שלח הצהרה'}
        </button>
      </div>
    </div>
  );
}
