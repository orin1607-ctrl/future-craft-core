import type { LeadDirectoryRecord } from '@/features/telemarketing/lib/leadImport/types';

export function DirectoryLeadCard({ lead }: { lead: LeadDirectoryRecord }) {
  return (
    <div className="rounded-2xl border border-emerald-700/40 bg-emerald-50 p-4 dark:bg-emerald-950/30" data-testid="directory-lead-card">
      <p className="text-lg font-black">ליד #{lead.leadNumber || '—'} — {lead.companyName || 'ללא שם חברה'}</p>
      <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        <div><span className="text-muted-foreground">תחום: </span>{lead.industry || '—'}</div>
        <div><span className="text-muted-foreground">אזור: </span>{lead.region || '—'}</div>
        <div><span className="text-muted-foreground">צי רכב: </span>{lead.fleetSize || '—'}</div>
        <div dir="ltr"><span className="text-muted-foreground">טלפון: </span>{lead.phone || '—'}</div>
        <div className="sm:col-span-2" dir="ltr"><span className="text-muted-foreground">מייל: </span>{lead.email || '—'}</div>
        {lead.assignedName && <div>עובד משויך: {lead.assignedName}</div>}
      </dl>
      {lead.extra && Object.keys(lead.extra).length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          {Object.entries(lead.extra).map(([key, value]) => (
            <p key={key}>{key}: {value}</p>
          ))}
        </div>
      )}
    </div>
  );
}
