import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function HomeWorldCard({
  to,
  icon: Icon,
  title,
  subtitle,
  badge,
  accent = 'primary',
  className,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: string | number;
  accent?: 'primary' | 'info' | 'warning' | 'success';
  className?: string;
}) {
  const accentRing =
    accent === 'info'
      ? 'hover:border-info/50 hover:bg-info/5'
      : accent === 'warning'
        ? 'hover:border-warning/50 hover:bg-warning/5'
        : accent === 'success'
          ? 'hover:border-success/50 hover:bg-success/5'
          : 'hover:border-primary/50 hover:bg-primary/5';

  return (
    <Link
      to={to}
      className={cn(
        'home-world-card group flex flex-col justify-between min-h-[132px] md:min-h-[148px]',
        accentRing,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="home-world-card-icon">
          <Icon size={28} className="text-primary" />
        </div>
        {badge !== undefined && badge !== '' && (
          <span className="text-sm font-black text-primary bg-primary/10 px-2.5 py-1 rounded-full shrink-0">
            {badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-lg md:text-xl font-black text-foreground leading-tight">{title}</p>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1 leading-snug">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}
