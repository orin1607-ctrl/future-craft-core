import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  WHATSAPP_MAX_SENDS,
  SEND_KIND_LABELS,
  type WhatsAppSendKind,
  maskPhone,
} from '@/lib/whatsappUiMock';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientName: string;
  recipientPhone: string;
  kind: WhatsAppSendKind;
  sentCount: number;
  vehiclePlate?: string;
  expiryDate?: string;
  previewMessage: string;
  onConfirmSend: () => void;
  blocked?: boolean;
};

export default function WhatsAppSendDialog({
  open,
  onOpenChange,
  recipientName,
  recipientPhone,
  kind,
  sentCount,
  vehiclePlate,
  expiryDate,
  previewMessage,
  onConfirmSend,
  blocked = false,
}: Props) {
  const remaining = Math.max(0, WHATSAPP_MAX_SENDS - sentCount);
  const topicLabel = SEND_KIND_LABELS[kind];

  if (blocked) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>שליחת WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center space-y-3">
            <p className="text-4xl" aria-hidden>
              🔒
            </p>
            <p className="font-bold text-lg">שליחה חסומה</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              נשלחו {WHATSAPP_MAX_SENDS} מתוך {WHATSAPP_MAX_SENDS} הודעות WhatsApp לנושא &quot;{topicLabel}
              &quot;.
              <br />
              עדכון תאריך התפוגה יפתח מחזור חדש עם 0/{WHATSAPP_MAX_SENDS}.
            </p>
          </div>
          <DialogFooter className="sm:justify-center">
            <Button type="button" onClick={() => onOpenChange(false)}>
              הבנתי
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת WhatsApp</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">נמען</p>
            <p className="font-medium">
              {recipientName} · {maskPhone(recipientPhone)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs mb-0.5">נושא</p>
            <p className="font-medium">{topicLabel}</p>
          </div>
          {vehiclePlate && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">רכב</p>
              <p className="font-medium">{vehiclePlate}</p>
            </div>
          )}
          {expiryDate && (
            <div>
              <p className="text-muted-foreground text-xs mb-0.5">תאריך תפוגה</p>
              <p className="font-medium">{new Date(expiryDate).toLocaleDateString('he-IL')}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground text-xs mb-1">תצוגה מקדימה (Mock)</p>
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm whitespace-pre-line leading-relaxed">
              {previewMessage}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            נשלח: {sentCount}/{WHATSAPP_MAX_SENDS} · נותרו: {remaining} שליחות
          </p>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            ביטול
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto bg-[#25D366] hover:bg-[#20bd5a] text-white"
            onClick={() => {
              onConfirmSend();
              onOpenChange(false);
            }}
          >
            שלח WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
