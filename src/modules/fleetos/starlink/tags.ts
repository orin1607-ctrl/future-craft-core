/** Official default P177 — tag map, not a hard-coded 12-index parser. */
export const DEFAULT_P177 =
  '#EDT#,#EID#,#PDT#,#LAT#,#LONG#,#SPD#,#HEAD#,#ODO#,#LAC#,#CID#,#VIN#,#VBAT#';

export const KNOWN_TAGS = [
  'EDT', 'EID', 'PDT', 'LAT', 'LONG', 'LTDD', 'LGDD', 'SPD', 'SPDK', 'HEAD',
  'ODO', 'LAC', 'CID', 'VIN', 'VBAT', 'IGN', 'IN8', 'ENG', 'DRV', 'PAS', 'PAM',
  'RPM', 'DUR', 'TDUR', 'CFL', 'CFL2', 'DID', 'DAL', 'IMEI', 'UID', 'FID',
  'VER', 'CSS', 'NC', 'NT', 'NXT', 'NXTS', 'FIX', 'JAM', 'CX', 'CR',
  'CV1', 'CV2', 'CV3', 'CV4', 'CV5', 'CV6', 'CV7', 'CV8', 'CV9', 'CV10', 'CV11', 'CV12',
] as const;

export type KnownTag = (typeof KNOWN_TAGS)[number];

export function parseP177Template(template: string | null | undefined): string[] {
  const raw = (template || DEFAULT_P177).trim();
  if (!raw) return parseP177Template(DEFAULT_P177);
  return raw
    .split(',')
    .map((t) => t.trim().replace(/^#/, '').replace(/#$/, ''))
    .filter(Boolean);
}

export function isCanTag(tag: string): boolean {
  return /^CV([1-9]|1[0-2])$/i.test(tag);
}
