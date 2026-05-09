import { useState } from 'react';
import { Phone, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import VoiceAgentDialer from './VoiceAgentDialer';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  vehiclePlate?: string;
  flowType?: string;
  variant?: 'icon' | 'full';
  className?: string;
}

type ValidationState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; driverName: string; driverPhone: string | null; driverId: string | null }
  | { status: 'missing_plate' }
  | { status: 'plate_not_found' }
  | { status: 'no_driver' };

export default function CallCustomerButton({
  customerId,
  customerName,
  customerPhone,
  vehiclePlate,
  flowType = 'customer_call',
  variant = 'full',
  className = '',
}: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({ status: 'idle' });
  const [requestNotes, setRequestNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validateAndOpen = async () => {
    setOpen(true);
    setValidation({ status: 'checking' });

    const plate = (vehiclePlate || '').trim();
    if (!plate) {
      setValidation({ status: 'missing_plate' });
      return;
    }

    // Verify vehicle exists and find assigned driver
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id, license_plate, assigned_driver_id')
      .eq('license_plate', plate)
      .maybeSingle();

    if (!vehicle) {
      setValidation({ status: 'plate_not_found' });
      return;
    }

    const driverId: string | null = (vehicle as any).assigned_driver_id || null;

    if (!driverId) {
      setValidation({ status: 'no_driver' });
      return;
    }

    const { data: drv } = await supabase
      .from('drivers')
      .select('id, full_name, phone')
      .eq('id', driverId)
      .maybeSingle();

    if (!drv) {
      setValidation({ status: 'no_driver' });
      return;
    }

    setValidation({
      status: 'ok',
      driverName: drv.full_name || '',
      driverPhone: drv.phone || null,
      driverId: drv.id,
    });
  };

  const submitPickupRequest = async () => {
    setSubmitting(true);
    const reason =
      validation.status === 'missing_plate' ? 'חסר מספר רכב' :
      validation.status === 'plate_not_found' ? `הרכב ${vehiclePlate} לא נמצא במערכת` :
      validation.status === 'no_driver' ? `לרכב ${vehiclePlate} לא משויך נהג` :
      'בקשה לתיאום שיחה';

    const { error } = await supabase.from('pickup_appointments').insert({
      company_name: user?.company_name || null,
      customer_id: customerId || null,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      vehicle_plate: vehiclePlate || null,
      status: 'pending_review',
      source: 'manual_request',
      notes: `${reason}\n${requestNotes ? '— ' + requestNotes : ''}`.trim(),
      created_by: user?.id,
    });
    setSubmitting(false);
    if (error) {
      toast.error('שגיאה ביצירת בקשה: ' + error.message);
      return;
    }
    toast.success('הבקשה נשלחה למוקד לתיאום ידני');
    setOpen(false);
    setRequestNotes('');
    setValidation({ status: 'idle' });
  };

  const closeAll = () => {
    setOpen(false);
    setRequestNotes('');
    setValidation({ status: 'idle' });
  };

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); validateAndOpen(); }}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-all ${className}`}
        title="התקשר באמצעות Voice AI"
      >
        <Phone size={16} />
        {variant === 'full' && <span className="text-sm">התקשר AI</span>}
      </button>

      <Dialog open={open} onOpenChange={(o) => !o && closeAll()}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>שיחת Voice AI</DialogTitle>
          </DialogHeader>

          {validation.status === 'checking' && (
            <div className="py-8 text-center text-muted-foreground">בודק תקינות נתונים...</div>
          )}

          {(validation.status === 'missing_plate' || validation.status === 'plate_not_found' || validation.status === 'no_driver') && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="text-destructive shrink-0 mt-0.5" size={20} />
                <div className="text-sm">
                  <p className="font-bold mb-1">לא ניתן לבצע שיחה יזומה</p>
                  {validation.status === 'missing_plate' && <p>חובה לציין מספר רכב כדי לבצע שיחה יזומה.</p>}
                  {validation.status === 'plate_not_found' && <p>הרכב <strong>{vehiclePlate}</strong> אינו רשום במערכת.</p>}
                  {validation.status === 'no_driver' && <p>לרכב <strong>{vehiclePlate}</strong> לא משויך נהג. יש לשייך נהג ברשומת הרכב.</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <ClipboardCheck size={16} />
                  השאר בקשה לתיאום שיחה ידנית
                </Label>
                <Textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="הערות לתיאום (סיבה, מועד מועדף, פרטים נוספים)..."
                  rows={4}
                  maxLength={1000}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={submitPickupRequest} disabled={submitting} className="flex-1">
                  {submitting ? 'שולח...' : 'שלח בקשה לתיאום'}
                </Button>
                <Button variant="outline" onClick={closeAll}>ביטול</Button>
              </div>
            </div>
          )}

          {validation.status === 'ok' && (
            <VoiceAgentDialer
              customerId={customerId}
              customerName={customerName}
              customerPhone={customerPhone}
              vehiclePlate={vehiclePlate}
              flowType={flowType}
              onClose={closeAll}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
