import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { WHATSAPP_MAX_SENDS } from '@/lib/whatsappUiMock';
import { topicOptionsForView, type LogViewMode } from '@/lib/notificationLogMock';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewMode?: LogViewMode;
  defaultVehiclePlate?: string;
  defaultDriverName?: string;
  defaultWaSent?: number;
};

export default function AddNotificationDialog({
  open,
  onOpenChange,
  viewMode = 'general',
  defaultVehiclePlate = '',
  defaultDriverName = '',
  defaultWaSent = 0,
}: Props) {
  const topicOptions = topicOptionsForView(viewMode);
  const [topic, setTopic] = useState(topicOptions[0]);
  const [vehiclePlate, setVehiclePlate] = useState(defaultVehiclePlate);
  const [driverName, setDriverName] = useState(defaultDriverName);
  const [targetDate, setTargetDate] = useState('');
  const [channel, setChannel] = useState<'system' | 'whatsapp' | 'email'>('system');
  const [notes, setNotes] = useState('');
  const [sendNow, setSendNow] = useState(false);

  const handleOpen = (next: boolean) => {
    if (next) {
      setTopic(topicOptionsForView(viewMode)[0]);
      setVehiclePlate(defaultVehiclePlate);
      setDriverName(defaultDriverName);
    }
    onOpenChange(next);
  };

  const submit = () => {
    toast.success('[Mock] התראה נשמרה ביומן', {
      description: `${topic} · ${channel}${sendNow && channel === 'whatsapp' ? ' · שליחה מדומה' : ''}`,
    });
    handleOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>
            הוסף התראה
            {viewMode === 'driver' && ' — נהג'}
            {viewMode === 'vehicle' && ' — רכב'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <Label htmlFor="add-topic">סוג התראה</Label>
            <select
              id="add-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="mt-1 w-full p-3 rounded-xl border-2 border-input bg-background text-sm"
            >
              {topicOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {viewMode !== 'driver' && (
            <div>
              <Label htmlFor="add-vehicle">רכב (לוחית)</Label>
              <input
                id="add-vehicle"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                placeholder="12-345-67"
                disabled={viewMode === 'vehicle' && Boolean(defaultVehiclePlate)}
                className="mt-1 w-full p-3 rounded-xl border-2 border-input bg-background text-sm disabled:opacity-60"
              />
            </div>
          )}

          {viewMode !== 'vehicle' && (
            <div>
              <Label htmlFor="add-driver">נהג</Label>
              <input
                id="add-driver"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="שם נהג"
                disabled={viewMode === 'driver' && Boolean(defaultDriverName)}
                className="mt-1 w-full p-3 rounded-xl border-2 border-input bg-background text-sm disabled:opacity-60"
              />
            </div>
          )}

          <div>
            <Label htmlFor="add-date">תאריך יעד</Label>
            <input
              id="add-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="mt-1 w-full p-3 rounded-xl border-2 border-input bg-background text-sm"
            />
          </div>

          <div>
            <Label>ערוץ שליחה</Label>
            <div className="mt-2 space-y-2">
              {(
                [
                  ['system', 'מערכת בלבד — שמירה ביומן'],
                  ['whatsapp', 'WhatsApp'],
                  ['email', 'אימייל'],
                ] as const
              ).map(([val, label]) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="channel"
                    checked={channel === val}
                    onChange={() => setChannel(val)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {channel === 'whatsapp' && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs space-y-2">
              <p>
                מונה נוכחי לנושא/מחזור:{' '}
                <strong>
                  {defaultWaSent}/{WHATSAPP_MAX_SENDS}
                </strong>
              </p>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!sendNow} onChange={() => setSendNow(false)} />
                שמור ביומן בלבד — לא לשלוח עכשיו
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={sendNow}
                  onChange={() => setSendNow(true)}
                  disabled={defaultWaSent >= WHATSAPP_MAX_SENDS}
                />
                שלח עכשיו
                {defaultWaSent >= WHATSAPP_MAX_SENDS && (
                  <span className="text-destructive">(3/3 חסום)</span>
                )}
              </label>
            </div>
          )}

          <div>
            <Label htmlFor="add-notes">הערות</Label>
            <textarea
              id="add-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full p-3 rounded-xl border-2 border-input bg-background text-sm resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => handleOpen(false)}>
            ביטול
          </Button>
          <Button type="button" onClick={submit}>
            {sendNow && channel === 'whatsapp' ? 'שמור ושלח' : 'שמור'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
