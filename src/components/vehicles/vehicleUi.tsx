import type { ReactNode } from 'react';
import { DocumentAttachment } from '@/components/documents/DocumentViewer';

export function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground text-sm">{label}</span>
      <p className="font-bold">{value}</p>
    </div>
  );
}

/** @deprecated use DocumentAttachment directly */
export function DocLink({ label, url }: { label: string; url: string }) {
  return <DocumentAttachment label={label} url={url} />;
}

export function ExpiryRow({
  label,
  date,
  daysLeft,
  colorCls,
  trailing,
}: {
  label: string;
  date: string | null;
  daysLeft: number | null;
  colorCls: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border last:border-0">
      <span className="font-medium">{label}</span>
      {date ? (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-sm text-muted-foreground">{new Date(date).toLocaleDateString('he-IL')}</span>
          <span className={`text-sm ${colorCls}`}>
            {daysLeft !== null && (daysLeft <= 0 ? 'פג תוקף!' : `${daysLeft} ימים`)}
          </span>
          {trailing}
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
