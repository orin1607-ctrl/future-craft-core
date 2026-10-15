/** Israel wall-clock conversion for the existing accidents.date column.
 * Does not add columns. Seconds are not preserved; callers must avoid writing
 * a round-tripped value back when the user did not change the date or time.
 */

function jerusalemOffsetMinutes(at: Date): number {
  const tz = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  }).formatToParts(at).find((part) => part.type === 'timeZoneName')?.value || '';
  const match = tz.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 180;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

export function israelWallTimeToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  let offset = jerusalemOffsetMinutes(new Date(Date.UTC(year, month - 1, day, hour, minute, 0)));
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60_000;
  const corrected = jerusalemOffsetMinutes(new Date(utc));
  if (corrected !== offset) {
    offset = corrected;
    utc = Date.UTC(year, month - 1, day, hour, minute, 0) - offset * 60_000;
  }
  const result = new Date(utc);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

export function isoToIsraelWall(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const read = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { date: `${read('year')}-${read('month')}-${read('day')}`, time: `${read('hour')}:${read('minute')}` };
}
