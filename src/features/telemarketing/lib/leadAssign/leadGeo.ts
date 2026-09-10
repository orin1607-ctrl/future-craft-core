/** Group existing city `region` values. Does not invent a city for a lead. */
export const MACRO_REGIONS = ['מרכז', 'שפלה', 'שרון', 'ירושלים', 'צפון', 'דרום'] as const;
export type MacroRegion = (typeof MACRO_REGIONS)[number];

const MACRO_CITIES: Record<MacroRegion, string[]> = {
  מרכז: ['תל אביב יפו', 'תל אביב', 'רמת גן', 'גבעתיים', 'בני ברק', 'חולון', 'בת ים', 'פתח תקווה', 'ראש העין', 'אור יהודה', 'קריית אונו', 'גבעת שמואל', 'יהוד', 'מודיעין מכבים רעות', 'מודיעין', 'רמת השרון', 'אזור'],
  שפלה: ['ראשון לציון', 'רחובות', 'נס ציונה', 'יבנה', 'גדרה', 'לוד', 'רמלה', 'באר יעקב', 'מזכרת בתיה', 'קריית עקרון'],
  שרון: ['הרצליה', 'רעננה', 'כפר סבא', 'נתניה', 'הוד השרון', 'רמת השרון', 'כפר יונה', 'פרדס חנה כרכור', 'קלנסווה', 'טירה', 'טייבה'],
  ירושלים: ['ירושלים', 'מבשרת ציון', 'מעלה אדומים', 'בית שמש', 'מבשרת'],
  צפון: ['חיפה', 'קריית אתא', 'קריית ביאליק', 'קריית מוצקין', 'קריית ים', 'עכו', 'נהריה', 'טבריה', 'נצרת', 'עפולה', 'כרמיאל', 'צפת', 'יקנעם'],
  דרום: ['באר שבע', 'אשדוד', 'אשקלון', 'קריית גת', 'דימונה', 'אילת', 'נתיבות', 'אופקים', 'שדרות', 'ערד'],
};

const CITY_TO_MACRO = new Map<string, MacroRegion>();
for (const [macro, cities] of Object.entries(MACRO_CITIES) as [MacroRegion, string[]][]) {
  for (const city of cities) CITY_TO_MACRO.set(city, macro);
}

export function macroForCity(region: string | null | undefined): MacroRegion | null {
  const city = String(region || '').trim();
  if (!city) return null;
  const exact = CITY_TO_MACRO.get(city);
  if (exact) return exact;
  for (const [name, macro] of CITY_TO_MACRO) {
    if (city.includes(name) || name.includes(city)) return macro;
  }
  return null;
}

export function matchesMacro(region: string | null | undefined, macro: string): boolean {
  if (!macro || macro === 'all' || macro === 'כל הארץ') return true;
  if (macro === 'none' || macro === 'ללא אזור') return !String(region || '').trim();
  return macroForCity(region) === macro;
}
