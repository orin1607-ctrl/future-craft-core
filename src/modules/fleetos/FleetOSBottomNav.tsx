import { Radar, Fuel, Bell, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type FleetOSNavModule = 'status' | 'fuel' | 'alerts' | 'ai';

const TABS: { id: FleetOSNavModule; label: string; icon: typeof Radar }[] = [
  { id: 'status', label: 'מצב צי', icon: Radar },
  { id: 'fuel', label: 'דלק וטעינה', icon: Fuel },
  { id: 'alerts', label: 'התראות ופעולות', icon: Bell },
  { id: 'ai', label: 'AI ותובנות', icon: Sparkles },
];

export default function FleetOSBottomNav({
  active = 'status',
  onModuleChange,
}: {
  active?: FleetOSNavModule;
  onModuleChange?: (id: FleetOSNavModule) => void;
}) {
  const onTab = (id: FleetOSNavModule) => {
    if (id === active) return;
    if (onModuleChange) {
      onModuleChange(id);
      return;
    }
    toast.info('המודול בבנייה');
  };

  return (
    <nav
      className="fixed bottom-16 md:bottom-0 left-0 right-0 md:right-72 z-40 bg-card border-t-2 border-border shadow-[0_-4px_24px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)]"
      aria-label="ניווט FleetOS AI"
    >
      <div className="grid grid-cols-4 max-w-4xl mx-auto">
        {TABS.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTab(id)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2.5 px-1 min-h-[64px] transition-colors',
                isActive
                  ? 'text-primary bg-primary/5 border-t-2 border-primary -mt-[2px]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/40',
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={cn('text-[10px] sm:text-xs font-bold leading-tight text-center', isActive && 'text-primary')}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
