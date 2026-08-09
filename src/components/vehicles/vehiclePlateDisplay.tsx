import type { ReactNode } from 'react';

/** Shared styling for internal vehicle numbers across the app. */
export const internalNumberClassName = 'text-destructive font-bold';

/** Standalone internal number — red and prominent. */
export function InternalNumber({
  value,
  className = '',
  empty = '—',
}: {
  value?: string | null;
  className?: string;
  empty?: string;
}) {
  const n = (value || '').trim();
  if (!n || n === '—') return <span className={className}>{empty}</span>;
  return (
    <span className={`font-mono ${internalNumberClassName} ${className}`} dir="ltr">
      {n}
    </span>
  );
}

/** Plain string helper (logs, exports, non-UI). */
export function formatVehicleIds(plate: string, internal?: string | null) {
  const p = (plate || '').trim();
  const n = (internal || '').trim();
  if (!p && !n) return '—';
  if (p && n) return `${p} · ${n}`;
  return p || n;
}

export function VehiclePlateLine({
  plate,
  internal,
  className = '',
  separator = ' · ',
}: {
  plate: string;
  internal?: string | null;
  className?: string;
  separator?: string;
}) {
  const p = (plate || '').trim();
  const n = (internal || '').trim();
  if (!p && !n) return <span className={className}>—</span>;
  return (
    <span className={`font-mono text-sm ${className}`} dir="ltr">
      {p}
      {p && n ? separator : null}
      {n ? <InternalNumber value={n} className="inline text-sm" /> : null}
    </span>
  );
}

/** Plate with pipe separator (vehicles list). */
export function VehiclePlatePipeLine({
  plate,
  internal,
  className = '',
  trailing,
}: {
  plate: string;
  internal?: string | null;
  className?: string;
  trailing?: ReactNode;
}) {
  const p = (plate || '').trim();
  const n = (internal || '').trim();
  return (
    <span className={`font-mono text-sm ${className}`} dir="ltr">
      {p}
      {n ? (
        <>
          {' | '}
          <InternalNumber value={n} className="inline text-sm" />
        </>
      ) : null}
      {trailing}
    </span>
  );
}

/** Optional " · פנימי {n}" suffix for dropdowns and compact lines. */
export function InternalPrefixSuffix({
  internal,
  prefix = ' · פנימי ',
}: {
  internal?: string | null;
  prefix?: string;
}) {
  const n = (internal || '').trim();
  if (!n) return null;
  return (
    <>
      {prefix}
      <InternalNumber value={n} className="inline text-inherit" />
    </>
  );
}
