import { ArrowRight, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

export default function FleetOSSheetPanel({
  open,
  title,
  onClose,
  onBack,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-[min(88vh,720px)] rounded-t-2xl p-0 flex flex-col">
        <div className="w-9 h-1 bg-border rounded-full mx-auto mt-3 shrink-0" />
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            {onBack && (
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={onBack}>
                <ArrowRight size={16} />
                חזרה
              </Button>
            )}
            <SheetTitle className="text-base font-bold flex-1 text-right">{title}</SheetTitle>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
              <X size={18} />
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
