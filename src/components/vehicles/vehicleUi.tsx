import { FileText, Image } from 'lucide-react';

export function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground text-sm">{label}</span>
      <p className="font-bold">{value}</p>
    </div>
  );
}

export function DocLink({ label, url }: { label: string; url: string }) {
  const isPdf = /\.pdf($|[?#])/i.test(url);
  const Icon = isPdf ? FileText : Image;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={isPdf ? true : undefined}
      className="flex items-center gap-2 py-2 px-3 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-sm font-medium text-primary"
    >
      <Icon size={16} /> {label} {isPdf ? '(PDF)' : ''}
    </a>
  );
}

export function ExpiryRow({
  label,
  date,
  daysLeft,
  colorCls,
}: {
  label: string;
  date: string | null;
  daysLeft: number | null;
  colorCls: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <span className="font-medium">{label}</span>
      {date ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{new Date(date).toLocaleDateString('he-IL')}</span>
          <span className={`text-sm ${colorCls}`}>
            {daysLeft !== null && (daysLeft <= 0 ? 'פג תוקף!' : `${daysLeft} ימים`)}
          </span>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">לא הוגדר</span>
      )}
    </div>
  );
}

export function DashboardTile({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 border ${
        warn ? 'border-destructive/40 bg-destructive/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <p className="text-xs text-white/70 mb-1">{label}</p>
      <p className={`text-sm font-bold leading-snug ${warn ? 'text-red-200' : 'text-white'}`}>{value}</p>
    </div>
  );
}
