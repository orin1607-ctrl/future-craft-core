/** תצוגה אחידה: מספר רכב · מספר פנימי */
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
}: {
  plate: string;
  internal?: string | null;
  className?: string;
}) {
  return (
    <span className={`font-mono text-sm ${className}`} dir="ltr">
      {formatVehicleIds(plate, internal)}
    </span>
  );
}
