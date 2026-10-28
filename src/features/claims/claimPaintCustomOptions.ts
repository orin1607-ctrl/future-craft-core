/**
 * claimPaintCustomOptions.ts
 * מודול ניהול אפשרויות מותאמות אישית בעבודה מהירה במחשבון הצבע.
 * כולל מנוע שיוך חכם (זיהוי חלק וסוג עבודה), שמירה קבועה/זמנית,
 * הפרדה לפי חברה/מוסך, ועריכה/מחיקה.
 */

export interface FastWorkItem {
  key: string;
  label: string;
  part: string;
  mode: 'full' | 'blend' | 'newpart' | 'custom';
  pct: number;
  category: string;
  isCustom?: boolean;
  isPermanent?: boolean;
  companyName?: string;
  createdAt?: string;
  customBaseHours?: number;
}

export interface AnalysisResult {
  suggestedPart: string;
  suggestedMode: 'full' | 'blend' | 'newpart' | 'custom';
  suggestedPct: number;
  confidence: 'high' | 'medium' | 'low';
  detectedSide?: 'ימין' | 'שמאל';
  detectedPosition?: string;
  explanation: string;
}

const STORAGE_KEY_PREFIX = 'dalia_paint_custom_options_v1_';

export function getCompanyStorageKey(companyName: string): string {
  const sanitized = (companyName || 'general').trim().toLowerCase();
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(sanitized)}`;
}

// מילות מפתח לזיהוי סוג עבודה
const BLEND_KEYWORDS = ['טשטוש', 'טשטש', 'בלנד', 'blend', 'טשטושים', 'מעבר', 'התאמת צבע', 'התאמה'];
const NEWPART_KEYWORDS = ['חדש', 'חדשה', 'חדשים', 'חדשות', 'החלפה', 'new', 'תחליפי', 'מקורי חדש'];
const FULL_KEYWORDS = ['תיקון', 'מתוקן', 'מתוקנת', 'פחחות', 'צבע מלא', 'שפכטל', 'יישור', 'מלא', 'שיפוץ', 'שחזור'];

/**
 * מנתח שם חופשי ומחזיר שיוך מומלץ למנגנון החישוב הקיים
 */
export function analyzeCustomPartInput(
  rawInput: string,
  categoryLabel: string,
  availableParts: string[] = []
): AnalysisResult {
  const input = (rawInput || '').trim();
  const lower = input.toLowerCase();

  // 1. זיהוי סוג עבודה (Work Mode)
  let mode: 'full' | 'blend' | 'newpart' | 'custom' = 'full';
  let pct = 100;
  let workModeDetected = false;

  if (BLEND_KEYWORDS.some(kw => input.includes(kw) || lower.includes(kw))) {
    mode = 'blend';
    pct = 50;
    workModeDetected = true;
  } else if (NEWPART_KEYWORDS.some(kw => input.includes(kw) || lower.includes(kw))) {
    mode = 'newpart';
    pct = 70;
    workModeDetected = true;
  } else if (FULL_KEYWORDS.some(kw => input.includes(kw) || lower.includes(kw))) {
    mode = 'full';
    pct = 100;
    workModeDetected = true;
  } else {
    // ברירת מחדל: תיקון מלא
    mode = 'full';
    pct = 100;
  }

  // 2. זיהוי צד (ימין / שמאל)
  let detectedSide: 'ימין' | 'שמאל' | undefined;
  if (/ימין|ימני|ימנית|\brh\b|\bright\b/i.test(input)) {
    detectedSide = 'ימין';
  } else if (/שמאל|שמאלי|שמאלית|\blh\b|\bleft\b/i.test(input)) {
    detectedSide = 'שמאל';
  }

  // 3. זיהוי מיקום / פירוט
  let detectedPosition: string | undefined;
  if (/קדמי|קדמית|חזית|קדימה|\bfront\b/i.test(input)) detectedPosition = 'קדמי';
  else if (/אחורי|אחורית|אחור|\brear\b/i.test(input)) detectedPosition = 'אחורי';
  else if (/עליון|עליונה|\bupper\b/i.test(input)) detectedPosition = 'עליון';
  else if (/תחתון|תחתונה|\blower\b/i.test(input)) detectedPosition = 'תחתון';
  else if (/אמצעי|מרכזי|\bmid\b/i.test(input)) detectedPosition = 'אמצעי';

  // 4. התאמת חלק מתוך availableParts
  let bestPart = '';
  let highestScore = -1;

  for (const part of availableParts) {
    let score = 0;

    // התאמה לקטגוריה
    if (categoryLabel && part.includes(categoryLabel.split('/')[0].trim())) {
      score += 20;
    }

    // התאמה למילים בטקסט שהוקלד
    const words = input.split(/\s+/).filter(w => w.length > 1);
    for (const w of words) {
      if (part.includes(w)) {
        score += 15;
      }
    }

    // התאמת צד
    if (detectedSide) {
      if (part.includes(detectedSide)) score += 25;
      else if (detectedSide === 'ימין' && part.includes('שמאל')) score -= 20;
      else if (detectedSide === 'שמאל' && part.includes('ימין')) score -= 20;
    }

    // התאמת מיקום
    if (detectedPosition) {
      if (part.includes(detectedPosition)) score += 20;
      else if (detectedPosition === 'קדמי' && part.includes('אחורי')) score -= 15;
      else if (detectedPosition === 'אחורי' && part.includes('קדמי')) score -= 15;
    }

    // מילות מפתח מיוחדות
    if (/פלסטיק/.test(input) && part.includes('פלסטיק')) score += 20;
    if (/משקוף/.test(input) && part.includes('משקוף')) score += 20;
    if (/קורה/.test(input) && part.includes('קורה')) score += 20;
    if (/סף/.test(input) && part.includes('סף')) score += 20;
    if (/גג/.test(input) && part.includes('גג')) score += 20;
    if (/פגוש|מגן/.test(input) && (part.includes('פגוש') || part.includes('מגן'))) score += 20;
    if (/תא מטען|בגאז/.test(input) && part.includes('תא מטען')) score += 20;
    if (/מנוע/.test(input) && part.includes('מנוע')) score += 20;

    if (score > highestScore) {
      highestScore = score;
      bestPart = part;
    }
  }

  // ברירת מחדל אם אין התאמה מספקת
  if (!bestPart || highestScore < 15) {
    // נבחר חלק ברירת מחדל מהקטגוריה
    const catFamily = categoryLabel.split('/')[0].trim();
    const fallback = availableParts.find(p => p.includes(catFamily)) || availableParts[0] || 'כנף קדמית ימין';
    bestPart = fallback;
  }

  // קביעת רמת ביטחון (confidence)
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (workModeDetected && highestScore >= 35) {
    confidence = 'high';
  } else if (workModeDetected && highestScore >= 20) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  const modeDescriptions: Record<string, string> = {
    full: 'צביעה מלאה / לאחר תיקון (100%)',
    blend: 'טשטוש צבע (50%)',
    newpart: 'צביעת חלק חדש (70%)',
    custom: 'אחוז ידני',
  };

  const explanation = `זוהה שיוך: חלק בסיס [${bestPart}] • סוג עבודה: [${modeDescriptions[mode] || mode}]`;

  return {
    suggestedPart: bestPart,
    suggestedMode: mode,
    suggestedPct: pct,
    confidence,
    detectedSide,
    detectedPosition,
    explanation,
  };
}

/**
 * טעינת אפשרויות קבועות עבור חברה/מוסך מ-localStorage
 */
export function loadCompanyCustomOptions(companyName: string): FastWorkItem[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const key = getCompanyStorageKey(companyName);
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(item => item && item.key && item.label);
    }
  } catch (err) {
    console.error('Failed to load custom paint options from storage', err);
  }
  return [];
}

/**
 * שמירת אפשרות קבועה עבור חברה/מוסך
 */
export function saveCompanyCustomOption(companyName: string, item: FastWorkItem): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const existing = loadCompanyCustomOptions(companyName);
    const filtered = existing.filter(i => i.key !== item.key);
    const updated = [...filtered, { ...item, isPermanent: true, companyName }];
    const key = getCompanyStorageKey(companyName);
    window.localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save custom paint option to storage', err);
  }
}

/**
 * מחיקת אפשרות קבועה
 */
export function deleteCompanyCustomOption(companyName: string, itemKey: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const existing = loadCompanyCustomOptions(companyName);
    const updated = existing.filter(i => i.key !== itemKey);
    const key = getCompanyStorageKey(companyName);
    window.localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to delete custom paint option from storage', err);
  }
}

/**
 * עדכון אפשרות קבועה
 */
export function updateCompanyCustomOption(companyName: string, item: FastWorkItem): void {
  saveCompanyCustomOption(companyName, item);
}
